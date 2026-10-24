export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  sensitive?: boolean;
  synonyms: string[];
}

/** DeepTrace standard schema. Sensitive fields are keyed `sensitive.<category>`. */
export const STANDARD_FIELDS: FieldDef[] = [
  { key: "applicationId", label: "Application ID", required: true, synonyms: ["application id", "application", "app id", "application ref"] },
  { key: "candidateRef", label: "Candidate reference (pseudonymous)", required: true, synonyms: ["candidate ref", "candidate id", "pseudonymous ref", "candidate"] },
  { key: "jobRef", label: "Job requisition ref", required: true, synonyms: ["job req id", "requisition id", "job ref", "job id", "req id", "requisition"] },
  { key: "jobTitle", label: "Job title", required: true, synonyms: ["job title", "title", "position", "role"] },
  { key: "department", label: "Department", required: false, synonyms: ["department", "dept", "supervisory organization", "team"] },
  { key: "appliedAt", label: "Applied date", required: false, synonyms: ["applied date", "applied at", "application date", "date applied"] },
  { key: "stage", label: "Screening stage", required: true, synonyms: ["stage", "screening stage", "step", "recruiting stage"] },
  { key: "score", label: "ATS score", required: false, synonyms: ["ai score", "score", "match score", "candidate score", "ats score"] },
  { key: "grade", label: "ATS grade", required: false, synonyms: ["grade", "candidate grade", "suggested grade", "ats grade"] },
  { key: "decision", label: "Screening decision", required: true, synonyms: ["screening decision", "decision", "outcome", "status", "disposition"] },
  { key: "decisionAt", label: "Decision timestamp", required: true, synonyms: ["decision date", "decision at", "decision timestamp", "occurred at", "screened at"] },
  { key: "sourceSystem", label: "Source system", required: true, synonyms: ["source system", "source", "system", "ats"] },
  { key: "sensitive.gender", label: "Gender (self-reported)", required: false, sensitive: true, synonyms: ["gender self reported", "gender", "sex"] },
  { key: "sensitive.age_band", label: "Age band (self-reported)", required: false, sensitive: true, synonyms: ["age band self reported", "age band", "age group"] },
];

/** standard field key -> source column header (or null when unmapped) */
export type Mapping = Record<string, string | null>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const field of STANDARD_FIELDS) {
    const match =
      headers.find((h) => !used.has(h) && field.synonyms.includes(norm(h))) ??
      headers.find((h) => !used.has(h) && norm(h) === norm(field.key));
    mapping[field.key] = match ?? null;
    if (match) used.add(match);
  }
  return mapping;
}
