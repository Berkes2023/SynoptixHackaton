import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/marketing/blocks";
import { CONTROL_STATUS_LABEL, SECURITY_CONTROLS, type ControlStatus } from "@/lib/site/security-controls";

export const metadata: Metadata = {
  title: "Security overview",
  description: "DeepTrace's security controls and their honest status: implemented and tested, implemented but unverified, or planned.",
};

const tone: Record<ControlStatus, string> = {
  tested: "bg-green-50 text-green-900 border-green-200",
  unverified: "bg-amber-50 text-amber-900 border-amber-200",
  planned: "bg-sunken text-ink-2 border-line",
};
const icon: Record<ControlStatus, string> = { tested: "✓", unverified: "●", planned: "○" };

export default function SecurityPage() {
  const counts = (["tested", "unverified", "planned"] as ControlStatus[]).map((s) => [s, SECURITY_CONTROLS.filter((c) => c.status === s).length] as const);
  return (
    <>
      <PageHero
        eyebrow="Trust & security"
        title="Security is a product foundation — so we show our real status."
        intro="DeepTrace is a prototype. Below is every control we consider essential for processing recruitment data, marked honestly. We do not hold SOC 2, ISO 27001 or any certification, and we make no compliance claims."
      />
      <Section title="Control status">
        <div className="mb-6 flex flex-wrap gap-3">
          {counts.map(([s, n]) => (
            <span key={s} className={`rounded-full border px-3 py-1 text-sm ${tone[s]}`}>
              {icon[s]} {CONTROL_STATUS_LABEL[s]}: <strong className="tabular">{n}</strong>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Area</th>
                <th>Control</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {SECURITY_CONTROLS.map((c) => (
                <tr key={c.control}>
                  <td className="whitespace-nowrap text-ink-2">{c.area}</td>
                  <td className="font-medium">{c.control}</td>
                  <td>
                    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${tone[c.status]}`}>
                      {icon[c.status]} {CONTROL_STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="text-sm text-ink-2">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">&ldquo;Tested&rdquo; means an automated test in the public repository exercises the control. It is not an external audit.</p>
      </Section>
      <Section tone="sunken" title="Before any real recruitment data">
        <ol className="grid gap-4 md:grid-cols-2">
          {[
            ["Agree data-protection roles", "Employer and DeepTrace operator establish controller/processor responsibilities and a lawful basis."],
            ["Complete a DPIA", "Assess risks of processing special-category and recruitment data before starting."],
            ["Deploy production controls", "Authentication with MFA, tenant isolation with RLS, encryption at rest with managed keys, retention and purge."],
            ["Independent testing", "Penetration testing and cross-tenant access tests before go-live."],
          ].map(([t, d], i) => (
            <li key={t} className="card">
              <div className="tabular text-xs font-semibold text-brand">{i + 1}</div>
              <div className="mt-1 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm">
          Report a vulnerability or ask a question via <Link href="/contact" className="text-brand underline">the contact form</Link>. See also{" "}
          <Link href="/privacy" className="text-brand underline">Privacy &amp; data protection</Link>.
        </p>
      </Section>
    </>
  );
}
