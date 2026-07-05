import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bulkWriteMock = vi.fn().mockResolvedValue({});
const findByIdMock = vi.fn().mockResolvedValue(null);
const broadcastVoteUpdateMock = vi.fn();
const hashVoterIdMock = vi.fn((userId: string) => `hashed:${userId}`);

vi.mock("./db", () => ({
  PollModel: {
    bulkWrite: bulkWriteMock,
    findById: findByIdMock,
  },
}));

vi.mock("./socketio", () => ({
  broadcastVoteUpdate: broadcastVoteUpdateMock,
}));

vi.mock("./voteHash", () => ({
  hashVoterId: hashVoterIdMock,
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("vote batch queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bulkWriteMock.mockClear();
    findByIdMock.mockClear();
    broadcastVoteUpdateMock.mockClear();
    hashVoterIdMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("groups multiple queued votes for the same poll/option into a single consolidated bulkWrite op", async () => {
    const { enqueueVote, startBatchFlusher } = await import("./queue");

    enqueueVote("poll-1", "option-a", "user-1");
    enqueueVote("poll-1", "option-a", "user-2");
    enqueueVote("poll-1", "option-a", "user-3");

    startBatchFlusher(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(bulkWriteMock).toHaveBeenCalledTimes(1);
    const ops = bulkWriteMock.mock.calls[0]?.[0];
    expect(ops).toHaveLength(1);

    const op = ops[0].updateOne;
    expect(op.filter).toEqual({ _id: "poll-1" });
    // Three votes for the same option should be consolidated into a single
    // $inc of 3, not three separate increments.
    expect(op.update.$inc["totalVotes"]).toBe(3);
    expect(Object.values(op.update.$inc).find((v) => v === 3)).toBe(3);
    // All three (deduplicated) voter hashes should be pushed in one $push.
    expect(op.update.$push.votedUserIds.$each.sort()).toEqual(
      ["hashed:user-1", "hashed:user-2", "hashed:user-3"].sort(),
    );
  });

  it("groups votes across multiple options for the same poll into one op with separate increments", async () => {
    const { enqueueVote, startBatchFlusher } = await import("./queue");

    enqueueVote("poll-2", "option-a", "user-1");
    enqueueVote("poll-2", "option-b", "user-2");
    enqueueVote("poll-2", "option-b", "user-3");

    startBatchFlusher(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(bulkWriteMock).toHaveBeenCalledTimes(1);
    const ops = bulkWriteMock.mock.calls[0]?.[0];
    expect(ops).toHaveLength(1);

    const inc = ops[0].updateOne.update.$inc;
    expect(inc["totalVotes"]).toBe(3);
    const optionIncrements = Object.entries(inc).filter(([key]) => key !== "totalVotes");
    expect(optionIncrements).toHaveLength(2);
    const incrementValues = optionIncrements.map(([, value]) => value).sort();
    expect(incrementValues).toEqual([1, 2]);
  });

  it("separates votes for different polls into distinct bulkWrite ops", async () => {
    const { enqueueVote, startBatchFlusher } = await import("./queue");

    enqueueVote("poll-a", "option-x", "user-1");
    enqueueVote("poll-b", "option-y", "user-2");

    startBatchFlusher(10);
    await vi.advanceTimersByTimeAsync(10);

    expect(bulkWriteMock).toHaveBeenCalledTimes(1);
    const ops = bulkWriteMock.mock.calls[0]?.[0];
    expect(ops).toHaveLength(2);
    const pollIds = ops.map((op: { updateOne: { filter: { _id: string } } }) => op.updateOne.filter._id).sort();
    expect(pollIds).toEqual(["poll-a", "poll-b"]);
  });

  it("deduplicates repeated votes from the same user within a single flush cycle", async () => {
    const { enqueueVote, startBatchFlusher } = await import("./queue");

    enqueueVote("poll-3", "option-a", "user-1");
    enqueueVote("poll-3", "option-a", "user-1");

    startBatchFlusher(10);
    await vi.advanceTimersByTimeAsync(10);

    const ops = bulkWriteMock.mock.calls[0]?.[0];
    const op = ops[0].updateOne;
    // Same user voting twice in one batch still only produces one hashed
    // entry in votedUserIds (Set-based dedupe), even though the vote count
    // itself reflects both queued votes.
    expect(op.update.$push.votedUserIds.$each).toEqual(["hashed:user-1"]);
    expect(op.update.$inc["totalVotes"]).toBe(2);
  });
});
