import { PollModel } from "./db";
import { broadcastVoteUpdate } from "./socketio";
import { logger } from "./logger";
import { hashVoterId } from "./voteHash";
import type { AnyBulkWriteOperation } from "mongoose";
import type { IPoll } from "./db";

interface QueuedVote {
  pollId: string;
  optionId: string;
  userId: string;
}

const voteQueue: QueuedVote[] = [];

// Tracks users whose votes are enqueued but not yet flushed to MongoDB, so
// double-voting can be blocked immediately without waiting for the next
// batch flush to persist `votedUserIds`.
const pendingUserVotes = new Map<string, Set<string>>();

export function enqueueVote(pollId: string, optionId: string, userId: string): void {
  voteQueue.push({ pollId, optionId, userId });
  if (!pendingUserVotes.has(pollId)) {
    pendingUserVotes.set(pollId, new Set());
  }
  pendingUserVotes.get(pollId)!.add(userId);
}

export function hasPendingVote(pollId: string, userId: string): boolean {
  return pendingUserVotes.get(pollId)?.has(userId) ?? false;
}

async function flushQueue(): Promise<void> {
  if (voteQueue.length === 0) return;

  const toFlush = voteQueue.splice(0, voteQueue.length);

  // pollId -> optionId -> count
  const optionCounts = new Map<string, Map<string, number>>();
  // pollId -> Set of userIds who voted this cycle
  const pollUserIds = new Map<string, Set<string>>();

  for (const vote of toFlush) {
    if (!optionCounts.has(vote.pollId)) {
      optionCounts.set(vote.pollId, new Map());
    }
    const optMap = optionCounts.get(vote.pollId)!;
    optMap.set(vote.optionId, (optMap.get(vote.optionId) ?? 0) + 1);

    if (!pollUserIds.has(vote.pollId)) {
      pollUserIds.set(vote.pollId, new Set());
    }
    pollUserIds.get(vote.pollId)!.add(vote.userId);
  }

  const ops: AnyBulkWriteOperation<IPoll>[] = [];
  for (const [pollId, optMap] of optionCounts) {
    const inc: Record<string, number> = {};
    for (const [optionId, count] of optMap) {
      inc[`options.$[opt${optionId.replace(/[^a-zA-Z0-9]/g, "")}].votes`] = count;
      inc.totalVotes = (inc.totalVotes ?? 0) + count;
    }

    // Anonymize every voter identity right at the database boundary: the raw
    // Clerk/demo user ID is only ever used in-memory (for the pending-vote
    // dedupe check); what actually gets persisted is a one-way HMAC-SHA256
    // hash, so `votedUserIds` in MongoDB never contains a reversible identity.
    const userIds = Array.from(pollUserIds.get(pollId) ?? []);
    const hashedUserIds = userIds.map(hashVoterId);
    const arrayFilters = Array.from(optMap.keys()).map((optionId) => ({
      [`opt${optionId.replace(/[^a-zA-Z0-9]/g, "")}.id`]: optionId,
    }));

    ops.push({
      updateOne: {
        filter: { _id: pollId },
        update: {
          $inc: inc,
          $push: { votedUserIds: { $each: hashedUserIds } },
        },
        arrayFilters,
      },
    });
  }

  if (ops.length === 0) return;

  try {
    await PollModel.bulkWrite(ops);

    for (const pollId of optionCounts.keys()) {
      const updated = await PollModel.findById(pollId);
      if (updated) {
        broadcastVoteUpdate(
          pollId,
          updated.options.map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
          updated.totalVotes,
        );
      }
    }

    // Successfully persisted — clear the pending markers for this batch.
    for (const [pollId, userIds] of pollUserIds) {
      const pendingSet = pendingUserVotes.get(pollId);
      if (!pendingSet) continue;
      for (const userId of userIds) pendingSet.delete(userId);
      if (pendingSet.size === 0) pendingUserVotes.delete(pollId);
    }
  } catch (err) {
    logger.error({ err }, "Error flushing vote batch via bulkWrite");
    // Re-queue the whole failed batch to retry on the next cycle. Pending
    // markers stay in place since the votes are still un-persisted.
    voteQueue.unshift(...toFlush);
  }
}

export function startBatchFlusher(intervalMs = 3000): NodeJS.Timeout {
  logger.info({ intervalMs }, "Starting vote batch flusher");
  return setInterval(() => {
    flushQueue().catch((err) => {
      logger.error({ err }, "Unhandled error in batch flusher");
    });
  }, intervalMs);
}
