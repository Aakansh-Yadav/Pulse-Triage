import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { loadUserByEmail, type AuthUser } from "./auth.js";
import { getLiveStore, SCHEDULE_CHANNEL } from "./redis.js";

type Client = { ws: WebSocket; user: AuthUser };

const clients = new Set<Client>();

export function attachWebsocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token") || "";
    let user: AuthUser | null = null;
    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthUser & { sub?: string };
      user = (payload.email ? await loadUserByEmail(payload.email) : null) ?? payload;
    } catch {
      ws.close(4401, "unauthorized");
      return;
    }
    if (!user) {
      ws.close(4401, "unauthorized");
      return;
    }
    const client = { ws, user };
    clients.add(client);
    ws.send(JSON.stringify({ type: "hello", role: user.role, userId: user.id }));
    ws.on("close", () => clients.delete(client));
  });
}

export function broadcast(payload: unknown, filter?: (user: AuthUser) => boolean) {
  const data = JSON.stringify(payload);
  for (const c of clients) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    if (filter && !filter(c.user)) continue;
    c.ws.send(data);
  }
}

export async function startSchedulePump() {
  const store = await getLiveStore();
  await store.subscribe(SCHEDULE_CHANNEL, (_ch, message) => {
    try {
      const payload = JSON.parse(message);
      broadcast(payload);
    } catch {
      broadcast({ type: "schedule.updated" });
    }
  });
}
