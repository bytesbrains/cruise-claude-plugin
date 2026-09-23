// The workflows hold a token, and release holds npm's trust, so what they run
// is held too (PR #4 review).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.join(import.meta.dirname, "../.github/workflows");
const workflows = readdirSync(DIR).map((name) => ({ name, text: readFileSync(path.join(DIR, name), "utf8") }));

describe.each(workflows)("the $name workflow", ({ text }) => {
  const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((match) => match[1]!);

  it("pins every third-party action to a commit, since a tag can be moved", () => {
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses.filter((action) => !action.startsWith("actions/"))) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("keeps the checkout token out of .git/config", () => {
    // The checkout step runs from its `uses:` line to the next step's dash.
    const start = text.indexOf("uses: actions/checkout@");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("\n      - ", start);
    expect(text.slice(start, end === -1 ? undefined : end)).toMatch(/^\s+persist-credentials: false$/m);
  });
});

it("there is a CI and a release workflow", () => {
  expect(workflows.map((workflow) => workflow.name).sort()).toEqual(["ci.yml", "release.yml"]);
});
