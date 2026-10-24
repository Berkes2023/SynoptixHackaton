import { NextResponse } from "next/server";
import { validateContact } from "@/lib/contact";
import { clientKey, createRateLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 });
const MAX_BODY = 10_000;

/**
 * POST /api/v1/contact. Success is returned ONLY after the configured delivery
 * endpoint (CONTACT_WEBHOOK_URL, e.g. a Formspree form) accepts the message.
 * Without it, the API reports that delivery is not configured.
 */
export async function POST(req: Request) {
  const rl = limiter.check(clientKey(req));
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const v = validateContact(body);
  if (!v.ok) return NextResponse.json({ error: "Please correct the highlighted fields.", fields: v.errors }, { status: 400 });

  const target = process.env.CONTACT_WEBHOOK_URL;
  if (!target || !/^https:\/\//.test(target)) {
    return NextResponse.json(
      { error: "Message delivery is not configured on this deployment yet, so your message was not sent. Nothing was stored." },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...v.value, _subject: `DeepTrace contact: ${v.value.reason}` }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: "The message service rejected the submission. Please try again later." }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "Could not reach the message service. Please try again later." }, { status: 502 });
  }
  return NextResponse.json({ status: "sent" });
}
