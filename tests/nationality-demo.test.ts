import { describe, expect, it } from "vitest";
import { demoAudit, demoRecords } from "../src/lib/site/demo-data";

describe("demo nationality category", () => {
  const scoped = demoRecords().filter((r) => r.jobRef === "REQ-1042" && r.stage === "initial_screening");

  it("is a self-reported column, distinct from right to work", () => {
    const values = new Set(scoped.map((r) => r.sensitive.nationality));
    // "Prefer not to say" is treated as missing, never guessed.
    expect(values).toEqual(new Set(["UK national", "Non-UK national", null]));
    expect(scoped.every((r) => !("right_to_work" in r.sensitive) && !("citizenship" in r.sensitive))).toBe(true);
  });

  it("leaves the gender fixture unchanged", () => {
    expect(demoAudit().groups.find((g) => g.group === "Female")?.selectionRate).toBeCloseTo(0.25);
    expect(demoAudit().groups.find((g) => g.group === "Male")?.selectionRate).toBeCloseTo(0.4);
  });

  it("produces the fixed nationality counts", () => {
    const r = demoAudit({ groupingAttribute: "nationality" });
    const g = (name: string) => r.groups.find((x) => x.group === name)!;
    expect([g("UK national").selected, g("UK national").n]).toEqual([45, 120]);
    expect([g("Non-UK national").selected, g("Non-UK national").n]).toEqual([17, 69]);
  });
});
