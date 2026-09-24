# EDIT DECODED — the measured edit, rebuilt in code

A parallax-scroll site that recreates, as web effects, every cut and effect
`vfxscan` measured in the analysed TikTok edit (see `../docs/cartethyia/REPORT.md`).

Hu Tao is the sample subject. The artwork is **AI-generated stylised placeholder
art**, not the official character design.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Stack

| Choice | Why |
| --- | --- |
| **GSAP + ScrollTrigger** | The standard for complex scroll timelines; fully free since v3.13 (Apr 2025), including ScrollTrigger. |
| **Lenis** (~3 kB) | Smooth-scroll layer with no wrapper DOM requirement. |
| **Vite** | Dev server + build. |
| CSS `animation-timeline` | Used only as a progressive enhancement behind `@supports`, with a JS fallback. |

Lenis is driven from **GSAP's ticker** (with `lagSmoothing(0)`) rather than its own
RAF loop, so GSAP, ScrollTrigger and Lenis all read one clock. Locomotive Scroll was
rejected: it translates a wrapper element, which breaks the `position: sticky`
pinning these sections depend on.

## The ten effects, and the measurement each one comes from

| # | Effect | Measured in the source | Rebuilt as |
| --- | --- | --- | --- |
| 01 | Parallax depth | every shot carries a slow push | 4 layers scrubbed at 0.12 / 0.34 / 0.62 / 0.92 |
| 02 | **Band reveal** | the signature move, ~9.1–10.2s, ~12.4s, ~14.4–15.6s | two stacked plates + animated `clip-path: inset()`, cutout above both |
| 03 | Whip pan | 19 detected in 16.3s | x-travel + blur/skew driven by `ScrollTrigger.getVelocity()` |
| 04 | Flash cut | 12 luma spikes, up to +122 | opacity pulse on a fixed overlay |
| 05 | Split tone | shadows R−B −19, highlights +16 | `multiply` teal + `screen` amber, scrubbed, with a live readout |
| 06 | Vignette | corners 45% darker than centre | fixed `radial-gradient` |
| 07 | Film grain | σ above the clean-footage floor | SVG `feTurbulence` |
| 08 | Letterbox | cinematic crop on hero shots | animated bars on the pinned sections |
| 09 | Beat sync | 100% of cuts within 120 ms of an onset, 177 BPM | scroll position as transport: 32 beats, cut + flash every 4th |
| 10 | Ken Burns push | sub-1% scale drift per frame | scale on scrub |

## Notes

- `prefers-reduced-motion: reduce` disables the flash pulses, motion blur and
  grain, and collapses the pinned scrubs.
- The whip-pan motion blur decays on the **ticker**, not in `onUpdate` —
  `onUpdate` only fires while the scroll is moving, so applying blur there
  leaves the cards permanently smeared once the user stops.
- `vite.config.js` sets `allowedHosts: ['.e2b.app', ...]`; without it the
  sandbox preview proxy gets a "Blocked request" response from Vite.
- Source plate provenance and the chroma-key recipe: `assets-src/README.md`.
