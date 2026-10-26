# Before and after test

Does a brand kit make Figma Make's output more on-brand? This is the protocol and the scorer. No results are recorded yet. Fill in [results.md](results.md) after a run.

## Protocol

1. Pick a design file with a real look (colors, one font, a type scale).
2. Run the plugin on its frames. Build the brand kit and copy the `Guidelines.md`.
3. In Figma Make, run each prompt in [prompts.md](prompts.md) twice, in fresh sessions:
   - **Without:** no design system, no guidelines.
   - **With:** the brand kit library attached and `Guidelines.md` added.
4. Export or copy the generated code for each run into a file.
5. Score each file:

```bash
node eval/check.mjs --guidelines Guidelines.md --output run-with-prompt1.html
```

It reports the share of distinct colors that match the palette (within the same tolerance the plugin uses to merge near-duplicates), whether the font matches, and how many font sizes are in the scale.

## What to record

Per prompt and condition: colors on palette, font on brand, sizes in scale. Note the Make version and date, since the product changes fast. Run each prompt at least three times per condition, because generation varies.

## Fixtures

`fixtures/` holds synthetic files that only exist to test the scorer (`npm test`). They are not Make output and are not evidence.

## Limits

- Parses hex and `rgb()` colors, not named colors or CSS variables resolved elsewhere.
- Measures adherence, not taste. A page can be on palette and still look wrong.
- Small samples. Treat a result as a signal, not proof.
