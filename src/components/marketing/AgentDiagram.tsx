"use client";

import { useState } from "react";
import { AGENTS } from "@/lib/agents/agents";
import { AGENT_TYPES, type AgentType } from "@/lib/agents/contracts";
import { AGENT_CAPABILITIES } from "@/lib/agents/policy";

const LANES: { label: string; agents: AgentType[] }[] = [
  { label: "Validate", agents: ["governance", "data_integrity"] },
  { label: "Analyse & experiment", agents: ["bias_discovery", "counterfactual", "mitigation"] },
  { label: "Verify & explain", agents: ["statistical_verification", "explainability"] },
  { label: "Human gate → report", agents: ["reporting"] },
];

const NUMBER: Record<AgentType, number> = {
  data_integrity: 1,
  bias_discovery: 2,
  counterfactual: 3,
  statistical_verification: 4,
  mitigation: 5,
  explainability: 6,
  governance: 7,
  reporting: 8,
};

/** Interactive orchestration diagram. Content comes from the real agent registry. */
export function AgentDiagram() {
  const [sel, setSel] = useState<AgentType>("statistical_verification");
  const a = AGENTS[sel];
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="card">
        <div className="mb-4 flex items-center justify-center">
          <span className="rounded-full border border-brand bg-brand-soft px-4 py-1.5 text-sm font-semibold text-brand">Orchestrator · bounded state machine</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {LANES.map((lane, i) => (
            <div key={lane.label} className="relative rounded-xl border border-dashed border-line p-2">
              <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                {i + 1}. {lane.label}
              </div>
              <div className="space-y-2">
                {lane.agents.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSel(t)}
                    aria-pressed={sel === t}
                    className={`w-full rounded-lg border px-2 py-2 text-left text-xs transition-colors ${sel === t ? "border-brand bg-brand-soft" : "border-line bg-surface-2 hover:border-brand/50"}`}
                  >
                    <span className="tabular mr-1 font-semibold text-brand">{NUMBER[t]}</span>
                    {AGENTS[t].name.replace(" Agent", "").replace("Audit ", "")}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-ink-2">Select an agent. A person must approve at the gate before any report is generated.</p>
      </div>
      <div className="card" aria-live="polite">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand">Agent {NUMBER[sel]}</div>
        <h3 className="mt-1 text-lg font-semibold">{a.name}</h3>
        <p className="mt-2 text-sm text-ink-2">{a.purpose}</p>
        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Implementation</dt>
          <dd>{a.kind === "deterministic" ? "Deterministic service (no language model)" : "Language model"}</dd>
          <dt className="text-muted">Version</dt>
          <dd className="font-mono">{a.version}</dd>
          <dt className="text-muted">Data access</dt>
          <dd>{AGENT_CAPABILITIES[sel].map((c) => c.replace(/_/g, " ")).join(", ")}</dd>
        </dl>
        <p className="mt-4 text-xs text-muted">Access is enforced by a server-side-style data broker in code; an agent asking for anything else is refused.</p>
      </div>
      <span className="sr-only">{AGENT_TYPES.length} agents</span>
    </div>
  );
}
