import { jsonToTable } from "../data/generator";
import { generateSyntheticCsv } from "../data/synthetic";
import { mockScreeningScore, type SyntheticProfile } from "../fairness/counterfactual";
import { parseCsv } from "../ingest/csv";

/**
 * Provider-neutral adapter interfaces. DeepTrace is READ-ONLY with respect to
 * external systems: adapters may read exported outcomes or request scores for
 * synthetic test profiles from an authorised test interface — never submit,
 * alter or decide anything in a live ATS.
 */

/** Source of screening outcomes, normalised to a header + rows table for mapping. */
export interface AtsSourceAdapter {
  id: string;
  label: string;
  readOnly: true;
  load(input: string): { headers: string[]; rows: string[][] };
}

export const CsvAdapter: AtsSourceAdapter = { id: "csv", label: "CSV export", readOnly: true, load: (text) => parseCsv(text) };
export const JsonAdapter: AtsSourceAdapter = { id: "json", label: "JSON export", readOnly: true, load: (text) => jsonToTable(text) };
/** Fictional "Workday-style" export used for demos. Not a Workday API and not endorsed by Workday. */
export const MockWorkdayStyleAdapter: AtsSourceAdapter = { id: "mock_workday_style", label: "Mock Workday-style export (synthetic)", readOnly: true, load: () => parseCsv(generateSyntheticCsv()) };

export const SOURCE_ADAPTERS = [CsvAdapter, JsonAdapter, MockWorkdayStyleAdapter];

/** Scores a synthetic profile for counterfactual testing. */
export interface ScreeningEngineAdapter {
  id: string;
  label: string;
  /** True only for engines the organisation is authorised to test with synthetic profiles. */
  authorised: boolean;
  score(profile: SyntheticProfile): Promise<number>;
}

export const MockScreeningEngine: ScreeningEngineAdapter = {
  id: "mock",
  label: "DeepTrace mock screening engine (deliberately biased, for demonstration)",
  authorised: true,
  score: async (p) => mockScreeningScore(p),
};

/**
 * Placeholder for a future authorised external test interface. It refuses to
 * run until an approved endpoint and written authorisation are configured.
 */
export function createAuthorisedExternalEngine(config: { endpoint?: string; authorisationRef?: string }): ScreeningEngineAdapter {
  return {
    id: "external",
    label: "Authorised external test interface",
    authorised: Boolean(config.endpoint && config.authorisationRef),
    async score() {
      throw new Error("External screening-engine testing is not enabled. It requires an approved test endpoint and documented authorisation from the system owner.");
    },
  };
}
