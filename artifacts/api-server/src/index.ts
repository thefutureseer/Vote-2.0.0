import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { connectMongo } from "./lib/db";
import { initSocketIO } from "./lib/socketio";
import { startBatchFlusher } from "./lib/queue";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);

initSocketIO(httpServer);
startBatchFlusher(3000);

connectMongo()
  .then(() => {
    httpServer.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to MongoDB — exiting");
    process.exit(1);
  });
