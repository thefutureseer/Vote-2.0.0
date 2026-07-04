import mongoose, { Schema, Document } from "mongoose";
import { logger } from "./logger";

export interface IPollOption {
  id: string;
  text: string;
  votes: number;
}

export interface IPoll extends Document {
  question: string;
  options: IPollOption[];
  totalVotes: number;
  votedUserIds: string[];
  createdAt: Date;
}

export interface IAlert extends Document {
  type: string;
  ip: string;
  pollId?: string;
  userId?: string;
  message: string;
  createdAt: Date;
}

const PollOptionSchema = new Schema<IPollOption>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    votes: { type: Number, default: 0 },
  },
  { _id: false },
);

const PollSchema = new Schema<IPoll>({
  question: { type: String, required: true },
  options: { type: [PollOptionSchema], required: true },
  totalVotes: { type: Number, default: 0 },
  // Server-side source of truth for anti-cheat: Clerk user IDs that have
  // already voted on this poll. Strictly blocks double-voting regardless
  // of client-side (localStorage) state.
  votedUserIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const AlertSchema = new Schema<IAlert>({
  type: { type: String, required: true },
  ip: { type: String, required: true },
  pollId: { type: String },
  userId: { type: String },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const PollModel = mongoose.model<IPoll>("Poll", PollSchema);
export const AlertModel = mongoose.model<IAlert>("Alert", AlertSchema);

export async function connectMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  await mongoose.connect(uri);
  logger.info("Connected to MongoDB");

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });
}

export function toPollShape(doc: IPoll) {
  return {
    id: (doc._id as mongoose.Types.ObjectId).toHexString(),
    question: doc.question,
    options: doc.options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: o.votes,
    })),
    totalVotes: doc.totalVotes,
    createdAt: doc.createdAt.toISOString(),
  };
}
