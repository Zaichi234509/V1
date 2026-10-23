# Into the Mist — Muichiro Tokito

A cinematic, responsive character-study website inspired by the editing language of the reference video in this repository.

## Run the website

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
npm run preview
```

## The edit, translated to the web

The 16-second reference uses rapid wide/close cuts, a glitch-style name card, masked inserts, vertical split screens, impact flashes, and a bright outro. The website adapts those techniques into:

- A full-screen animated Muichiro hero
- A scroll-driven wide → mask → close → impact sequence
- An interactive real-time 3D Nichirin sword with drag/keyboard rotation, glowing mist trails, particles, and scroll-driven camera movement
- Interactive panels and dialogs for all seven Mist Breathing forms
- A manual impact-frame experiment
- A replayable 16-second, eight-scene visual edit with pause and restart controls
- A quiet editorial outro and responsive mobile layouts

Press **Space** while the reel stage is focused to pause/resume, and **Escape** to close a dialog. In the 3D chapter, drag the sword or focus its canvas and use the **arrow keys**; **R** resets the view. Reduced-motion preferences are respected.

## Assets and implementation

The site uses Vite, vanilla JavaScript, Three.js/WebGL, CSS, local WebP artwork, inline SVG icons, and locally bundled Bebas Neue, Manrope, and subsetted Japanese fonts. It does not depend on browser-facing CDNs. Run `npm run subset:fonts` after changing the Japanese copy.

See [ASSETS.md](ASSETS.md) for artwork source pages. This is a fan-made, non-commercial character study.

## Video toolkit

The earlier FFmpeg + HyperFrames + Groq setup remains available:

```bash
npm run doctor
npm run hyperframes -- --help
```

Groq API requests require a `GROQ_API_KEY` environment variable. `.env` files are git-ignored.
