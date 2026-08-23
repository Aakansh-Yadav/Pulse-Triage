import Redis from "ioredis";
import { config } from "./config.js";

export type QueueMember = { id: string; score: number };

type Listener = (channel: string, message: string) => void;

export interface LiveStore {
  kind: "redis" | "memory";
  zadd(key: string, score: number, member: string): Promise<void>;
  zrem(key: string, member: string): Promise<void>;
  zrange(key: string): Promise<QueueMember[]>;
  del(key: string): Promise<void>;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, listener: Listener): Promise<void>;
}

class MemoryStore implements LiveStore {
  kind = "memory" as const;
  private zsets = new Map<string, Map<string, number>>();
  private listeners = new Map<string, Set<Listener>>();

  async zadd(key: string, score: number, member: string) {
    if (!this.zsets.has(key)) this.zsets.set(key, new Map());
    this.zsets.get(key)!.set(member, score);
  }
  async zrem(key: string, member: string) {
    this.zsets.get(key)?.delete(member);
  }
  async zrange(key: string) {
    const set = this.zsets.get(key);
    if (!set) return [];
    return [...set.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  }
  async del(key: string) {
    this.zsets.delete(key);
  }
  async publish(channel: string, message: string) {
    for (const fn of this.listeners.get(channel) ?? []) fn(channel, message);
  }
  async subscribe(channel: string, listener: Listener) {
    if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
    this.listeners.get(channel)!.add(listener);
  }
}

class RedisStore implements LiveStore {
  kind = "redis" as const;
  constructor(
    private client: Redis,
    private sub: Redis,
  ) {}
  async zadd(key: string, score: number, member: string) {
    await this.client.zadd(key, score, member);
  }
  async zrem(key: string, member: string) {
    await this.client.zrem(key, member);
  }
  async zrange(key: string) {
    const raw = await this.client.zrange(key, 0, -1, "WITHSCORES");
    const out: QueueMember[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      out.push({ id: raw[i], score: Number(raw[i + 1]) });
    }
    return out;
  }
  async del(key: string) {
    await this.client.del(key);
  }
  async publish(channel: string, message: string) {
    await this.client.publish(channel, message);
  }
  async subscribe(channel: string, listener: Listener) {
    await this.sub.subscribe(channel);
    this.sub.on("message", listener);
  }
}

let store: LiveStore | null = null;

export const SCHEDULE_CHANNEL = "schedule:updates";

export function queueKey(doctorId: string) {
  return `queue:doctor:${doctorId}`;
}

/** First registration, first serve. Earlier created_at always wins. */
export function queueScore(_severity: "high" | "low", createdAt: Date, _riskScore = 0) {
  return createdAt.getTime();
}

export async function getLiveStore(): Promise<LiveStore> {
  if (store) return store;
  if (config.redisUrl) {
    try {
      const client = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
      await client.connect();
      await client.ping();
      const sub = new Redis(config.redisUrl);
      store = new RedisStore(client, sub);
      console.log("[redis] connected");
      return store;
    } catch (err) {
      console.warn("[redis] unavailable, using in-memory live queue:", (err as Error).message);
    }
  }
  store = new MemoryStore();
  console.log("[redis] using in-memory live queue");
  return store;
}
