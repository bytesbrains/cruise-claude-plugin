// The CI workflow holds a token, so what it runs is held too (PR #4 review).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(path.join(import.meta.dirname, "../.github/workflows/ci.yml"), "utf8");
const uses = [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((match) => match[1]!);

describe("the CI workflow", () => {
  it("pins every third-party action to a commit, since a tag can be moved", () => {
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses.filter((action) => !action.startsWith("actions/"))) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("keeps the checkout token out of .git/config", () => {
    // The checkout step runs from its `uses:` line to the next step's dash.
    const start = workflow.indexOf("uses: actions/checkout@");
    expect(start).toBeGreaterThan(-1);
    const end = workflow.indexOf("\n      - ", start);
    expect(workflow.slice(start, end === -1 ? undefined : end)).toMatch(/^\s+persist-credentials: false$/m);
  });
});
