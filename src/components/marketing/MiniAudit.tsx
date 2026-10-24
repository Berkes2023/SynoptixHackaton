"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SelectionRateChart } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { demoAudit } from "@/lib/site/demo-data";

const OPTIONS = [
  { label: "Software Engineer · initial screening", jobRef: "REQ-1042", stage: "initial_screening" },
  { label: "Software Engineer · assessment", jobRef: "REQ-1042", stage: "assessment" },
  { label: "Data Analyst · assessment", jobRef: "REQ-1077", stage: "assessment" },
];

/** Live, client-side audit of the fictional dataset using the production engine. */
export function MiniAudit() {
  const [opt, setOpt] = useState(0);
  const [attr, setAttr] = useState<"gender" | "age_band">("gender");
  const result = useMemo(() => demoAudit({ jobRef: OPTIONS[opt].jobRef, stage: OPTIONS[opt].stage, groupingAttribute: attr }), [opt, attr]);
  const cmp = result.comparisons[0];
  const reportable = result.groups.filter((g) => !g.suppressed);

  const plain =
    result.flag === "insufficient_data"
      ? `Not enough reportable data: ${result.sample.missingAttribute} of ${result.sample.scopedRecords} applicants did not share this information, and the remaining groups are too small to compare safely. DeepTrace says so rather than guessing.`
      : cmp && cmp.belowThreshold
        ? `${cmp.group} applicants advanced at ${(cmp.ratio! * 100).toFixed(0)}% of the rate of ${cmp.reference} applicants. That is below the common 80% screening heuristic, so DeepTrace recommends a human investigation. It does not say why the gap exists.`
        : `Selection rates are similar across groups for this stage. That is not a certificate of fairness, just no flag under these rules.`;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="card">
        <label className="label" htmlFor="mini-job">Requisition & stage</label>
        <select id="mini-job" className="input" value={opt} onChange={(e) => setOpt(Number(e.target.value))}>
          {OPTIONS.map((o, i) => (
            <option key={o.label} value={i}>
              {o.label}
            </option>
          ))}
        </select>
        <fieldset className="mt-4">
          <legend className="label">Compare by (self-reported)</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["gender", "age_band"] as const).map((a) => (
              <label key={a} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${attr === a ? "border-brand bg-brand-soft" : "border-line bg-surface-2"}`}>
                <input type="radio" name="mini-attr" className="sr-only" checked={attr === a} onChange={() => setAttr(a)} />
                {a === "gender" ? "Gender" : "Age band"}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="mt-5 text-sm leading-relaxed text-ink-2" aria-live="polite">
          {plain}
        </p>
        <Link href="/demo" className="btn btn-primary mt-5 w-full">
          Continue in the full demo <Icon name="arrowRight" />
        </Link>
      </div>
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Selection rate by group, with 95% confidence intervals</h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Synthetic data · mock ATS</span>
        </div>
        {reportable.length > 0 ? (
          <SelectionRateChart result={result} height={260} />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-ink-2">All groups suppressed (fewer than 20 applicants each).</div>
        )}
        <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted">Applicants in scope</div>
            <div className="tabular font-semibold">{result.sample.scopedRecords}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Missing attribute</div>
            <div className="tabular font-semibold">{result.sample.missingAttribute}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Impact ratio</div>
            <div className="tabular font-semibold">{cmp?.ratio != null ? cmp.ratio.toFixed(3) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Holm-adjusted p</div>
            <div className="tabular font-semibold">{cmp ? cmp.adjustedP.toFixed(3) : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
