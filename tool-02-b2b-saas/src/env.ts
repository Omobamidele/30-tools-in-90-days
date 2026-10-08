import { z } from "zod";

// Validated once per process. Required values fail fast with a readable message;
// optional integrations fall back to their "disabled" adapter and say so in Settings.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3002"),
  CLIENT_CONFIG: z.string().default("demo"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Postgres connection string)"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().min(16).optional(),
  EMAIL_DRIVER: z.enum(["smtp", "resend", "disabled"]).default("disabled"),
  SMTP_URL: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Signal Desk <no-reply@localhost>"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${lines}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
