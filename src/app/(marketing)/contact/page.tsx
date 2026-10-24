import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/ContactForm";
import { PageHero } from "@/components/marketing/blocks";

export const metadata: Metadata = {
  title: "Contact",
  description: "Request a demo, discuss a pilot or ask a security or privacy question.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to us." intro="Request a guided demo, discuss a pilot, or ask about security, privacy or methodology. We reply from a real inbox — no automated sales sequence." />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <ContactForm />
        <aside className="space-y-4 text-sm text-ink-2">
          <div className="card">
            <div className="font-semibold text-ink">Privacy notice</div>
            <p className="mt-2">
              We use the details you submit only to respond to your enquiry. They are sent to our message service and are not added to any mailing list. Please don&apos;t
              include candidate or employee personal data in your message.
            </p>
          </div>
          <div className="card">
            <div className="font-semibold text-ink">Prefer to explore first?</div>
            <p className="mt-2">The interactive demo runs entirely on fictional data and needs no account.</p>
            <a href="/demo" className="btn btn-secondary mt-3">
              Launch Interactive Demo
            </a>
          </div>
        </aside>
      </div>
    </>
  );
}
