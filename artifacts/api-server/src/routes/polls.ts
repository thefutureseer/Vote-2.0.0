import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { PollModel, AlertModel, toPollShape } from "../lib/db";
import { enqueueVote, hasPendingVote } from "../lib/queue";
import { broadcastVoteUpdate } from "../lib/socketio";
import { logger } from "../lib/logger";
import { hashVoterId } from "../lib/voteHash";
import {
  ListPollsResponse,
  CreatePollBody,
  GetPollResponse,
  GetPollParams,
  DeletePollParams,
  CastVoteParams,
  CastVoteBody,
  GetPollStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Demo/guest voter IDs are self-issued by the client (not backed by a real
// Clerk session) so anonymous visitors can try the app. Validate the shape
// strictly so this header can't be abused to inject arbitrary identities.
const DEMO_USER_ID_PATTERN = /^user_demo_[a-zA-Z0-9]{6,24}$/;

function resolveVoterId(req: import("express").Request): string | null {
  const { userId } = getAuth(req);
  if (userId) return userId;

  const demoHeader = req.headers["x-demo-user-id"];
  const demoId = Array.isArray(demoHeader) ? demoHeader[0] : demoHeader;
  if (demoId && DEMO_USER_ID_PATTERN.test(demoId)) {
    return demoId;
  }

  return null;
}

// 3 votes/minute per IP. On rejection, log a "ballot-stuffing" style alert
// to MongoDB instead of silently dropping the request.
const voteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => ipKeyGenerator(req.ip ?? "unknown"),
  handler: async (req, res): Promise<void> => {
    const pollId = String(req.params.pollId);
    try {
      await AlertModel.create({
        type: "rate_limit_exceeded",
        ip: req.ip ?? "unknown",
        pollId,
        userId: resolveVoterId(req) ?? undefined,
        message: `Vote rate limit exceeded for poll ${pollId}`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to write rate-limit alert to MongoDB");
    }
    res.status(429).json({ error: "Too many vote attempts. Please slow down." });
  },
});

router.get("/polls", async (_req, res): Promise<void> => {
  const polls = await PollModel.find().sort({ createdAt: -1 }).lean();
  const shaped = polls.map((p) => ({
    id: p._id.toString(),
    question: p.question,
    options: p.options.map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
    totalVotes: p.totalVotes,
    createdAt: p.createdAt.toISOString(),
  }));
  res.json(ListPollsResponse.parse(shaped));
});

router.post("/polls", async (req, res): Promise<void> => {
  const parsed = CreatePollBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { question, options } = parsed.data;
  const pollOptions = options.map((text) => ({
    id: randomUUID(),
    text,
    votes: 0,
  }));

  const poll = await PollModel.create({ question, options: pollOptions, totalVotes: 0 });
  res.status(201).json(GetPollResponse.parse(toPollShape(poll)));
});

router.get("/polls/stats", async (_req, res): Promise<void> => {
  const [totalPolls, votesAgg] = await Promise.all([
    PollModel.countDocuments(),
    PollModel.aggregate([{ $group: { _id: null, total: { $sum: "$totalVotes" } } }]),
  ]);
  const totalVotes = votesAgg[0]?.total ?? 0;

  const topPoll = await PollModel.findOne().sort({ totalVotes: -1 }).lean();
  const mostVotedPoll = topPoll
    ? { id: topPoll._id.toString(), question: topPoll.question, totalVotes: topPoll.totalVotes }
    : null;

  res.json(GetPollStatsResponse.parse({ totalPolls, totalVotes, mostVotedPoll }));
});

router.get("/polls/:pollId", async (req, res): Promise<void> => {
  const params = GetPollParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const poll = await PollModel.findById(params.data.pollId);
  if (!poll) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }

  res.json(GetPollResponse.parse(toPollShape(poll)));
});

router.delete("/polls/:pollId", async (req, res): Promise<void> => {
  const params = DeletePollParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await PollModel.findByIdAndDelete(params.data.pollId);
  if (!deleted) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }

  res.sendStatus(204);
});

router.post(
  "/polls/:pollId/votes",
  voteRateLimiter,
  async (req, res): Promise<void> => {
    const params = CastVoteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = CastVoteBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { pollId } = params.data;
    const { optionId } = body.data;

    // Accepts either a real Clerk session or a self-issued demo/guest ID
    // (see resolveVoterId) — both are subject to the same anti-double-vote
    // and rate-limit checks below.
    const userId = resolveVoterId(req);
    if (!userId) {
      res.status(401).json({ error: "Authentication required to vote" });
      return;
    }

    const poll = await PollModel.findById(pollId);
    if (!poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }

    const validOption = poll.options.some((o) => o.id === optionId);
    if (!validOption) {
      res.status(400).json({ error: "Invalid option ID" });
      return;
    }

    // Strict server-side anti-cheat: the persisted `votedUserIds` array only
    // ever contains anonymized hashes (see queue.ts), never raw identities,
    // so we hash the resolved voter ID the same way before comparing. The
    // in-flight (not-yet-flushed) check still uses the raw ID purely as an
    // in-memory key — it is never persisted.
    const voterHash = hashVoterId(userId);
    if (poll.votedUserIds.includes(voterHash) || hasPendingVote(pollId, userId)) {
      res.status(403).json({ error: "Double-voting detected: this voter has already cast a ballot on this poll" });
      return;
    }

    enqueueVote(pollId, optionId, userId);

    const optimisticOptions = poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: o.id === optionId ? o.votes + 1 : o.votes,
    }));
    broadcastVoteUpdate(pollId, optimisticOptions, poll.totalVotes + 1);

    res.status(202).json({ message: "Vote accepted", queued: true });
  },
);

export default router;
