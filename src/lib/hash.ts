import type { ScreeningRecord } from "./fairness/types";

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Canonical, order-independent serialisation used for dataset hashes. */
export function canonicalDataset(records: ScreeningRecord[]): string {
  const rows = [...records]
    .sort((a, b) => a.applicationId.localeCompare(b.applicationId) || a.stage.localeCompare(b.stage))
    .map((r) => [
      r.applicationId, r.candidateRef, r.jobRef, r.stage, r.score, r.grade, r.decision, r.decisionAt, r.sourceSystem,
      Object.keys(r.sensitive).sort().map((k) => [k, r.sensitive[k]]),
    ]);
  return JSON.stringify(rows);
}
