# Into the Mist — Muichiro Tokitō, an anime scroll story

A cinematic character study of Muichiro Tokitō, the Mist Hashira, rebuilt as **one scrubbed
timeline drawn like an anime short**.

The direction follows the public description of the **kaminari** template on
[uberdesigner.ai](https://uberdesigner.ai/t/kaminari): cel-shaded subjects with ink outlines, a
painted valley backdrop, one scroll-scrubbed camera timeline, film-style headlines that blur in
word by word, and telemetry boxes pinned to points in the 3D. Everything is rebuilt here from
scratch in Vite and Three.js, with original generated anime-style artwork (see
[ASSETS.md](ASSETS.md)).

## Run the website

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## The idea

> On this page, **the seven forms of Mist Breathing** become **one film you scrub with the
> scrollbar** — wide over the valley, down into the fog, past seven hanging plates, close on the
> blade, then broadside into the clear.

## Sections

1. **The hero** — one full-bleed cel; the name blurs in word by word over a counting slate.
2. **The story** — a 720vh sticky stage. Scrolling scrubs one Three.js timeline: the painted
   valley, the dive into fog, seven form plates hanging at depth, the cel-shaded katana turning
   broadside. Three telemetry boxes pin themselves to the blade tip, the guard and the mist; film
   headlines blur in per beat. The canvas can be dragged to look around, arrow keys work when it is
   focused, **R** resets, and motion can be paused.
3. **The seven forms** — a held cel on the left, the full technique index on the right; pointing at
   a form changes the cel, selecting one opens the full description.
4. **Obscuring Clouds** — a full-bleed strike frame with one card and a live "strike the frame" hit.
5. **Memory** — the record sheet beside a close cel.
6. **Colophon** — the footer as a designed close: quiet stream half, menu half.

Reduced motion, missing WebGL or a failed module all swap the fly-through for the finished
composition — the seven forms as a still grid.

## Art direction

- **Direction:** kaminari — the anime short: cel shading, ink outlines, one scrubbed timeline.
- **Type:** Hanken Grotesk for the latin voice, JetBrains Mono for slates and telemetry, Noto Serif
  JP for the Japanese; all bundled locally, no browser-facing CDNs.
- **Colour:** ink ground `#07090c`, cel white `#f1f6f4`, mist teal `#6fe0c8`, one strike vermilion
  `#ff4b33`.
- **Motion:** scroll-linked only. Nothing captures the wheel; the scrollbar always tells the truth.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The page, the preloader and the dialogs. |
| `src/main.js` | Preloader, word-blur, story wiring, form index and dialog, strike, reveals. |
| `src/anime-scene.js` | The scrubbed cel-shaded timeline: camera shots, plates, mist, anchors. |
| `src/katana.js` | The Nichirin blade in toon shading with inverted-hull ink outlines. |
| `src/styles.css` | Design tokens and every section's composition. |
| `src/jp-font.css` | The subsetted Japanese web fonts. |
| `scripts/shoot.mjs` | The look-and-fix loop: screenshots the running site into `renders/`. |

Run `npm run subset:fonts` after changing the Japanese copy.

## Look-and-fix

With the dev server running, render the page to PNGs and look at them before calling the work
done (writes to `renders/`, which is git-ignored):

```bash
node scripts/shoot.mjs
```

## Video toolkit

The earlier FFmpeg + HyperFrames + Groq setup remains available:

```bash
npm run doctor
npm run hyperframes -- --help
```

Groq API requests require a `GROQ_API_KEY` environment variable. `.env` files are git-ignored.
