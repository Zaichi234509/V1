import './style.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ------------------------------------------------------------------
   Lenis + GSAP on ONE clock.
   Lenis smooths the raw scroll input; GSAP's ticker drives Lenis; and
   ScrollTrigger updates from Lenis's scroll event. Without this the
   three run on separate clocks and scrubbed animations visibly lag
   behind the page.
------------------------------------------------------------------- */
let lenis = null
if (!reduced) {
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: false,
  })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)
}

/* ==================================================================
   1. HERO — parallax depth
   Each layer translates by a fraction of the scroll distance. The
   spread between those fractions *is* the perceived depth.
================================================================== */
gsap.utils.toArray('#hero .layer').forEach((layer) => {
  const depth = parseFloat(layer.dataset.depth || '0')
  gsap.to(layer, {
    yPercent: -22 * depth * 3,
    scale: 1 + depth * 0.06,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'top top',
      end: 'bottom top',
      scrub: 1,
    },
  })
})

// Title lines rise in on load
if (!reduced) {
  gsap.from('#hero .title .line > span', {
    yPercent: 115,
    duration: 1.1,
    stagger: 0.09,
    ease: 'power3.out',
    delay: 0.15,
  })
  gsap.from('#hero .kicker, #hero .lede, #hero .scroll-hint', {
    opacity: 0,
    y: 18,
    duration: 0.9,
    stagger: 0.1,
    ease: 'power2.out',
    delay: 0.5,
  })
}

/* ==================================================================
   2. EXPLODED LAYERS — the same parallax, shown as separated planes
================================================================== */
const figs = gsap.utils.toArray('#exploded figure')
figs.forEach((fig, i) => {
  gsap.fromTo(
    fig,
    { yPercent: 8 * i, xPercent: -4 * i, rotateX: 14, rotateY: -16, z: -120 * i },
    {
      yPercent: -10 * i,
      xPercent: 5 * i,
      rotateX: 4,
      rotateY: -6,
      z: 40 * i,
      ease: 'none',
      scrollTrigger: {
        trigger: '#depth',
        start: 'top bottom',
        end: 'bottom top',
        scrub: 1,
      },
    }
  )
})

/* ==================================================================
   3. BAND REVEAL
   Two stacked plates; the top one is clipped to a horizontal strip
   whose half-height is driven by --band-h. The masked subject is
   painted ABOVE both plates, so she stays unbroken across the edge —
   which is exactly the tell that gives the technique away on video.
================================================================== */
const bandScene = document.querySelector('.band-scene')
ScrollTrigger.create({
  trigger: '#band',
  start: 'top top',
  end: '+=160%',
  pin: true,
  scrub: 0.6,
  onUpdate(self) {
    const p = self.progress
    // open fast, hold, then close
    const shape = p < 0.42 ? p / 0.42 : p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28
    const h = gsap.utils.clamp(0, 1, shape) * 30
    bandScene.style.setProperty('--band-h', `${h}%`)
  },
})

/* ==================================================================
   4. WHIP PAN
   Horizontal travel, with directional blur scaled by scroll velocity.
   On real footage this is what the detector sees: a spike in global
   motion paired with a collapse in sharpness.
================================================================== */
const track = document.querySelector('#whip-track')
if (track) {
  const distance = () => track.scrollWidth - window.innerWidth * 0.9
  let velocity = 0

  gsap.to(track, {
    x: () => -Math.max(0, distance()),
    ease: 'none',
    scrollTrigger: {
      trigger: '#whip',
      start: 'top top',
      end: () => '+=' + Math.max(600, distance()),
      pin: true,
      scrub: 0.8,
      invalidateOnRefresh: true,
      onUpdate(self) {
        velocity = self.getVelocity()
      },
    },
  })

  /* onUpdate only fires WHILE scrolling, so applying blur there leaves the
     cards permanently smeared the moment the user stops. Decay the value on
     the ticker instead, so motion blur always falls back to zero at rest. */
  if (!reduced) {
    let shown = 0
    gsap.ticker.add(() => {
      velocity *= 0.9
      const target = gsap.utils.clamp(-9, 9, -velocity / 900)
      shown += (target - shown) * 0.12
      if (Math.abs(shown) < 0.002 && Math.abs(velocity) < 1) {
        if (shown !== 0) { shown = 0; gsap.set(track, { skewX: 0, filter: 'blur(0px)' }) }
        return
      }
      // gsap.set writes through GSAP's transform cache, so skewX composes with
      // the scrubbed x instead of overwriting it.
      gsap.set(track, {
        skewX: shown,
        filter: `blur(${Math.min(14, Math.abs(shown) * 1.5).toFixed(2)}px)`,
      })
    })
  }
}

/* ==================================================================
   5. SPLIT-TONE GRADE — scrubbed 0 -> 1
================================================================== */
const gradeFrame = document.querySelector('#grade-frame')
const gradeVal = document.querySelector('#grade-val')
if (gradeFrame) {
  ScrollTrigger.create({
    trigger: '#grade',
    start: 'top 75%',
    end: 'bottom 60%',
    scrub: 0.7,
    onUpdate(self) {
      const g = self.progress
      gradeFrame.style.setProperty('--g', g.toFixed(3))
      const shadow = (-19 * g).toFixed(0)
      const high = (16 * g).toFixed(0)
      gradeVal.textContent =
        g < 0.03 ? 'ungraded' : `shadows R−B ${shadow} · highlights +${high}`
    },
  })
}

