# Case study: making design files Make-ready

Outline with the evidence this project has so far. Items marked TODO need real data before this is published.

## Context

Figma Make generates working prototypes from prompts and can follow a design system and written guidelines. Its output depends on what it is given. This project is a Figma plugin that builds that input from an ordinary design file.

## Ambiguity

- Who is the user: a solo designer with one file, or a team with a library? I assumed the solo designer, because teams with a library are already served.
- What does Make actually respond to: variables, styles, written guidelines, or all three? Not known. This is the main open question and the reason for the test in [eval/](../eval/README.md).
- Is extraction the product, or the judgment on top of it? I treated extraction as a commodity from the start.

Not done on purpose: components, binding existing nodes to new variables, theming and modes, and a hosted service. Each widens scope before the core claim is tested.

## User insight

Hypothesis (TODO: validate with 3 to 5 designers): most design files have no system, so Make output drifts off-brand and people fix it by hand in prompts. The signal that would confirm it is a file with 15 or more distinct colors and no variables, which is common in exported or AI-assisted designs.

## System design

Scan, then analyze, then build.

- **Scan** counts fills, strokes and text, separating bound from hard-coded uses and text from shape uses.
- **Analyze** (pure functions, unit tested): merge near-duplicates by perceptual distance, assign roles from usage and contrast, name the type scale, score readiness, write guidelines.
- **Build** creates a `Brand` variable collection and text styles, noting merged values in descriptions.

Key design choice: separate analysis from the Figma API so it can be tested in Node with a stubbed `figma`. That is why the logic is testable without opening Figma.

## Decisions and tradeoffs

| Decision | Chose | Gave up |
|---|---|---|
| Merge threshold | Perceptual distance of 3 | Some real near-matches stay separate. A threshold of 4 merged a light gray surface into white, so I lowered it. |
| Background detection | Shape usage, not total usage | Text nodes use dark colors far more often, so total count picked the text color as the background. |
| Roles | Heuristic names the user can edit | Guaranteed correctness. Roles are guesses. |
| Guidelines | Only rules derived from the scan | Opinionated style rules like "prefer whitespace", which I removed because they were invented, not observed. |
| Score | Four transparent parts with reasons | A single clever number. Every deduction is explained. |

## Landscape

- Published libraries need an existing system.
- Website capture tools (html.to.design and similar) turn a live site into layers and styles.
- Figma code layers (open beta October 15, 2026) bring code prototypes onto the canvas and can capture a live site. The launch post does not describe extracting variables, styles or guidelines.
- All of these start from something already structured. This starts from the unstructured design file.

## Experimentation

Built and not yet run: same prompts in Make with and without the kit, scored for palette, font and type-scale adherence. See [eval/](../eval/README.md). TODO: run, record in [eval/results.md](../eval/results.md), and report what failed, not only what worked.

## Outcome

TODO: fill from the eval. Do not claim results until the test is run. What exists today: 15 passing unit tests, a working plugin, and a scorer that separates on-brand from off-brand fixtures.

## If rebuilt today with AI

- Replace heuristic roles with an LLM pass that reads the frames visually and names roles from context (a primary button color versus a decorative one), with the heuristic as the fallback and the check.
- Generate the `Guidelines.md` prose with a model from the kit, then verify it with the scorer rather than trusting it.
- Close the loop: run Make, score the output, and revise the guidelines until adherence passes a threshold.
- Risk: model-written guidelines that sound right and do not change Make's behavior. The eval is how to tell.

## If Figma ships this natively

- Keep the readiness audit and merging quality, and lean on whichever Figma output is best as the input.
- Reposition as a Make-readiness check rather than a builder.
- The case study stays valid either way. It documents how the problem was framed and tested.
