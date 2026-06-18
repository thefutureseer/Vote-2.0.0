import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { logger } from "./logger";

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    logger.debug({ socketId: socket.id }, "Socket.io client connected");

    socket.on("join_poll", (pollId: string) => {
      socket.join(`poll:${pollId}`);
      logger.debug({ socketId: socket.id, pollId }, "Client joined poll room");
    });

    socket.on("leave_poll", (pollId: string) => {
      socket.leave(`poll:${pollId}`);
    });

    socket.on("disconnect", () => {
      logger.debug({ socketId: socket.id }, "Socket.io client disconnected");
    });
  });

  logger.info("Socket.io initialized");
  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.io has not been initialized");
  }
  return io;
}

export function broadcastVoteUpdate(
  pollId: string,
  options: { id: string; text: string; votes: number }[],
  totalVotes: number,
): void {
  if (!io) return;
  io.to(`poll:${pollId}`).emit("vote_update", { pollId, options, totalVotes });
}
