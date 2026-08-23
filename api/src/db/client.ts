import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

export type QueryResult<T> = { rows: T[] };

export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(text: string): Promise<void>;
  close(): Promise<void>;
  kind: "postgres" | "pglite";
}

let client: SqlClient | null = null;

class PgClient implements SqlClient {
  kind = "postgres" as const;
  constructor(private pool: import("pg").Pool) {}
  async query<T>(text: string, params: unknown[] = []) {
    const res = await this.pool.query(text, params);
    return { rows: res.rows as T[] };
  }
  async exec(text: string) {
    await this.pool.query(text);
  }
  async close() {
    await this.pool.end();
  }
}

class PgliteClient implements SqlClient {
  kind = "pglite" as const;
  constructor(private db: import("@electric-sql/pglite").PGlite) {}
  async query<T>(text: string, params: unknown[] = []) {
    const res = await this.db.query(text, params);
    return { rows: res.rows as T[] };
  }
  async exec(text: string) {
    await this.db.exec(text);
  }
  async close() {
    try {
      await this.db.syncToFs();
    } catch {
      /* flush is best-effort */
    }
    await this.db.close();
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryOpenPglite(dataPath: string, clearPid: boolean) {
  const { PGlite } = await import("@electric-sql/pglite");
  if (clearPid) {
    try {
      await fs.unlink(path.join(dataPath, "postmaster.pid"));
    } catch {
      /* no stale lock file */
    }
  }
  const db = new PGlite(dataPath);
  await db.waitReady;
  await db.query("SELECT 1");
  return db;
}

async function resetDataDir(dataPath: string) {
  const backup = `${dataPath}-corrupt-${Date.now()}`;
  try {
    await fs.rename(dataPath, backup);
    console.warn(`[db] moved unusable data dir to ${path.basename(backup)}`);
  } catch {
    await fs.rm(dataPath, { recursive: true, force: true });
  }
  await fs.mkdir(dataPath, { recursive: true });
}

async function openPglite(dataPath: string) {
  await fs.mkdir(dataPath, { recursive: true });
  const delays = [0, 400, 800, 1200, 2000, 3000];
  let lastErr: Error | undefined;
  for (const [i, ms] of delays.entries()) {
    if (ms) await sleep(ms);
    try {
      return await tryOpenPglite(dataPath, i >= 2);
    } catch (err) {
      lastErr = err as Error;
      console.warn("[db] waiting to open PGlite:", lastErr.message);
    }
  }
  console.warn("[db] existing PGlite data is unusable, recreating:", lastErr?.message);
  await resetDataDir(dataPath);
  return tryOpenPglite(dataPath, true);
}

export async function getDb(): Promise<SqlClient> {
  if (client) return client;

  if (config.databaseUrl.startsWith("postgres")) {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: config.databaseUrl });
      await pool.query("SELECT 1");
      client = new PgClient(pool);
      console.log("[db] connected to PostgreSQL");
      return client;
    } catch (err) {
      console.warn("[db] PostgreSQL unavailable, falling back to embedded PGlite:", (err as Error).message);
    }
  }

  await fs.mkdir(config.dataDir, { recursive: true });
  const dataPath = path.join(config.dataDir, "pglite");
  const db = await openPglite(dataPath);
  client = new PgliteClient(db);
  console.log(`[db] using embedded PostgreSQL (PGlite) at ${path.relative(path.dirname(config.dataDir), dataPath)}`);
  return client;
}

export async function closeDb() {
  if (!client) return;
  try {
    await client.close();
  } catch (err) {
    console.warn("[db] close failed:", (err as Error).message);
  }
  client = null;
}

export async function migrate() {
  const db = await getDb();
  const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const sql = await fs.readFile(schemaPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    try {
      await db.query(stmt);
    } catch (err) {
      console.warn("[migrate] skipped:", stmt.slice(0, 72).replace(/\s+/g, " "), "-", (err as Error).message);
    }
  }
}

export function asJson(value: unknown) {
  return JSON.stringify(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
