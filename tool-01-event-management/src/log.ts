import { randomBytes } from "node:crypto";
import pino from "pino";

// Structured JSON logs (one line per event) so a hosted log drain can search them.
// The level comes from LOG_LEVEL; read directly so scripts and tests needn't load full env.
export const log = pino({ level: process.env.LOG_LEVEL ?? "info", base: { app: "exposure-register" } });

/** Short reference shown to the user and written to the log, so support can find the entry. */
export function newRef(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
