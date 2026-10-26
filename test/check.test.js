const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const run = (output, extra = []) =>
  spawnSync(
    process.execPath,
    ["eval/check.mjs", "--guidelines", "eval/fixtures/guidelines.md", "--output", output, ...extra],
    { cwd: root, encoding: "utf8" }
  );

test("check.mjs: on-brand output scores 100%", () => {
  const r = run("eval/fixtures/on-brand.html", ["--min", "90"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /colors:\s+100% on palette/);
  assert.match(r.stdout, /fonts:\s+on brand/);
});

test("check.mjs: off-brand output fails the threshold and names the offenders", () => {
  const r = run("eval/fixtures/off-brand.html", ["--min", "90"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /#7c3aed/);
  assert.match(r.stdout, /off brand: Poppins/);
});
