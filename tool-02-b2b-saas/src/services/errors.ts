import { log, newRef } from "@/log";
import { ZodError } from "zod";

export type ErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "INVALID_STATE"
  | "EXTERNAL_SERVICE_FAILED";

export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("NOT_FOUND", `${what} was not found or you don't have access to it.`);
export const forbidden = (message = "You don't have permission to do that. Ask an admin or RevOps.") =>
  new DomainError("FORBIDDEN", message);
export const conflict = (message: string) => new DomainError("CONFLICT", message);
export const invalidState = (message: string) => new DomainError("INVALID_STATE", message);
export const validation = (message: string, fieldErrors: Record<string, string> = {}) =>
  new DomainError("VALIDATION_FAILED", message, fieldErrors);

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors: Record<string, string> } };

export function fromZod(err: ZodError): DomainError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return validation("Some fields need attention.", fieldErrors);
}

/** Parses service input; validation failures become DomainErrors with field paths. */
export function parseInput<S extends { safeParse: (v: unknown) => { success: true; data: unknown } | { success: false; error: ZodError } }>(
  schema: S,
  raw: unknown,
): Extract<ReturnType<S["safeParse"]>, { success: true }>["data"] {
  const res = schema.safeParse(raw);
  if (!res.success) throw fromZod(res.error);
  return res.data as Extract<ReturnType<S["safeParse"]>, { success: true }>["data"];
}

/** Wraps a service call for a server action: domain errors become user-facing results. */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const e = err instanceof ZodError ? fromZod(err) : err;
    if (e instanceof DomainError) {
      return { ok: false, error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } };
    }
    // Next's redirect/notFound are control flow, not errors.
    if (err && typeof err === "object" && "digest" in err) throw err;
    const ref = newRef();
    log.error({ err, ref }, "unexpected error in server action");
    return {
      ok: false,
      error: { code: "EXTERNAL_SERVICE_FAILED", message: `Something went wrong saving this. Try again. If it keeps happening, quote reference ${ref}.`, fieldErrors: {} },
    };
  }
}

/**
 * True for a missing record, including an id in the URL that isn't a valid UUID (Postgres
 * rejects it with 22P02 before any row lookup). Pages turn this into a 404, not a 500.
 */
export function isNotFound(e: unknown): boolean {
  if (e instanceof DomainError) return e.code === "NOT_FOUND";
  for (let c: unknown = e; c && typeof c === "object"; c = (c as { cause?: unknown }).cause) {
    if ((c as { code?: unknown }).code === "22P02") return true;
  }
  return false;
}
