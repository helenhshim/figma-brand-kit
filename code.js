figma.showUI(__html__, { width: 360, height: 560, themeColors: true });

// Tunables. Values closer than these are merged into one token.
const MERGE_DELTA_E = 3; // CIE76 distance; about 2.3 is a just-noticeable difference
const MERGE_SIZE_PX = 1; // same family and weight, sizes this close become one style
const IDEAL_COLORS = 12;
const MAX_COLORS = 36;
const IDEAL_TYPE = 8;
const MAX_TYPE = 20;

// Latest scan result, used by buildKit.
let lastScan = null;

function sendSelection() {
  const sel = figma.currentPage.selection;
  figma.ui.postMessage({
    type: "selection",
    count: sel.length,
    names: sel.map((n) => n.name),
  });
}

function sendError(message) {
  figma.ui.postMessage({ type: "error", message });
}

function plural(n, one, many) {
  return n + " " + (n === 1 ? one : many);
}

// ---- Color math ----------------------------------------------------------

function toHex(c) {
  return (
    "#" +
    [c.r, c.g, c.b]
      .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

function fromHex(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function linearRgb(hex) {
  return [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
}

function relLuminance(hex) {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function toLab(hex) {
  const [r, g, b] = linearRgb(hex);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a, b) {
  const p = toLab(a);
  const q = toLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function toHsl(hex) {
  const { r, g, b } = fromHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s, l };
}

// ---- Merge near-duplicates and name by role ------------------------------

// `colors` is sorted by count, so the most-used value represents its cluster.
function clusterColors(colors) {
  const out = [];
  for (const c of colors) {
    const home = out.find(
      (o) => o.opacity === c.opacity && deltaE(o.hex, c.hex) <= MERGE_DELTA_E
    );
    if (home) {
      home.count += c.count;
      home.text += c.text;
      home.members.push(c.key);
    } else {
      out.push({
        hex: c.hex,
        opacity: c.opacity,
        count: c.count,
        text: c.text,
        members: [c.key],
      });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

const ROLE_ORDER = [
  "background", "text", "surface", "border", "accent", "feedback", "neutral", "overlay", "other",
];

function roleRank(role) {
  const i = ROLE_ORDER.indexOf(role.split("/")[0]);
  return i === -1 ? ROLE_ORDER.length : i;
}

function hueRole(h) {
  if (h < 20 || h >= 340) return "feedback/danger";
  if (h < 70) return "feedback/warning";
  if (h < 170) return "feedback/success";
  return "accent/secondary";
}

// Heuristic: a role is a best guess from where a color is used (text vs
// shapes), lightness, chroma and contrast. Names are editable in Figma.
function assignColorRoles(clusters) {
  const seen = {};
  const label = (role) => {
    seen[role] = (seen[role] || 0) + 1;
    return seen[role] === 1 ? role : role + "-" + seen[role];
  };
  const done = new Set();
  const take = (c, role) => {
    c.role = label(role);
    done.add(c);
  };
  const left = (list) => list.filter((c) => !done.has(c));
  const lab = new Map(
    clusters.map((c) => {
      const [L, a, b] = toLab(c.hex);
      return [c, { L, C: Math.hypot(a, b), h: toHsl(c.hex).h }];
    })
  );
  const isNeutral = (c) => lab.get(c).C < 12;
  const isExtreme = (c) => lab.get(c).L > 85 || lab.get(c).L < 15;
  const shapes = (c) => c.count - c.text;
  const byShapes = (a, b) => shapes(b) - shapes(a);
  const byText = (a, b) => b.text - a.text;

  const opaque = clusters.filter((c) => c.opacity === 1);
  const bg =
    opaque.filter((c) => shapes(c) > 0 && isNeutral(c) && isExtreme(c)).sort(byShapes)[0] ||
    opaque.slice().sort(byShapes)[0];
  if (bg) {
    take(bg, "background");
    const readable = left(opaque)
      .filter((c) => c.text > 0 && contrast(c.hex, bg.hex) >= 4.5)
      .sort(byText);
    const primary = readable.find(isNeutral) || readable[0];
    if (primary) take(primary, "text/primary");
    const ceiling = primary ? contrast(primary.hex, bg.hex) : Infinity;
    const secondary = left(opaque)
      .filter((c) => {
        const k = contrast(c.hex, bg.hex);
        return c.text > 0 && isNeutral(c) && k >= 3 && k < ceiling;
      })
      .sort(byText)[0];
    if (secondary) take(secondary, "text/secondary");
  }

  left(opaque)
    .filter((c) => !isNeutral(c) && lab.get(c).L > 15 && lab.get(c).L < 92)
    .forEach((c, i) => take(c, i === 0 ? "accent/primary" : hueRole(lab.get(c).h)));

  if (bg) {
    const faint = left(opaque)
      .filter((c) => isNeutral(c) && contrast(c.hex, bg.hex) < 3)
      .sort((a, b) => deltaE(a.hex, bg.hex) - deltaE(b.hex, bg.hex));
    faint.forEach((c, i) => take(c, i === 0 ? "surface" : "border"));
  }
  left(opaque).filter(isNeutral).forEach((c) => take(c, "neutral"));

  clusters
    .filter((c) => c.opacity < 1)
    .forEach((c) => take(c, c.opacity <= 0.2 ? "border/subtle" : "overlay"));
  left(clusters).forEach((c) => take(c, "other"));

  return clusters.sort((a, b) => roleRank(a.role) - roleRank(b.role) || b.count - a.count);
}

function clusterType(type) {
  const out = [];
  for (const t of type) {
    const home = out.find(
      (o) =>
        o.family === t.family &&
        o.style === t.style &&
        Math.abs(o.size - t.size) <= MERGE_SIZE_PX
    );
    if (home) {
      home.count += t.count;
      home.members.push(t.key);
    } else {
      out.push({
        family: t.family,
        style: t.style,
        size: t.size,
        lineHeight: t.lineHeight,
        count: t.count,
        members: [t.key],
      });
    }
  }
  return out;
}

// The most-used size is Body. Larger sizes are Heading/1.., smaller are
// Small and Caption.
function assignTypeRoles(styles) {
  if (styles.length === 0) return styles;
  const body = styles.reduce((m, s) => (s.count > m.count ? s : m), styles[0]);
  const sizes = Array.from(new Set(styles.map((s) => s.size))).sort((a, b) => b - a);
  const larger = sizes.filter((z) => z > body.size);
  const smaller = sizes.filter((z) => z < body.size);
  const base = (z) => {
    if (z === body.size) return "Body";
    if (z > body.size) return "Heading/" + (larger.indexOf(z) + 1);
    const i = smaller.indexOf(z);
    return i === 0 ? "Small" : i === 1 ? "Caption" : "Caption/" + i;
  };

  const used = new Set();
  const ordered = styles.slice().sort((a, b) => b.size - a.size || b.count - a.count);
  for (const s of ordered) {
    let name = base(s.size) + (s.style === "Regular" ? "" : " " + s.style);
    if (used.has(name)) name += " " + s.family;
    for (let n = 2; used.has(name); n++) name = name.replace(/ \d+$/, "") + " " + n;
    used.add(name);
    s.role = name;
    s.name = "Text/" + name;
  }
  return ordered;
}

// ---- Make-readiness score ------------------------------------------------

function ramp(n, ideal, max) {
  if (n <= ideal) return 1;
  if (n >= max) return 0;
  return 1 - (n - ideal) / (max - ideal);
}

// 0-100: tokens defined (30), uses bound to them (30), tight palette (20),
// tight type scale (20).
function scoreReadiness(tally, existing, colors, type, rawColorCount) {
  const findings = [];
  const colorTokens = existing.variableCollections > 0 || existing.paintStyles > 0;
  const typeTokens = existing.textStyles > 0;
  if (!colorTokens) findings.push("No color variables or styles in this file.");
  if (!typeTokens) findings.push("No text styles in this file.");

  const total = tally.color.total + tally.type.total;
  const bound = tally.color.bound + tally.type.bound;
  const coverage = total === 0 ? 1 : bound / total;
  if (coverage < 1) {
    findings.push(
      Math.round((1 - coverage) * 100) + "% of color and text uses are hard-coded."
    );
  }

  if (rawColorCount > colors.length) {
    findings.push(
      plural(rawColorCount, "hard-coded color", "hard-coded colors") +
        " collapse into " + colors.length + " after merging near-duplicates."
    );
  }
  if (colors.length > IDEAL_COLORS) {
    findings.push(colors.length + " distinct colors. A palette usually needs " + IDEAL_COLORS + " or fewer.");
  }
  if (type.length > IDEAL_TYPE) {
    findings.push(type.length + " text styles. A type scale usually needs " + IDEAL_TYPE + " or fewer.");
  }

  const score = Math.round(
    (colorTokens ? 15 : 0) +
      (typeTokens ? 15 : 0) +
      30 * coverage +
      20 * ramp(colors.length, IDEAL_COLORS, MAX_COLORS) +
      20 * ramp(type.length, IDEAL_TYPE, MAX_TYPE)
  );
  const label = score >= 80 ? "Ready for Make" : score >= 50 ? "Close" : "Not ready";
  return { score, label, findings };
}

// ---- Guidelines.md -------------------------------------------------------

const ROLE_HINTS = {
  background: "page background",
  "text/primary": "default text",
  "text/secondary": "supporting text",
  surface: "cards and panels",
  border: "dividers and outlines",
  "border/subtle": "hairlines and shadows",
  "accent/primary": "buttons, links and key actions",
  "accent/secondary": "secondary highlights",
  "feedback/danger": "errors and destructive actions",
  "feedback/warning": "warnings",
  "feedback/success": "success states",
};

function buildGuidelines(colors, type) {
  const out = ["# Brand guidelines", ""];

  if (type.length) {
    const byFamily = {};
    type.forEach((t) => {
      byFamily[t.family] = (byFamily[t.family] || 0) + t.count;
    });
    const family = Object.keys(byFamily).sort((a, b) => byFamily[b] - byFamily[a])[0];
    out.push("## Typography", "", "Use " + family + " for all text.", "");
    type.forEach((t) => {
      const lh = t.lineHeight === "auto" ? "auto" : t.lineHeight + "px";
      out.push("- " + t.role + ": " + t.size + "px " + t.style + ", line height " + lh);
    });
    out.push("");
  }

  if (colors.length) {
    out.push("## Colors", "", "Use only these colors, by role.", "");
    colors.forEach((c) => {
      const hint = ROLE_HINTS[c.role];
      const alpha = c.opacity < 1 ? " at " + Math.round(c.opacity * 100) + "% opacity" : "";
      out.push("- " + c.role + ": " + c.hex + alpha + (hint ? " (" + hint + ")" : ""));
    });
    out.push("");
  }

  out.push(
    "## Rules",
    "",
    "- Use only the colors and type styles above.",
    "- Do not introduce new colors, fonts or font sizes.",
    "- Name colors by role (for example --color-text-primary), not by hex value."
  );
  return out.join("\n") + "\n";
}

// ---- Scan ----------------------------------------------------------------

function bump(map, key, make) {
  const entry = map.get(key);
  if (entry) entry.count++;
  else map.set(key, Object.assign(make(), { key, count: 1 }));
}

function hasStyle(id) {
  return typeof id === "string" && id !== "";
}

function countUse(tally, isBound) {
  tally.total++;
  if (isBound) tally.bound++;
}

function addPaints(paints, ctx, isText) {
  if (!Array.isArray(paints)) return;
  for (const paint of paints) {
    if (paint.type !== "SOLID" || paint.visible === false) continue;
    const isBound = Boolean(paint.boundVariables && paint.boundVariables.color);
    countUse(ctx.tally.color, isBound);
    if (isBound) continue;
    const hex = toHex(paint.color);
    const alpha = paint.opacity === undefined ? 1 : paint.opacity;
    const pct = Math.round(alpha * 100);
    const key = pct === 100 ? hex : hex + " @" + pct + "%";
    bump(ctx.colors, key, () => ({ hex, opacity: pct / 100, text: 0 }));
    if (isText) ctx.colors.get(key).text++;
  }
}

function lineHeightLabel(lh, size) {
  if (lh.unit === "AUTO") return "auto";
  const px = lh.unit === "PERCENT" ? (lh.value / 100) * size : lh.value;
  return String(Number(px.toFixed(2)));
}

function addCombo(ctx, fontName, fontSize, lineHeight, styleId) {
  const isBound = hasStyle(styleId);
  countUse(ctx.tally.type, isBound);
  if (isBound) return;
  const lh = lineHeightLabel(lineHeight, fontSize);
  const key = fontName.family + " " + fontName.style + " " + fontSize + "/" + lh;
  bump(ctx.type, key, () => ({
    family: fontName.family,
    style: fontName.style,
    size: fontSize,
    lineHeight: lh,
  }));
}

function scanText(node, ctx) {
  const mixed =
    node.fontName === figma.mixed ||
    node.fontSize === figma.mixed ||
    node.lineHeight === figma.mixed ||
    node.textStyleId === figma.mixed;
  if (!mixed) {
    addCombo(ctx, node.fontName, node.fontSize, node.lineHeight, node.textStyleId);
    return;
  }
  const segments = node.getStyledTextSegments([
    "fontName",
    "fontSize",
    "lineHeight",
    "textStyleId",
  ]);
  for (const seg of segments) {
    addCombo(ctx, seg.fontName, seg.fontSize, seg.lineHeight, seg.textStyleId);
  }
}

function scanNode(node, ctx) {
  if ("fills" in node) {
    if (node.fills === figma.mixed) {
      // Text with per-range fills: read them from the segments instead.
      if (node.type === "TEXT") {
        for (const seg of node.getStyledTextSegments(["fills", "fillStyleId"])) {
          if (hasStyle(seg.fillStyleId)) countUse(ctx.tally.color, true);
          else addPaints(seg.fills, ctx, true);
        }
      }
    } else if (hasStyle(node.fillStyleId)) {
      countUse(ctx.tally.color, true);
    } else {
      addPaints(node.fills, ctx, node.type === "TEXT");
    }
  }
  if ("strokes" in node) {
    if (hasStyle(node.strokeStyleId)) countUse(ctx.tally.color, true);
    else addPaints(node.strokes, ctx);
  }
  if (node.type === "TEXT") scanText(node, ctx);
}

const byCount = (a, b) => b.count - a.count;

// Pure: turns raw scan output into the kit, score and guidelines.
function analyze(raw) {
  const colors = assignColorRoles(clusterColors(raw.colors));
  const type = assignTypeRoles(clusterType(raw.type));
  const readiness = scoreReadiness(raw.tally, raw.existing, colors, type, raw.colors.length);
  return {
    colors,
    type,
    rawColorCount: raw.colors.length,
    rawTypeCount: raw.type.length,
    existing: raw.existing,
    readiness,
    guidelines: buildGuidelines(colors, type),
  };
}

async function scan() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    sendError("Select one or more frames to scan.");
    return;
  }

  const ctx = {
    colors: new Map(),
    type: new Map(),
    tally: { color: { total: 0, bound: 0 }, type: { total: 0, bound: 0 } },
  };
  for (const root of sel) {
    scanNode(root, ctx);
    if ("findAll" in root) {
      for (const node of root.findAll()) scanNode(node, ctx);
    }
  }
  if (ctx.tally.color.total + ctx.tally.type.total === 0) {
    sendError("Nothing to scan. Select frames that contain fills, strokes or text.");
    return;
  }

  const [textStyles, paintStyles, collections] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);

  lastScan = analyze({
    colors: Array.from(ctx.colors.values()).sort(byCount),
    type: Array.from(ctx.type.values()).sort(byCount),
    tally: ctx.tally,
    existing: {
      textStyles: textStyles.length,
      paintStyles: paintStyles.length,
      variableCollections: collections.length,
    },
  });
  figma.ui.postMessage({ type: "scan-result", scan: lastScan });
}

// ---- Build kit -----------------------------------------------------------

function mergedNote(members) {
  return members.length > 1 ? "Merged from " + members.join(", ") : "";
}

async function buildKit() {
  if (!lastScan) {
    sendError("Scan first, then build the kit.");
    return;
  }
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  if (collections.some((c) => c.name === "Brand")) {
    sendError("A Brand collection already exists. Delete it to rebuild.");
    return;
  }

  figma.commitUndo();
  const variables = [];
  const textStyles = [];

  const collection = figma.variables.createVariableCollection("Brand");
  for (const c of lastScan.colors) {
    const variable = figma.variables.createVariable("color/" + c.role, collection, "COLOR");
    variable.scopes = ["ALL_FILLS", "STROKE_COLOR"];
    variable.description = mergedNote(c.members);
    variable.setValueForMode(collection.defaultModeId, { ...fromHex(c.hex), a: c.opacity });
    variables.push(variable.name);
  }

  for (const t of lastScan.type) {
    await figma.loadFontAsync({ family: t.family, style: t.style });
    const style = figma.createTextStyle();
    style.name = t.name;
    style.description = mergedNote(t.members);
    style.fontName = { family: t.family, style: t.style };
    style.fontSize = t.size;
    style.lineHeight =
      t.lineHeight === "auto"
        ? { unit: "AUTO" }
        : { unit: "PIXELS", value: Number(t.lineHeight) };
    textStyles.push(style.name);
  }
  figma.commitUndo();

  figma.ui.postMessage({
    type: "build-result",
    collection: "Brand",
    variables,
    textStyles,
  });
}

figma.ui.onmessage = (msg) => {
  if (msg.type === "build-kit") {
    buildKit().catch((err) => {
      sendError("Build failed: " + (err && err.message ? err.message : err));
    });
    return;
  }
  if (msg.type !== "scan") return;
  sendSelection();
  scan().catch((err) => {
    sendError("Scan failed: " + (err && err.message ? err.message : err));
  });
};

figma.on("selectionchange", sendSelection);

sendSelection();
