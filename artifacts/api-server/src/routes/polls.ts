import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { PollModel, toPollShape } from "../lib/db";
import { enqueueVote } from "../lib/queue";
import { broadcastVoteUpdate } from "../lib/socketio";
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

router.post("/polls/:pollId/votes", async (req, res): Promise<void> => {
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

  enqueueVote(pollId, optionId);

  const optimisticOptions = poll.options.map((o) => ({
    id: o.id,
    text: o.text,
    votes: o.id === optionId ? o.votes + 1 : o.votes,
  }));
  broadcastVoteUpdate(pollId, optimisticOptions, poll.totalVotes + 1);

  res.status(202).json({ message: "Vote accepted", queued: true });
});

export default router;
