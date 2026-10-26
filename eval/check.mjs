// Scores how closely generated code sticks to a Guidelines.md.
//
//   node eval/check.mjs --guidelines Guidelines.md --output generated.html [--min 90]
//
// Reports the share of distinct colors, the font and the font sizes in the
// output that appear in the guidelines. Named colors (e.g. "white") are not
// parsed, so use hex or rgb() in the files you check.
import fs from "node:fs";
import loadPlugin from "../test/load-plugin.js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, [])
);
if (!args.guidelines || !args.output) {
  console.error("usage: node eval/check.mjs --guidelines <Guidelines.md> --output <file> [--min <percent>]");
  process.exit(2);
}

const { deltaE } = loadPlugin();
const MATCH = 3; // same tolerance the plugin uses to merge near-duplicates

const expandHex = (h) =>
  "#" + (h.length === 3 ? h.split("").map((c) => c + c).join("") : h).toLowerCase();

function colorsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) out.add(expandHex(m[1]));
  for (const m of text.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/g)) {
    out.add("#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join(""));
  }
  return [...out];
}

const guidelines = fs.readFileSync(args.guidelines, "utf8");
const output = fs.readFileSync(args.output, "utf8");

const palette = colorsIn(guidelines);
const family = (guidelines.match(/Use (.+?) for all text/) || [])[1];
const sizes = new Set([...guidelines.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => m[1]));

const used = colorsIn(output);
const off = used.filter((c) => !palette.some((p) => deltaE(p, c) <= MATCH));
const onPct = used.length ? Math.round(((used.length - off.length) / used.length) * 100) : 100;

const families = [...output.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)].map((m) =>
  m[1].split(",")[0].trim().replace(/^["']|["']$/g, "")
);
const wrongFonts = family ? [...new Set(families.filter((f) => f.toLowerCase() !== family.toLowerCase()))] : [];

const usedSizes = [...new Set([...output.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m) => m[1]))];
const wrongSizes = usedSizes.filter((s) => !sizes.has(s));

console.log("colors:  " + onPct + "% on palette (" + used.length + " distinct used, " + off.length + " off)");
if (off.length) console.log("  off palette: " + off.join(", "));
console.log("fonts:   " + (wrongFonts.length ? "off brand: " + wrongFonts.join(", ") : "on brand" + (family ? " (" + family + ")" : "")));
console.log("sizes:   " + (usedSizes.length - wrongSizes.length) + "/" + usedSizes.length + " in scale" + (wrongSizes.length ? " (off: " + wrongSizes.map((s) => s + "px").join(", ") + ")" : ""));

if (args.min && onPct < Number(args.min)) process.exit(1);
