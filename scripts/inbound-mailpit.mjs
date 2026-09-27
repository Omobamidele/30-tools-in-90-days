// Local stand-in for an email provider's inbound webhook (Postmark, Resend, SendGrid).
// Watches Mailpit for mail sent to *@INBOUND_DOMAIN, posts each message to the app's
// /api/inbound/email webhook in the provider-neutral shape, then removes it from Mailpit.
//
//   npm run inbound:mailpit            keep watching (every 3 seconds)
//   npm run inbound:mailpit -- --once  deliver what's waiting, then stop
import "dotenv/config";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:4001";
const APP = process.env.APP_URL ?? "http://localhost:3001";
const DOMAIN = (process.env.INBOUND_DOMAIN ?? "inbound.localhost").toLowerCase();
const SECRET = process.env.INBOUND_SECRET;
if (!SECRET) throw new Error("Set INBOUND_SECRET in .env (16+ characters) so the webhook accepts deliveries.");
const once = process.argv.includes("--once");

async function deliverWaiting() {
  const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=200`)).json();
  const inbound = (list.messages ?? []).filter((m) => (m.To ?? []).some((t) => t.Address.toLowerCase().endsWith(`@${DOMAIN}`)));
  for (const m of inbound) {
    const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    const attachments = [];
    for (const a of msg.Attachments ?? []) {
      const bytes = Buffer.from(await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}/part/${a.PartID}`)).arrayBuffer());
      attachments.push({ filename: a.FileName, contentType: a.ContentType, contentBase64: bytes.toString("base64") });
    }
    const payload = {
      to: (msg.To ?? []).map((t) => t.Address),
      from: msg.From?.Name ? `${msg.From.Name} <${msg.From.Address}>` : msg.From?.Address ?? "",
      subject: msg.Subject ?? "",
      attachments,
    };
    const res = await fetch(`${APP}/api/inbound/email`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`${new Date().toLocaleTimeString()}  ${msg.Subject}  →  ${res.status} ${body.status ?? ""}: ${body.message ?? ""}`);
    if (res.status < 500) {
      await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [m.ID] }) });
    }
  }
  return inbound.length;
}

if (once) {
  const n = await deliverWaiting();
  if (!n) console.log(`Nothing waiting for *@${DOMAIN} in Mailpit.`);
} else {
  console.log(`Watching Mailpit for mail to *@${DOMAIN}. Ctrl+C to stop.`);
  for (;;) {
    await deliverWaiting().catch((e) => console.error(e.message));
    await new Promise((r) => setTimeout(r, 3000));
  }
}
