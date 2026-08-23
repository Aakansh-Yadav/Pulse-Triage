import http from "node:http";
import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config, resolvePaymentProvider } from "./config.js";
import { closeDb, migrate } from "./db/client.js";
import { seedIfEmpty, seedStaffIfMissing } from "./db/seed.js";
import { getLiveStore } from "./redis.js";
import { authRouter } from "./routes/auth.js";
import { triageRouter } from "./routes/triage.js";
import { doctorRouter } from "./routes/doctors.js";
import { appointmentRouter } from "./routes/appointments.js";
import { paymentsRouter } from "./routes/payments.js";
import { staffRouter, patientAssistRouter } from "./routes/staff.js";
import { attachWebsocket, startSchedulePump } from "./ws.js";
import { hydrateAllQueues } from "./services/scheduler.js";

function isDevOrigin(origin?: string) {
  if (!origin) return true;
  if (origin === config.webOrigin) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin);
}

const app = express();
app.use(
  cors({
    origin: (origin, cb) => cb(null, isDevOrigin(origin)),
    credentials: true,
  }),
);
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  }),
);

app.get("/health", async (_req, res) => {
  const store = await getLiveStore();
  res.json({
    ok: true,
    service: "pulsetriage-api",
    payments: resolvePaymentProvider(),
    openai: Boolean(config.openaiKey),
    liveQueue: store.kind,
  });
});

app.use("/api/auth", authRouter);
app.use("/api/triage", triageRouter);
app.use("/api/doctors", doctorRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/staff", staffRouter);
app.use("/api", patientAssistRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request", details: err.flatten() });
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "Server error" });
});

const server = http.createServer(app);
attachWebsocket(server);

async function main() {
  await migrate();
  await seedIfEmpty();
  await seedStaffIfMissing();
  await getLiveStore();
  await startSchedulePump();
  try {
    await hydrateAllQueues();
  } catch (err) {
    console.warn("[scheduler] initial hydrate skipped:", (err as Error).message);
  }
  server.listen(config.port, () => {
    console.log(`PulseTriage API on http://localhost:${config.port}`);
    console.log(`WebSocket      ws://localhost:${config.port}/ws`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function shutdown() {
  server.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
