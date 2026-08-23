import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "../db/client.js";
import { authRequired, loadUserByEmail, signToken, wrap } from "../auth.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  wrap(async (req, res) => {
    const body = z.object({ email: z.string().trim().email(), password: z.string().min(4) }).parse(req.body);
    const db = await getDb();
    const { rows } = await db.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE lower(email) = lower($1)`,
      [body.email],
    );
    const row = rows[0];
    if (!row) {
      return res.status(401).json({ error: "No account found for this email. Create an account first." });
    }
    if (!(await bcrypt.compare(body.password, row.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const user = await loadUserByEmail(body.email);
    if (!user) return res.status(401).json({ error: "No account found for this email. Create an account first." });
    res.json({ token: signToken(user), user });
  }),
);

authRouter.post(
  "/register",
  wrap(async (req, res) => {
    const body = z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(6),
        fullName: z.string().trim().min(2),
        role: z.enum(["patient", "doctor"]).default("patient"),
        specialty: z.string().optional(),
      })
      .parse(req.body);
    const db = await getDb();
    const exists = await db.query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [body.email]);
    if (exists.rows.length) return res.status(409).json({ error: "Email already registered" });
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(body.password, 10);
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, role) VALUES ($1,$2,$3,$4,$5)`,
      [id, body.email.toLowerCase(), hash, body.fullName, body.role],
    );
    if (body.role === "patient") {
      await db.query(`INSERT INTO patients (id, user_id) VALUES ($1,$2)`, [crypto.randomUUID(), id]);
    } else {
      await db.query(
        `INSERT INTO doctors (id, user_id, specialty, stripe_account_id) VALUES ($1,$2,$3,$4)`,
        [crypto.randomUUID(), id, body.specialty || "General Practice", `acct_demo_${id.slice(0, 6)}`],
      );
    }
    const user = await loadUserByEmail(body.email);
    res.status(201).json({ token: signToken(user!), user });
  }),
);

authRouter.get(
  "/me",
  authRequired,
  wrap(async (req, res) => {
    const user = await loadUserByEmail(req.user!.email);
    res.json({ user });
  }),
);
