import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, "api", ".env") });

export type PaymentProvider = "stripe" | "razorpay" | "mock" | "auto";

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "pulsetriage-demo-secret-change-me",
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  stripeSecret: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhook: process.env.STRIPE_WEBHOOK_SECRET || "",
  razorpayKey: process.env.RAZORPAY_KEY_ID || "",
  razorpaySecret: process.env.RAZORPAY_KEY_SECRET || "",
  paymentProvider: (process.env.PAYMENT_PROVIDER || "auto") as PaymentProvider,
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:3000",
  dataDir: path.join(root, "data"),
};

export function resolvePaymentProvider(): "stripe" | "razorpay" | "mock" {
  if (config.paymentProvider === "stripe" || config.paymentProvider === "razorpay" || config.paymentProvider === "mock") {
    return config.paymentProvider;
  }
  if (config.stripeSecret) return "stripe";
  if (config.razorpayKey && config.razorpaySecret) return "razorpay";
  return "mock";
}
