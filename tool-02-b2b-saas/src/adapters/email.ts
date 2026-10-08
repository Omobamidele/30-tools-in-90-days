import nodemailer from "nodemailer";
import { env } from "@/env";

export type EmailMessage = { to: string; subject: string; text: string; html: string; fromName?: string; replyTo?: string | null };
export type SendResult = { sent: true } | { sent: false; reason: string };

export interface EmailSender {
  readonly driver: "smtp" | "resend" | "disabled";
  send(msg: EmailMessage): Promise<SendResult>;
}

function from(fromName?: string) {
  const configured = env().EMAIL_FROM;
  if (!fromName) return configured;
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured;
  return `${fromName.replace(/["<>]/g, "")} <${address}>`;
}

class SmtpSender implements EmailSender {
  readonly driver = "smtp" as const;
  private transport = nodemailer.createTransport(env().SMTP_URL ?? "smtp://localhost:2502");
  async send(msg: EmailMessage): Promise<SendResult> {
    try {
      await this.transport.sendMail({ from: from(msg.fromName), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo ?? undefined });
      return { sent: true };
    } catch (err) {
      return { sent: false, reason: err instanceof Error ? err.message : "SMTP send failed" };
    }
  }
}

class ResendSender implements EmailSender {
  readonly driver = "resend" as const;
  constructor(private apiKey: string) {}
  async send(msg: EmailMessage): Promise<SendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: from(msg.fromName), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, reply_to: msg.replyTo ?? undefined }),
      });
      if (!res.ok) return { sent: false, reason: `Resend returned ${res.status}` };
      return { sent: true };
    } catch (err) {
      return { sent: false, reason: err instanceof Error ? err.message : "Resend request failed" };
    }
  }
}

class DisabledSender implements EmailSender {
  readonly driver = "disabled" as const;
  async send(): Promise<SendResult> {
    return { sent: false, reason: "Email isn't set up for this workspace." };
  }
}

let override: EmailSender | undefined;
let instance: EmailSender | undefined;

export function emailSender(): EmailSender {
  if (override) return override;
  if (instance) return instance;
  const e = env();
  instance =
    e.EMAIL_DRIVER === "smtp"
      ? new SmtpSender()
      : e.EMAIL_DRIVER === "resend" && e.RESEND_API_KEY
        ? new ResendSender(e.RESEND_API_KEY)
        : new DisabledSender();
  return instance;
}

export function setEmailSenderForTests(s: EmailSender | undefined) {
  override = s;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Plain, accessible email layout: brand bar, heading, body lines, one action link. */
export function renderEmail(opts: { productName: string; brandColor: string; heading: string; lines: string[]; action?: { label: string; url: string }; footer?: string }) {
  const text = [opts.heading, "", ...opts.lines, "", opts.action ? `${opts.action.label}: ${opts.action.url}` : "", "", opts.footer ?? `Sent by ${opts.productName}`]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f2;font-family:Arial,Helvetica,sans-serif;color:#1b2220">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dadfdb;border-radius:6px">
<tr><td style="border-top:4px solid ${esc(opts.brandColor)};padding:20px 24px 4px;font-size:13px;color:#5b6561">${esc(opts.productName)}</td></tr>
<tr><td style="padding:4px 24px 8px;font-size:18px;font-weight:bold">${esc(opts.heading)}</td></tr>
${opts.lines.map((l) => `<tr><td style="padding:2px 24px;font-size:14px;line-height:20px">${esc(l)}</td></tr>`).join("")}
${opts.action ? `<tr><td style="padding:18px 24px"><a href="${esc(opts.action.url)}" style="display:inline-block;background:${esc(opts.brandColor)};color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:4px;font-size:14px;font-weight:bold">${esc(opts.action.label)}</a></td></tr>` : ""}
<tr><td style="padding:12px 24px 20px;font-size:12px;color:#5b6561">${esc(opts.footer ?? `Sent by ${opts.productName}`)}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
