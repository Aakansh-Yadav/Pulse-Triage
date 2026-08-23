import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { getDb } from "./db/client.js";

export type Role = "patient" | "doctor" | "admin" | "staff";

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  patient_id: string | null;
  doctor_id: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      patient_id: user.patient_id,
      doctor_id: user.doctor_id,
    },
    config.jwtSecret,
    { expiresIn: "7d" },
  );
}

async function hydrateAuthUser(payload: Partial<AuthUser> & { sub?: string; email?: string }) {
  if (payload.email) {
    const byEmail = await loadUserByEmail(payload.email);
    if (byEmail) return byEmail;
  }
  const id = payload.id || payload.sub;
  if (!id) return null;
  const db = await getDb();
  const { rows } = await db.query<AuthUser>(
    `SELECT u.id, u.email, u.full_name, u.role, p.id AS patient_id, d.id AS doctor_id
     FROM users u
     LEFT JOIN patients p ON p.user_id = u.id
     LEFT JOIN doctors d ON d.user_id = u.id
     WHERE u.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function ensurePatientProfile(user: AuthUser): Promise<AuthUser> {
  if (user.role !== "patient") return user;
  if (user.patient_id) return user;
  const db = await getDb();
  await db.query(`INSERT INTO patients (id, user_id) VALUES ($1,$2)`, [crypto.randomUUID(), user.id]);
  return (await loadUserByEmail(user.email)) ?? user;
}

export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sign in required" });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as Partial<AuthUser> & { sub?: string };
    const user = await hydrateAuthUser(payload);
    if (!user) return res.status(401).json({ error: "Session expired" });
    req.user = user.role === "patient" ? await ensurePatientProfile(user) : user;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `This page needs a ${roles.join(" or ")} account.`,
      });
    }
    next();
  };
}

export async function loadUserByEmail(email: string): Promise<AuthUser | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    email: string;
    full_name: string;
    role: Role;
    patient_id: string | null;
    doctor_id: string | null;
  }>(
    `SELECT u.id, u.email, u.full_name, u.role, p.id AS patient_id, d.id AS doctor_id
     FROM users u
     LEFT JOIN patients p ON p.user_id = u.id
     LEFT JOIN doctors d ON d.user_id = u.id
     WHERE lower(u.email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
