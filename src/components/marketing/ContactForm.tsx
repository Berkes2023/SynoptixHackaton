"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT_REASONS } from "@/lib/contact";

type Fields = "name" | "organisation" | "email" | "reason" | "message" | "form";

export function ContactForm() {
  const startedAt = useRef(0);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending");
    setErrors({});
    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(fd.entries()), startedAt: startedAt.current }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.status === "sent") {
        setState("sent");
        return;
      }
      setErrors({ ...(body.fields ?? {}), form: body.fields?.form ?? body.error ?? "Something went wrong. Please try again." });
      setState("error");
    } catch {
      setErrors({ form: "Network error — your message was not sent. Please try again." });
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="card border-green-200 bg-green-50 text-green-900" role="status">
        <div className="text-lg font-semibold">Message sent.</div>
        <p className="mt-2 text-sm">Thank you — it has been delivered to our inbox and we&apos;ll reply to the address you gave.</p>
      </div>
    );
  }

  const field = (id: Fields) => (errors[id] ? { "aria-invalid": true, "aria-describedby": `${id}-err` } : {});
  const err = (id: Fields) =>
    errors[id] ? (
      <p id={`${id}-err`} className="mt-1 text-xs text-critical">
        {errors[id]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="card space-y-4" aria-describedby={errors.form ? "form-err" : undefined}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" autoComplete="name" required maxLength={100} {...field("name")} />
          {err("name")}
        </div>
        <div>
          <label className="label" htmlFor="organisation">Organisation</label>
          <input id="organisation" name="organisation" className="input" autoComplete="organization" required maxLength={150} {...field("organisation")} />
          {err("organisation")}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Business email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required maxLength={254} {...field("email")} />
        {err("email")}
      </div>
      <div>
        <label className="label" htmlFor="reason">Reason for contact</label>
        <select id="reason" name="reason" className="input" required defaultValue="" {...field("reason")}>
          <option value="" disabled>
            Choose one…
          </option>
          {Object.entries(CONTACT_REASONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {err("reason")}
      </div>
      <div>
        <label className="label" htmlFor="message">
          Message <span className="normal-case text-muted">(optional)</span>
        </label>
        <textarea id="message" name="message" className="input min-h-[120px]" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} {...field("message")} />
        <div className="mt-1 text-right text-[11px] text-muted">{message.length}/2000</div>
        {err("message")}
      </div>
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {errors.form && (
        <p id="form-err" role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {errors.form}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send message"}
      </button>
      <p className="text-xs text-muted">By sending, you agree we may use these details to reply. See the privacy notice.</p>
    </form>
  );
}
