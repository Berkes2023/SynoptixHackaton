export const CONTACT_REASONS = {
  demo: "Request a guided demo",
  pilot: "Discuss a pilot",
  research: "Research or academic collaboration",
  security: "Security or privacy question",
  other: "Something else",
} as const;
export type ContactReason = keyof typeof CONTACT_REASONS;

export interface ContactInput {
  name: string;
  organisation: string;
  email: string;
  reason: ContactReason;
  message: string;
}

const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk", "outlook.com", "live.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "gmx.com"]);
/** Pragmatic email check (not full RFC 5322). */
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
/** Minimum time a human takes to fill the form; faster submissions are treated as bots. */
export const MIN_FILL_MS = 3000;

export type ContactValidation = { ok: true; value: ContactInput } | { ok: false; errors: Partial<Record<keyof ContactInput | "form", string>> };

export function validateContact(body: unknown, now = Date.now()): ContactValidation {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const errors: Partial<Record<keyof ContactInput | "form", string>> = {};

  if (str("website")) errors.form = "Submission rejected.";
  const started = typeof b.startedAt === "number" ? b.startedAt : 0;
  if (!started || now - started < MIN_FILL_MS) errors.form = "Please take a moment to complete the form, then try again.";

  const name = str("name");
  const organisation = str("organisation");
  const email = str("email").toLowerCase();
  const reason = str("reason") as ContactReason;
  const message = str("message");

  if (name.length < 2 || name.length > 100) errors.name = "Enter your name (2–100 characters).";
  if (organisation.length < 2 || organisation.length > 150) errors.organisation = "Enter your organisation (2–150 characters).";
  if (!EMAIL.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
  else if (FREE_MAIL.has(email.split("@")[1])) errors.email = "Please use your work email address.";
  if (!(reason in CONTACT_REASONS)) errors.reason = "Choose a reason for contact.";
  if (message.length > 2000) errors.message = "Keep the message under 2,000 characters.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, organisation, email, reason, message } };
}
