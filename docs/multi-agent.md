# Multi-agent auditing — architecture and status

## Why bounded agents (and what they do not guarantee)

DeepTrace splits an audit into specialised roles with typed contracts, separate data access and an independent verification step before anything is released. Compared with one unrestricted agent this gives separation of responsibilities, explicit sensitive-data boundaries, task-specific tools, reproducible experiments, observable workflows and human approval gates.

It does **not** make the statistics more accurate: discovery and verification use the same deterministic maths as the baseline. The value is measured in `src/lib/agents/evaluation.ts` and shown on `/technology/multi-agent-ai`: equal detection accuracy to the baseline (5/5 each), far more evidence per audit (9 vs 3 items), recovery from injected transient failures, and rejection of deliberately corrupted upstream claims — at roughly an order of magnitude more runtime (still milliseconds) and $0 model cost. On clean synthetic data the verification agent rejected nothing; its measured value is the fault-injection result.

## Components

| File | Role |
|---|---|
| `src/lib/agents/contracts.ts` | Zod schemas: tasks, results, approvals, conflicts, workflow runs, per-agent findings; state list and allowed transitions |
| `src/lib/agents/policy.ts` | Deterministic policy (who may start/approve, authorised categories, external access), job-relevant fields, `DataBroker` with per-agent capabilities and tenancy checks |
| `src/lib/agents/agents.ts` | The eight agents (all deterministic services) |
| `src/lib/agents/orchestrator.ts` | State machine, plan, dependency enforcement, retries, timeouts, task cap, idempotency, cancellation, resume, conflict detection, approval gate |
| `src/lib/agents/runner.ts` | Client runner: in the browser demo runs workflows locally; when signed in, calls the server API |
| `src/lib/server/workflow-service.ts` | Server runner: identity from the session, persistence in Supabase, links completed workflows into the Audit Lab |
| `src/lib/agents/evaluation.ts` | Baseline vs multi-agent evaluation on identical synthetic cases |
| `src/lib/agents/model-provider.ts` | Optional model-provider interface — disabled, none configured |

## Workflow

`CREATED → VALIDATING (governance preflight, data integrity) → PLANNING → ANALYSING (bias discovery) → EXPERIMENTING (counterfactual, mitigation) → VERIFYING (statistical verification, governance review of mitigation, conflict detection, explainability) → AWAITING_REVIEW (human gate) → REPORTING (evidence package) → COMPLETED`, plus `FAILED` and `CANCELLED`. Any other transition throws.

Limits: at most 16 tasks per workflow; each task has a 10 s timeout and 2 retries; policy denials are never retried; agents cannot create tasks.

## Conflict precedence

Verified statistics → hard policy constraints → human review → generated narrative. Conflicts are stored on the run and shown in the Observatory and report.

## Status

| Item | Status |
|---|---|
| 8 agents | Implemented and tested — deterministic services, no LLM |
| Orchestrator, gates, conflicts, recovery | Implemented and tested |
| Agent Observatory `/agents` | Implemented; workflows persist in the browser (demo) or in Supabase (accounts) |
| Single general-purpose LLM agent (evaluation arm) | Not run — no model provider configured |
| Database persistence, per-tenant quotas | Implemented with Supabase + RLS (needs a project connected; see `docs/accounts-and-storage.md`) |
| Durable background worker | Planned; workflows run inside the API request |
| External ATS testing, external model providers | Denied by policy in this deployment |
