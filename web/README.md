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

## Image assets

The scenery plates are **hotlinked from the Unsplash CDN**. The Unsplash licence
grants an irrevocable, worldwide right to use the photos free, including
commercially, with no attribution required; credits are listed below anyway.

Every remote image carries a `data-fallback` attribute pointing at a bundled
local plate. A capture-phase `error` listener in `<head>` swaps to it if the CDN
is unreachable, so the page can never show a broken image:

```html
<img src="https://images.unsplash.com/photo-…" data-fallback="/img/layer-bg.jpg" alt="" />
```

The listener must be inline in `<head>` and use the capture phase — resource
load errors do not bubble, and a deferred module would register too late.

17 images total: 13 remote with fallbacks, 4 local (the keyed character cutout,
used three times, plus the composited beat frame).

### Credits

| Slot | Photo | Photographer |
| --- | --- | --- |
| hero background | misty karst mountains above a river | Toxic Smoker |
| hero mid / bokeh | lights hanging from a tree | Andrew Yu |
| band base plate | street under red lanterns | Andrew Yu |
| band swap plate | sun through foggy trees | Pascal Debrunner |
| whip shot A | jagged misty peaks | Willian Justen de Vasconcellos |
| whip shot B | red paper lanterns | H&CO |
| whip shot C | green mountain in fog | Jonathan Mabey |
| grade demo | crepuscular rays over trees | Artem Sapegin |
| beat frames | lantern roof / foggy aerial / lanterns at night | Andrew Yu, Neven Krcmarek, Barry |

### The character

Generated placeholder art inspired by Hu Tao, chroma-keyed to a clean alpha
channel — **not** the official character design. The band reveal requires a
cutout with real transparency, which no stock photo provides, and HoYoverse's
fan-content policy permits non-commercial fan use but excludes direct reposting
of official art. Source plate and the keying recipe: `assets-src/README.md`.

> Hu Tao and Genshin Impact are properties of HoYoverse.
> © All rights reserved by miHoYo. Other properties belong to their respective owners.


## Notes

- `prefers-reduced-motion: reduce` disables the flash pulses, motion blur and
  grain, and collapses the pinned scrubs.
- The whip-pan motion blur decays on the **ticker**, not in `onUpdate` —
  `onUpdate` only fires while the scroll is moving, so applying blur there
  leaves the cards permanently smeared once the user stops.
- `vite.config.js` sets `allowedHosts: ['.e2b.app', ...]`; without it the
  sandbox preview proxy gets a "Blocked request" response from Vite.
- Source plate provenance and the chroma-key recipe: `assets-src/README.md`.
- The `screen`-blended mid layer crushes its darks with a CSS `filter` before
  blending. A photographic plate carries far more mid-tone than the near-black
  particle render it replaced, and would otherwise wash the hero out.
