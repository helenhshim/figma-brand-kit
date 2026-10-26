const test = require("node:test");
const assert = require("node:assert/strict");
const loadPlugin = require("./load-plugin");

const p = loadPlugin();

const color = (hex, count, text = 0, opacity = 1) => ({
  hex,
  opacity,
  count,
  text,
  key: opacity === 1 ? hex : hex + " @" + Math.round(opacity * 100) + "%",
});
const type = (family, style, size, lineHeight, count) => ({
  family,
  style,
  size,
  lineHeight: String(lineHeight),
  count,
  key: family + " " + style + " " + size + "/" + lineHeight,
});
const tally = (cTotal, cBound, tTotal, tBound) => ({
  color: { total: cTotal, bound: cBound },
  type: { total: tTotal, bound: tBound },
});
const none = { textStyles: 0, paintStyles: 0, variableCollections: 0 };

// A typical light UI: white page, dark text, one accent, faint gray surfaces.
const palette = () => [
  color("#111111", 60, 60),
  color("#ffffff", 30),
  color("#6b7280", 20, 20),
  color("#2563eb", 12, 4),
  color("#f3f4f6", 8),
  color("#e5e7eb", 7),
  color("#dc2626", 3, 1),
  color("#000000", 4, 0, 0.08),
];

test("deltaE is zero for equal colors and small for near-duplicates", () => {
  assert.equal(p.deltaE("#3b82f6", "#3b82f6"), 0);
  assert.ok(p.deltaE("#3b82f6", "#3b83f6") < 1);
  assert.ok(p.deltaE("#3b82f6", "#ef4444") > 40);
});

test("near-duplicate colors merge into the most-used value", () => {
  const out = p.clusterColors([
    color("#3b82f6", 10, 2),
    color("#3b83f6", 3, 1),
    color("#3a82f5", 1),
    color("#ef4444", 5),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].hex, "#3b82f6");
  assert.equal(out[0].count, 14);
  assert.equal(out[0].text, 3);
  assert.equal(out[0].members.length, 3);
});

test("same hex at different opacity stays separate", () => {
  const out = p.clusterColors([color("#000000", 5), color("#000000", 3, 0, 0.5)]);
  assert.equal(out.length, 2);
});

test("roles: background, text, accent, feedback, surface, border", () => {
  const out = p.assignColorRoles(p.clusterColors(palette()));
  const role = (hex) => out.find((c) => c.hex === hex).role;
  assert.equal(role("#ffffff"), "background");
  assert.equal(role("#111111"), "text/primary");
  assert.equal(role("#6b7280"), "text/secondary");
  assert.equal(role("#2563eb"), "accent/primary");
  assert.equal(role("#dc2626"), "feedback/danger");
  assert.equal(role("#f3f4f6"), "surface");
  assert.equal(role("#e5e7eb"), "border");
  assert.equal(out.find((c) => c.opacity < 1).role, "border/subtle");
});

test("text color used on most nodes is not mistaken for the background", () => {
  const out = p.assignColorRoles(
    p.clusterColors([color("#111111", 200, 200), color("#ffffff", 10)])
  );
  assert.equal(out.find((c) => c.hex === "#ffffff").role, "background");
  assert.equal(out.find((c) => c.hex === "#111111").role, "text/primary");
});

test("dark themes get a dark background", () => {
  const out = p.assignColorRoles(
    p.clusterColors([color("#f5f5f5", 80, 80), color("#0b0b0f", 12)])
  );
  assert.equal(out.find((c) => c.hex === "#0b0b0f").role, "background");
  assert.equal(out.find((c) => c.hex === "#f5f5f5").role, "text/primary");
});

test("roles are unique", () => {
  const out = p.assignColorRoles(
    p.clusterColors([
      color("#ffffff", 20),
      color("#111111", 40, 40),
      color("#808080", 5),
      color("#909090", 5),
      color("#a0a0a0", 5),
      color("#c00000", 5),
    ])
  );
  const roles = out.map((c) => c.role);
  assert.equal(new Set(roles).size, roles.length);
});

test("type: sizes within 1px merge, body is the most-used size", () => {
  const merged = p.clusterType([
    type("Inter", "Regular", 16, 24, 40),
    type("Inter", "Regular", 15, 22, 3),
    type("Inter", "Bold", 32, 40, 5),
    type("Inter", "Bold", 20, 28, 8),
    type("Inter", "Regular", 12, 16, 9),
    type("Inter", "Regular", 10, 14, 2),
  ]);
  assert.equal(merged.length, 5);
  const named = p.assignTypeRoles(merged).map((s) => s.name);
  assert.deepEqual(JSON.parse(JSON.stringify(named)), [
    "Text/Heading/1 Bold",
    "Text/Heading/2 Bold",
    "Text/Body",
    "Text/Small",
    "Text/Caption",
  ]);
});

test("type style names are unique when families collide", () => {
  const named = p.assignTypeRoles(
    p.clusterType([type("Inter", "Regular", 16, 24, 10), type("Lora", "Regular", 16, 24, 4)])
  ).map((s) => s.name);
  assert.equal(new Set(named).size, 2);
});

test("readiness: fully tokenized file scores 100", () => {
  const r = p.scoreReadiness(
    tally(50, 50, 20, 20),
    { textStyles: 5, paintStyles: 0, variableCollections: 1 },
    [],
    [],
    0
  );
  assert.equal(r.score, 100);
  assert.equal(r.label, "Ready for Make");
});

test("readiness: raw file scores low and explains why", () => {
  const colors = p.assignColorRoles(p.clusterColors(palette()));
  const r = p.scoreReadiness(tally(100, 0, 40, 0), none, colors, [], 20);
  assert.ok(r.score < 50, "score " + r.score);
  assert.equal(r.label, "Not ready");
  assert.ok(r.findings.some((f) => f.includes("No color variables")));
  assert.ok(r.findings.some((f) => f.includes("100% of color and text uses")));
  assert.ok(r.findings.some((f) => f.includes("collapse into")));
});

test("readiness: a sprawling palette costs points", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ role: "x" + i }));
  const tight = Array.from({ length: 8 }, (_, i) => ({ role: "x" + i }));
  const tokens = { textStyles: 1, paintStyles: 1, variableCollections: 0 };
  const a = p.scoreReadiness(tally(10, 10, 10, 10), tokens, many, [], 40);
  const b = p.scoreReadiness(tally(10, 10, 10, 10), tokens, tight, [], 8);
  assert.ok(a.score < b.score);
});

test("guidelines list roles, hex values and the dominant font", () => {
  const kit = p.analyze({
    colors: palette(),
    type: [
      type("Inter", "Regular", 16, 24, 40),
      type("Inter", "Bold", 32, 40, 5),
    ],
    tally: tally(100, 0, 45, 0),
    existing: none,
  });
  const md = kit.guidelines;
  assert.match(md, /^# Brand guidelines/);
  assert.match(md, /Use Inter for all text\./);
  assert.match(md, /- background: #ffffff \(page background\)/);
  assert.match(md, /- text\/primary: #111111/);
  assert.match(md, /- Heading\/1 Bold: 32px Bold, line height 40px/);
  assert.match(md, /- Body: 16px Regular, line height 24px/);
  assert.match(md, /Do not introduce new colors, fonts or font sizes\./);
});
