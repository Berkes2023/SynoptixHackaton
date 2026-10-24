/**
 * Optional model-provider abstraction for future reasoning agents (e.g. to
 * reword explanations). Disabled by default: DeepTrace works fully in
 * deterministic mode without any AI API key.
 *
 * Rules for any future provider:
 * - Server-side credentials only; never exposed to the browser.
 * - Sending sensitive data to an external provider requires a human approval gate.
 * - Output is untrusted text: it is validated and never executed or used for statistics.
 */
export interface ModelProvider {
  id: string;
  /** USD per 1,000 tokens, used for cost ceilings and estimates. */
  pricePer1kTokens: number;
  complete(prompt: string, opts: { maxTokens: number }): Promise<{ text: string; tokens: number }>;
}

export const MODEL_COST_CEILING_USD = 1;

/** Returns no provider: none is configured or implemented in this release. */
export function getModelProvider(): ModelProvider | null {
  return null;
}

export function estimateCostUsd(provider: ModelProvider | null, tokens: number): number {
  return provider ? (tokens / 1000) * provider.pricePer1kTokens : 0;
}
