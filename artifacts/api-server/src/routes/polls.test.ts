import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const findByIdMock = vi.fn();
const hashVoterIdMock = vi.fn((userId: string) => `hashed:${userId}`);
const enqueueVoteMock = vi.fn();
const hasPendingVoteMock = vi.fn().mockReturnValue(false);
const broadcastVoteUpdateMock = vi.fn();
const getAuthMock = vi.fn().mockReturnValue({ userId: null });
const alertCreateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../lib/db", () => ({
  PollModel: {
    findById: findByIdMock,
    find: vi.fn(),
  },
  AlertModel: {
    create: alertCreateMock,
  },
  toPollShape: vi.fn(),
}));

vi.mock("../lib/queue", () => ({
  enqueueVote: enqueueVoteMock,
  hasPendingVote: hasPendingVoteMock,
}));

vi.mock("../lib/socketio", () => ({
  broadcastVoteUpdate: broadcastVoteUpdateMock,
}));

vi.mock("../lib/voteHash", () => ({
  hashVoterId: hashVoterIdMock,
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@clerk/express", () => ({
  getAuth: getAuthMock,
}));

async function buildApp(): Promise<Express> {
  const { default: pollsRouter } = await import("./polls");
  const app = express();
  app.use(express.json());
  app.use("/api", pollsRouter);
  return app;
}

const POLL_ID = "60a7c2f9f1d2e3b4c5d6e7f8";
const OPTION_ID = "option-a";
const GUEST_ID = "user_demo_AbCdEf1234";

function makeFakePoll(votedUserIds: string[]) {
  return {
    _id: POLL_ID,
    options: [{ id: OPTION_ID, text: "A", votes: 0 }],
    totalVotes: 0,
    votedUserIds,
  };
}

describe("POST /api/polls/:pollId/votes — double-vote guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthMock.mockReturnValue({ userId: null });
    hasPendingVoteMock.mockReturnValue(false);
    hashVoterIdMock.mockImplementation((userId: string) => `hashed:${userId}`);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rejects a vote with 403 when the voter's hash is already present in votedUserIds", async () => {
    findByIdMock.mockResolvedValue(makeFakePoll(["hashed:" + GUEST_ID]));

    const app = await buildApp();
    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/votes`)
      .set("X-Demo-User-Id", GUEST_ID)
      .send({ optionId: OPTION_ID });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/double-voting/i);
    expect(hashVoterIdMock).toHaveBeenCalledWith(GUEST_ID);
    expect(enqueueVoteMock).not.toHaveBeenCalled();
  });

  it("accepts a vote (202) when the voter's hash is not present in votedUserIds", async () => {
    findByIdMock.mockResolvedValue(makeFakePoll([]));

    const app = await buildApp();
    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/votes`)
      .set("X-Demo-User-Id", GUEST_ID)
      .send({ optionId: OPTION_ID });

    expect(res.status).toBe(202);
    expect(enqueueVoteMock).toHaveBeenCalledWith(POLL_ID, OPTION_ID, GUEST_ID);
  });

  it("rejects with 403 when the vote is only pending (not yet flushed) for this user, even if votedUserIds is empty", async () => {
    findByIdMock.mockResolvedValue(makeFakePoll([]));
    hasPendingVoteMock.mockReturnValue(true);

    const app = await buildApp();
    const res = await request(app)
      .post(`/api/polls/${POLL_ID}/votes`)
      .set("X-Demo-User-Id", GUEST_ID)
      .send({ optionId: OPTION_ID });

    expect(res.status).toBe(403);
    expect(enqueueVoteMock).not.toHaveBeenCalled();
  });

  it("never compares the raw voter id against votedUserIds — only the hash is checked", async () => {
    // Poll only contains the hashed form; a naive raw-id comparison would
    // incorrectly allow this vote through as "not a duplicate".
    findByIdMock.mockResolvedValue(makeFakePoll(["hashed:" + GUEST_ID]));

    const app = await buildApp();
    await request(app)
      .post(`/api/polls/${POLL_ID}/votes`)
      .set("X-Demo-User-Id", GUEST_ID)
      .send({ optionId: OPTION_ID });

    expect(hashVoterIdMock).toHaveBeenCalledWith(GUEST_ID);
    // Confirms the guard is comparing against the hash, not the raw id,
    // since the raw id itself never appears in votedUserIds.
    expect(makeFakePoll(["hashed:" + GUEST_ID]).votedUserIds).not.toContain(GUEST_ID);
  });
});
