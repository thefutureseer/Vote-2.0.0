import { io } from "socket.io-client";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
export const socket = io({ path: BASE + "/socket.io" });
