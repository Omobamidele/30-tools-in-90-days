import { ZodError } from "zod";
import { getDb } from "@/db/client";
import { env } from "@/env";
import { log } from "@/log";
import { receiveInboundEmail } from "@/services/inbound-pickup";

// Inbound email webhook for hotel pickup reports (milestone 14). An email provider's inbound
// parse (Postmark, Resend, SendGrid) is adapted to this provider-neutral JSON:
//   { to, from, subject, attachments: [{ filename, contentType, contentBase64 }] }
// Locally, `npm run inbound:mailpit` forwards mail sent to Mailpit in the same shape.
// Bearer-protected. Every outcome answers 200 with a status, so providers don't retry emails
// that were read and rejected on purpose; only a server error invites a retry.
export async function POST(req: Request) {
  const secret = env().INBOUND_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ status: "invalid", message: "Body must be JSON." }, { status: 400 });
  }
  try {
    return Response.json(await receiveInboundEmail(getDb(), body));
  } catch (err) {
    if (err instanceof ZodError) return Response.json({ status: "invalid", message: "Unexpected payload shape." }, { status: 400 });
    log.error({ err }, "inbound email failed");
    return Response.json({ status: "error", message: "The report couldn't be processed. It will be retried." }, { status: 500 });
  }
}
