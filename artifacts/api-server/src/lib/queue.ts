import { PollModel } from "./db";
import { broadcastVoteUpdate } from "./socketio";
import { logger } from "./logger";

interface QueuedVote {
  pollId: string;
  optionId: string;
}

const voteQueue: QueuedVote[] = [];

export function enqueueVote(pollId: string, optionId: string): void {
  voteQueue.push({ pollId, optionId });
}

async function flushQueue(): Promise<void> {
  if (voteQueue.length === 0) return;

  const toFlush = voteQueue.splice(0, voteQueue.length);

  const aggregated = new Map<string, Map<string, number>>();
  for (const vote of toFlush) {
    if (!aggregated.has(vote.pollId)) {
      aggregated.set(vote.pollId, new Map());
    }
    const optMap = aggregated.get(vote.pollId)!;
    optMap.set(vote.optionId, (optMap.get(vote.optionId) ?? 0) + 1);
  }

  for (const [pollId, optMap] of aggregated) {
    try {
      for (const [optionId, count] of optMap) {
        await PollModel.updateOne(
          { _id: pollId, "options.id": optionId },
          { $inc: { "options.$.votes": count, totalVotes: count } },
        );
      }

      const updated = await PollModel.findById(pollId);
      if (updated) {
        broadcastVoteUpdate(
          pollId,
          updated.options.map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
          updated.totalVotes,
        );
      }
    } catch (err) {
      logger.error({ err, pollId }, "Error flushing votes for poll");
      for (const [optionId, count] of optMap) {
        for (let i = 0; i < count; i++) {
          voteQueue.unshift({ pollId, optionId });
        }
      }
    }
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