/* ==================================================================
   6. BEAT-SYNCED CUTTING @ 177 BPM
   The scroll position acts as the transport. Crossing a beat marker
   fires a hard cut to the next frame plus a one-frame flash — the
   same pairing the analyser found on the source clip.
================================================================== */
const BPM = 177
const BEATS = 32
const grid = document.querySelector('#beatgrid')
const frames = gsap.utils.toArray('#beat-frames img')
const flash = document.querySelector('#fx-flash')

if (grid) {
  grid.innerHTML = Array.from({ length: BEATS }, () => '<i></i>').join('')
  const ticks = gsap.utils.toArray('#beatgrid i')
  let lastBeat = -1

  ScrollTrigger.create({
    trigger: '#beat',
    start: 'top 80%',
    end: 'bottom 20%',
    scrub: true,
    onUpdate(self) {
      const beat = Math.floor(self.progress * BEATS)
      if (beat === lastBeat) return
      lastBeat = beat

      ticks.forEach((t, i) => t.classList.toggle('hit', i <= beat))

      if (frames.length) {
        frames.forEach((f) => f.classList.remove('is-on'))
        frames[beat % frames.length].classList.add('is-on')
      }
      // accent every 4th beat with a flash, like the source's flash hits
      if (!reduced && beat % 4 === 0) {
        gsap.fromTo(
          flash,
          { opacity: 0.55 },
          { opacity: 0, duration: 0.28, ease: 'power2.out', overwrite: true }
        )
      }
    },
  })
}

/* ==================================================================
   7. LETTERBOX BARS — close in over the cinematic sections
================================================================== */
const bars = gsap.utils.toArray('.fx-bars i')
;['#band', '#whip'].forEach((sel) => {
  if (!document.querySelector(sel)) return
  ScrollTrigger.create({
    trigger: sel,
    start: 'top 70%',
    end: 'bottom 30%',
    onEnter: () => gsap.to(bars, { height: '7vh', duration: 0.7, ease: 'power3.inOut' }),
    onLeave: () => gsap.to(bars, { height: 0, duration: 0.7, ease: 'power3.inOut' }),
    onEnterBack: () => gsap.to(bars, { height: '7vh', duration: 0.7, ease: 'power3.inOut' }),
    onLeaveBack: () => gsap.to(bars, { height: 0, duration: 0.7, ease: 'power3.inOut' }),
  })
})

/* ==================================================================
   8. EFFECT INDEX — built from what the analyser actually measured
================================================================== */
const INDEX = [
  ['Parallax depth', '4 layers at 0.12 / 0.34 / 0.62 / 0.92 scroll rate', 'ScrollTrigger scrub'],
  ['Band reveal', 'masked subject over two swapped plates', 'clip-path: inset()'],
  ['Whip pan', '19 detected in the source clip', 'blur + skew on velocity'],
  ['Flash cut', '12 luma spikes, up to +122', 'opacity pulse'],
  ['Split tone', 'shadows R−B −19, highlights +16', 'multiply + screen'],
  ['Vignette', 'corners 45% darker than centre', 'radial-gradient'],
  ['Film grain', 'σ above the clean-footage floor', 'SVG feTurbulence'],
  ['Letterbox', 'cinematic crop on hero shots', 'animated bars'],
  ['Beat sync', '100% of cuts within 120 ms, 177 BPM', 'scroll as transport'],
  ['Ken Burns push', 'sub-1% scale drift per frame', 'scale on scrub'],
]

const list = document.querySelector('#fx-index')
if (list) {
  list.innerHTML = INDEX.map(
    ([name, sub, how], i) => `
    <li>
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <span class="name">${name}<small>${sub}</small></span>
      <span class="how">${how}</span>
    </li>`
  ).join('')

  gsap.to('#fx-index li', {
    opacity: 1,
    y: 0,
    duration: 0.6,
    stagger: 0.06,
    ease: 'power2.out',
    scrollTrigger: { trigger: '#fx-index', start: 'top 82%' },
  })
}

/* ==================================================================
   9. HUD timecode + progress-bar fallback
================================================================== */
const hud = document.querySelector('#hud')
const bar = document.querySelector('#progress-bar')
const supportsSDA = CSS.supports('animation-timeline', 'scroll()')

const sections = gsap.utils.toArray('[data-effect]')
let current = ''

function onScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const p = max > 0 ? window.scrollY / max : 0

  // Only drive the bar from JS when the browser lacks scroll-driven CSS.
  if (!supportsSDA && bar) bar.style.transform = `scaleX(${p})`

  if (hud) {
    const total = 16.33 // length of the clip this page is modelled on
    const t = p * total
    const label = `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60)
      .toFixed(2)
      .padStart(5, '0')}`
    let active = ''
    for (const s of sections) {
      const r = s.getBoundingClientRect()
      if (r.top <= window.innerHeight * 0.5 && r.bottom >= window.innerHeight * 0.5) {
        active = s.dataset.effect
      }
    }
    if (active !== current) current = active
    hud.textContent = current ? `${label} · ${current}` : `${label} · scroll to play`
  }
}
window.addEventListener('scroll', onScroll, { passive: true })
onScroll()

window.addEventListener('load', () => ScrollTrigger.refresh())
