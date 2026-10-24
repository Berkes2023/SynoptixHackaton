# Fairness methodology — dt-fairness-1.0.0

Implemented in `src/lib/fairness/` and covered by `tests/`.

| Method | Implementation | Limitation |
|---|---|---|
| Selection rate | selected ÷ analysed, Wilson score interval | Descriptive; does not establish cause |
| Adverse impact ratio | rate ÷ highest-rate group, Katz log CI; flagged below 0.8 (configurable) | Screening heuristic, not a legal test |
| Selection difference test | Two-sided Fisher exact (R `fisher.test` convention) | Sensitive to sample size |
| Score distribution | Mean/median/IQR, histogram, Mann–Whitney U (ties + continuity correction), Cohen's d | Requires a comparable scale within one job and stage |
| Multiple testing | Holm–Bonferroni across all tests in an audit | Conservative |
| Counterfactual | Matched pairs differing in one cue; mean Δ with CI, flip rate, exact sign test | Mock engine only until an authorised test interface exists |

## Rules enforced in code

- Protected characteristics are only taken from self-reported mapped fields; nothing is inferred.
- Missing / "Prefer not to say" / "Not disclosed" values are excluded and reported, never treated as a group.
- Groups below the minimum size (default 20) are suppressed: counts withheld and excluded from comparisons.
- Each audit covers exactly one job and one stage; nothing is merged implicitly.
- Findings always list evidence (numerators, denominators, CIs, p-values) and limitations.
- Conclusions never state that unlawful discrimination occurred.
- `runAudit` is a pure function; the result is independent of input order and is re-verified against the stored dataset hash.

## Severity

- **High** — ratio below threshold *and* Holm-adjusted p < α.
- **Medium** — ratio below threshold but not significant after correction, or significant difference above threshold, or significant score difference, or > 20% missing attribute.
- **Low / Info** — minor missingness, suppressed groups.
