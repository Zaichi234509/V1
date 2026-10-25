# Into the Mist — Muichiro Tokitō

A cinematic character study of Muichiro Tokitō, the Mist Hashira, built as a scrolling poster.

The layout follows the **pinned poster** direction from
[`leonxlnx/taste-skill`](https://github.com/leonxlnx/taste-skill) (tasteskill v2): something holds
still while everything else moves past it. The hero's name is pinned across the viewport while his
portraits and the ground colour change beneath it; the seven-form index scrolls past a held
photograph; a scroll-driven 3D fly-through carries the mist and the blade.

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

> On this page, **the seven forms of Mist Breathing** become **a flight through mist that ends on the
> blade**.

The visitor can do one thing the page is built around: scroll through the fly-through. Seven plates,
one per form, hang in fog at different depths; the camera slides past them, the fog thins as the
blade arrives, and the last screen turns the blade broadside. The canvas can also be dragged to look
around, the arrow keys work when it is focused, **R** resets the view, and motion can be paused.

## Sections

1. **The title** — `MUICHIRO` pinned over two portraits; the ground and the portrait change under the name as you scroll.
2. **Seven forms** — a held photograph on the left, the full technique index on the right; pointing at a form changes the photograph, selecting one opens the full description.
3. **The blade** — the 3D scroll fly-through (Three.js, dynamically imported).
4. **Obscuring Clouds** — a full-bleed frame with one card and a live "strike the frame" impact.
5. **Memory** — who he was, as a record sheet beside a close crop.
6. **Colophon** — the footer as a designed close: photograph half, menu half.

## Art direction

- **Direction:** pinned poster — a fixed element, a changing one.
- **Type:** Hanken Grotesk (one family) with Noto Serif JP for the Japanese, bundled locally via `@fontsource` and a subsetted JP font.
- **Colour:** pale mist ground `#dde9e6`, night-teal ink `#0a1d24`, deep field `#08191f`, one accent `#0d5b62`.
- **Motion:** scroll-linked only. Nothing captures the wheel; the scrollbar always tells the truth.

Reduced motion swaps the fly-through for the finished composition — the seven forms as a still grid.
If WebGL is unavailable or the module fails, the same still grid appears instead.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The page, the dialogs, and the 16-second edit. |
| `src/main.js` | Pinned hero, form index and dialog, reel player, reveals. |
| `src/fly-scene.js` | The scroll-driven 3D fly-through: plates drawn to canvas, camera, fog. |
| `src/katana.js` | The Nichirin blade and mist-trail geometry. |
| `src/styles.css` | Design tokens and every section's composition. |
| `src/reel.css` | The full-screen visual edit player. |
| `src/jp-font.css` | The subsetted Japanese web fonts. |

## Assets

Artwork is local (see [ASSETS.md](ASSETS.md)); there are no browser-facing CDNs. The page carries no
video: the only clip in this repository is of an unrelated character, and no honest footage of
Muichiro exists here, so the moving picture is the 3D scene instead.

Run `npm run subset:fonts` after changing the Japanese copy.

## Video toolkit

The earlier FFmpeg + HyperFrames + Groq setup remains available:

```bash
npm run doctor
npm run hyperframes -- --help
```

Groq API requests require a `GROQ_API_KEY` environment variable. `.env` files are git-ignored.
