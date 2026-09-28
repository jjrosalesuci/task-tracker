import { z } from "zod";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://task_tracker:task_tracker@localhost:5432/task_tracker";
}
if (!process.env.APP_ORIGIN && process.env.APP_URL) {
  process.env.APP_ORIGIN = process.env.APP_URL;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/task_tracker"),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.string().transform((value) => value === "true").default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Task Tracker <no-reply@example.com>"),
});

export const config = envSchema.parse(process.env);
