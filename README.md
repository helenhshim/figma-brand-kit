# Brand kit for Make

A Figma plugin that makes any design file ready for Figma Make. It scans selected frames for hard-coded colors and type, merges near-duplicates, names them by role, builds variables and text styles, drafts a `Guidelines.md`, and scores how Make-ready the file is.

## The problem

Make's output is only as on-brand as the system it is given. Most design files have no system. They have frames full of hard-coded hex values, one-off font sizes and 14 slightly different blues. A published library fixes that, but only if someone has already built one.

## What it does

1. **Scan** the selection for fills, strokes and text that are not bound to a variable or style.
2. **Merge** near-duplicate colors (CIE76 distance of 3 or less) and font sizes within 1px.
3. **Name by role**: `background`, `text/primary`, `accent/primary`, `surface`, `border`, `feedback/danger`. Type becomes `Heading/1`, `Body`, `Small`. Roles are heuristics, so rename in Figma if one is wrong.
4. **Build** a `Brand` variable collection and text styles, with merged values noted in each description.
5. **Write** a `Guidelines.md` from the roles for Make to follow. Rules come only from the scan, nothing invented.
6. **Score** Make-readiness from 0 to 100: tokens defined, uses bound to them, palette size, type scale size. Each deduction is explained.

## Why it is different

| | Starts from | Gives you |
|---|---|---|
| Published library | An existing, clean system | Shared components, styles, variables |
| Website capture (for example html.to.design) | A live website | Figma layers and styles of that site |
| Figma code layers | A code prototype or captured site | Editable code prototypes on the canvas |
| **This plugin** | Your own messy design frames | A merged, role-named kit, Make guidelines and a readiness score |

What nobody else in that table does: infer a system from a design file, write the guidelines Make reads, and tell you what is wrong with the file.

## Where it fits in Figma's positioning

Figma is closing the gap between design and code through libraries, Make and, since October 2026, [code layers](https://www.figma.com/blog/design-together-with-code-layers/). Those all assume an input that is already structured. This plugin sits upstream and makes an unstructured file structured. As far as I could find, Figma's code layers announcement does not cover extracting variables, styles or guidelines.

The bet is that Make output is bounded by the quality of the system it is given. If Figma ships native extraction, the scan becomes a commodity. What stays valuable is the judgment on top: merging, role naming, guidelines that change Make's behavior, and the readiness audit. The plugin is built around those.

## Limits

- Variables and text styles only. No components, which Make kits lean on.
- It does not bind existing nodes to the new variables, so the readiness score rises only partly after a build.
- Roles are heuristics (usage, lightness, chroma, contrast). Review them and rename in Figma where one is off.
- Output still needs to be published as a library for Make to use it as one.

## Use it

Figma desktop: Plugins > Development > Import plugin from manifest, then pick `manifest.json`. The `id` in the manifest is a placeholder. Figma assigns your own when you import it.

Select frames, then Scan. Review the roles, then Build brand kit and copy `Guidelines.md`.

## Develop

No dependencies. Node 20 or later.

```bash
npm test
node eval/check.mjs --guidelines Guidelines.md --output generated.html
```

- [code.js](code.js) is the plugin (scan, analysis, build). Analysis functions are pure and run without Figma.
- [ui.html](ui.html) is the panel.
- [eval/](eval/) scores generated code against a `Guidelines.md`.
- [docs/case-study.md](docs/case-study.md) is the product write-up.
- `scripts/prepublish-check.sh` scans the repo for personal details and secrets before publishing.

## License

MIT
