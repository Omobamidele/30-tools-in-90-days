import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db/client";
import { users, sessions, authAccounts, verifications } from "@/db/schema";
import { env } from "@/env";

// Accounts are created by admins (invite) or the seed script, never by public sign-up.
export const auth = betterAuth({
  baseURL: env().APP_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user: users, session: sessions, account: authAccounts, verification: verifications },
  }),
  advanced: { database: { generateId: "uuid" } },
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  // On in production. The default of ~3 sign-ins per 10 s per IP locks out a team sharing an
  // office connection; 20 a minute still stops password guessing.
  rateLimit: { window: 60, max: 300, customRules: { "/sign-in/email": { window: 60, max: 20 } } },
  user: {
    additionalFields: {
      orgId: { type: "string", required: false, input: false },
      role: { type: "string", required: false, input: false },
      status: { type: "string", required: false, input: false },
    },
  },
  plugins: [nextCookies()],
});
