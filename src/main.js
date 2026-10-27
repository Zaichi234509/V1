import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './jp-font.css';
import './styles.css';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------------------
   The seven forms — one source of truth for the index, the dialog, the
   fly-through plates and the still fallback.
   ------------------------------------------------------------------------ */
const forms = [
  {
    kanji: '壱',
    ordinal: 'Form one of seven',
    title: 'Low Clouds, Distant Haze',
    lines: ['LOW CLOUDS,', 'DISTANT HAZE'],
    jp: '垂天遠霞',
    jpLong: '壱ノ型　垂天遠霞',
    gloss: 'One direct thrust. He closes the distance and makes a single point of contact.',
    description:
      'A direct, powerful frontal thrust. The movement is economical: close the distance at speed and make one precise point of contact.',
    image: '/images/anime-slash.jpg',
    position: '50% 45%',
  },
  {
    kanji: '弐',
    ordinal: 'Form two of seven',
    title: 'Eight-Layered Mist',
    lines: ['EIGHT-LAYERED', 'MIST'],
    jp: '八重霞',
    jpLong: '弐ノ型　八重霞',
    gloss: 'Eight cuts stacked one over another, each leaving less room to answer.',
    description:
      'Eight slashes arrive in rapid succession, layered one over another. The rhythm is the weapon — each cut leaves less room for an answer.',
    image: '/images/anime-impact.jpg',
    position: '50% 50%',
  },
  {
    kanji: '参',
    ordinal: 'Form three of seven',
    title: 'Scattering Mist Splash',
    lines: ['SCATTERING', 'MIST SPLASH'],
    jp: '霞散の飛沫',
    jpLong: '参ノ型　霞散の飛沫',
    gloss: 'A circle cut in one breath, wide enough to turn projectiles aside.',
    description:
      'A swift circular slash clears the space around the swordsman and can deflect incoming projectiles like mist breaking apart.',
    image: '/images/anime-valley.jpg',
    position: '50% 60%',
  },
  {
    kanji: '肆',
    ordinal: 'Form four of seven',
    title: 'Shifting Flow Slash',
    lines: ['SHIFTING FLOW', 'SLASH'],
    jp: '移流斬り',
    jpLong: '肆ノ型　移流斬り',
    gloss: 'From a low stance he flows into a dash, then into the cut.',
    description:
      'From a low stance, the swordsman flows into a sudden dash and slash. Stillness and acceleration share a single breath.',
    image: '/images/anime-slash.jpg',
    position: '30% 55%',
  },
  {
    kanji: '伍',
    ordinal: 'Form five of seven',
    title: 'Sea of Clouds and Haze',
    lines: ['SEA OF CLOUDS', 'AND HAZE'],
    jp: '霞雲の海',
    jpLong: '伍ノ型　霞雲の海',
    gloss: 'A zig-zag charge becomes a barrage, covering ground like cloud.',
    description:
      'A blistering zig-zag charge becomes a continuous barrage of slashes, covering a wide area like clouds closing over a landscape.',
    image: '/images/anime-valley.jpg',
    position: '50% 78%',
  },
  {
    kanji: '陸',
    ordinal: 'Form six of seven',
    title: 'Lunar Dispersing Mist',
    lines: ['LUNAR', 'DISPERSING MIST'],
    jp: '月の霞消',
    jpLong: '陸ノ型　月の霞消',
    gloss: 'A somersault of cuts, ending on one decisive vertical line.',
    description:
      'An airborne sequence of slashes unfolds around a somersault, ending in a decisive vertical cut through the mist.',
    image: '/images/anime-close.jpg',
    position: '50% 40%',
  },
  {
    kanji: '漆',
    ordinal: 'Form seven of seven',
    title: 'Obscuring Clouds',
    lines: ['OBSCURING', 'CLOUDS'],
    jp: '朧',
    jpLong: '漆ノ型　朧',
    gloss: 'His own form: tempo broken on purpose, until the eye loses him.',
    description:
      'Muichiro’s own creation. He fluctuates his tempo — appearing almost still, then accelerating so abruptly that he seems to vanish into a cloud of mist.',
    image: '/images/anime-hero.jpg',
    position: '50% 30%',
  },
];

/* ---------------------------------------------------------------------------
   Preloader: a counting slate that clears like fog.
   ------------------------------------------------------------------------ */
const preloader = document.querySelector('#preloader');
const preloaderCount = document.querySelector('#preloader-count');
const preloaderBar = document.querySelector('#preloader-bar');

function runPreloader() {
  if (!preloader) return Promise.resolve();
  document.body.classList.add('is-loading');
  return new Promise((resolve) => {
    if (reduceMotion) {
      preloader.classList.add('is-done');
      document.body.classList.remove('is-loading');
      resolve();
      return;
    }
    const start = performance.now();
    const duration = 1100;
    function tick(now) {
      const t = clamp((now - start) / duration);
      const value = Math.round(t * 100);
      if (preloaderCount) preloaderCount.textContent = String(value).padStart(3, '0');
      if (preloaderBar) preloaderBar.style.transform = `scaleX(${t})`;
      if (t < 1) requestAnimationFrame(tick);
      else {
        preloader.classList.add('is-done');
        document.body.classList.remove('is-loading');
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

/* ---------------------------------------------------------------------------
   Word-by-word blur-in: split every [data-words] into .w spans.
   ------------------------------------------------------------------------ */
function splitWords(root) {
  const nodes = [...root.childNodes];
  let delay = 0;
  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const words = node.textContent.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      words.forEach((word) => {
        if (!word.trim()) {
          fragment.append(word);
          return;
        }
        const span = document.createElement('span');
        span.className = 'w';
        span.style.transitionDelay = `${delay * 55}ms`;
        span.textContent = word;
        delay += 1;
        fragment.append(span);
      });
      root.replaceChild(fragment, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const wrap = document.createElement('span');
      wrap.className = 'w';
      wrap.style.transitionDelay = `${delay * 55}ms`;
      delay += 1;
      node.parentNode.insertBefore(wrap, node);
      wrap.append(node);
    }
  });
}

document.querySelectorAll('[data-words]').forEach(splitWords);

const wordObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-lit');
        wordObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.35 },
);
document.querySelectorAll('[data-words]').forEach((element) => wordObserver.observe(element));

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 },
);
document.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));

/* ---------------------------------------------------------------------------
   Frame: page progress + current section in the nav + header timecode
   ------------------------------------------------------------------------ */
const header = document.querySelector('#site-header');
const pageProgress = document.querySelector('#page-progress-bar');
const headerTimecode = document.querySelector('#header-timecode');
const navLinks = [...document.querySelectorAll('.main-nav a')];
const navSections = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

let pageFrame = 0;

function updatePage() {
  pageFrame = 0;
  const scrollTop = window.scrollY;
  const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  if (pageProgress) pageProgress.style.transform = `scaleX(${clamp(scrollTop / range).toFixed(4)})`;
  header?.classList.toggle('is-scrolled', scrollTop > 24);

  const line = header ? header.getBoundingClientRect().bottom + 40 : 80;
  let current = null;
  navSections.forEach((section) => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= line && rect.bottom >= line) current = section.id;
  });
  navLinks.forEach((link) =>
    link.classList.toggle('is-current', link.getAttribute('href') === `#${current}`),
  );
}

function requestPageUpdate() {
  if (!pageFrame) pageFrame = requestAnimationFrame(updatePage);
}

window.addEventListener('scroll', requestPageUpdate, { passive: true });
window.addEventListener('resize', requestPageUpdate);
requestPageUpdate();

/* ---------------------------------------------------------------------------
   The story: one scrubbed cel-shaded timeline, film headlines and telemetry
   pinned to 3D anchors. Falls back to a held still without motion or WebGL.
   ------------------------------------------------------------------------ */
const storySection = document.querySelector('#story');
const storyStage = document.querySelector('#story-stage');
const storyCanvas = document.querySelector('#blade-canvas');
const storyHeadlines = document.querySelector('#story-headlines');
const storyRail = document.querySelector('#story-rail-bar');
const storyBeat = document.querySelector('#story-beat');
const storyRest = document.querySelector('#blade-rest');
const storyRestGrid = document.querySelector('#blade-rest-grid');
const bladeStatus = document.querySelector('#blade-status');
const telTip = document.querySelector('#tel-tip');
const telMist = document.querySelector('#tel-mist');
const telGuard = document.querySelector('#tel-guard');
const telTipRead = document.querySelector('#tel-tip-read');
const telMistRead = document.querySelector('#tel-mist-read');
const telGuardRead = document.querySelector('#tel-guard-read');

if (storyHeadlines) {
  storyHeadlines.innerHTML = forms
    .map(
      (form) => `
      <li>
        <span class="kanji" lang="ja" aria-hidden="true">${form.kanji}</span>
        <h3>${form.title}</h3>
        <p class="gloss">${form.gloss}</p>
      </li>`,
    )
    .join('');
}

if (storyRestGrid) {
  storyRestGrid.innerHTML = forms
    .map(
      (form) => `
      <li>
        <img src="${form.image}" width="768" height="432" alt="" loading="lazy" />
        <b lang="ja">${form.kanji}</b>
        <span>${form.title}</span>
      </li>`,
    )
    .join('');
}

let activeBeat = -1;

function setBeat(index) {
  if (index === activeBeat) return;
  activeBeat = index;
  if (storyBeat) storyBeat.textContent = `FORM ${String(index + 1).padStart(2, '0')} / 07`;
  storyHeadlines
    ?.querySelectorAll('li')
    .forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === index));
}

function showStoryRest(message) {
  storyStage?.classList.add('is-rest');
  storyRest?.removeAttribute('hidden');
  storyCanvas?.setAttribute('hidden', '');
  document.querySelector('.story-overlay')?.setAttribute('hidden', '');
  if (bladeStatus && message) bladeStatus.textContent = message;
}

function placeTelemetry(box, anchor) {
  if (!box || !anchor) return;
  box.classList.toggle('is-off', !anchor.visible);
  if (anchor.visible) {
    const dx = Number(box.dataset.dx ?? 28);
    const dy = Number(box.dataset.dy ?? 0);
    box.style.transform = `translate3d(${anchor.x + dx}px, ${anchor.y + dy}px, 0) translateY(-50%)`;
  }
}

async function startStory() {
  if (reduceMotion) {
    showStoryRest('Motion is reduced, so the seven forms are held still instead of flown.');
    setBeat(0);
    return;
  }
  try {
    const { createAnimeScene } = await import('./anime-scene.js');
    await createAnimeScene({
      canvas: storyCanvas,
      section: storySection,
      stage: storyStage,
      motionButton: document.querySelector('#blade-motion'),
      status: bladeStatus,
      forms,
      onFrame({ progress, beat, anchors, telemetry }) {
        setBeat(beat);
        if (storyRail) storyRail.style.transform = `scaleX(${progress.toFixed(4)})`;
        if (headerTimecode) headerTimecode.textContent = telemetry.timecode;
        placeTelemetry(telTip, anchors.tip);
        placeTelemetry(telMist, anchors.mist);
        placeTelemetry(telGuard, anchors.guard);
        if (telTipRead) telTipRead.textContent = `${telemetry.altitude} M · ${telemetry.heading}°`;
        if (telMistRead) telMistRead.textContent = `${telemetry.density} MG/M³`;
        if (telGuardRead) telGuardRead.textContent = `${telemetry.timecode} / 00:16`;
      },
    });
    setBeat(0);
  } catch (error) {
    console.error('The anime scene could not start.', error);
    showStoryRest('This browser cannot run the 3D scene, so the seven forms are held still.');
    setBeat(0);
  }
}

/* ---------------------------------------------------------------------------
   The seven forms index: a held cel on the left, the list on the right.
   ------------------------------------------------------------------------ */
const formList = document.querySelector('#form-list');
const formsFrame = document.querySelector('.forms__frame');
const formsImage = document.querySelector('#forms-image');
const formsCaption = document.querySelector('#forms-caption');
const formDialog = document.querySelector('#form-dialog');
const dialogImage = document.querySelector('#form-dialog-image');
const dialogKicker = document.querySelector('#form-dialog-kicker');
const dialogJp = document.querySelector('#form-dialog-jp');
const dialogTitle = document.querySelector('#form-dialog-title');
const dialogDescription = document.querySelector('#form-dialog-description');
const dialogCount = document.querySelector('#form-dialog-count');
let activeForm = 0;
let imageTimer = 0;

if (formList) {
  formList.innerHTML = forms
    .map(
      (form, index) => `
      <li class="form-row${index === 0 ? ' is-active' : ''}" data-index="${index}">
        <button type="button" data-form-index="${index}" aria-label="Open ${form.ordinal}: ${form.title}">
          <span class="form-row__kanji" lang="ja" aria-hidden="true">${form.kanji}</span>
          <span class="form-row__name">${form.title}</span>
          <span class="form-row__jp" lang="ja">${form.jp}</span>
          <span class="form-row__gloss"><span>${form.gloss}</span></span>
        </button>
      </li>`,
    )
    .join('');
}

function setActiveForm(index) {
  if (!formsImage) return;
  const next = (index + forms.length) % forms.length;
  if (next === activeForm && formsImage.dataset.index === String(next)) return;
  activeForm = next;
  const form = forms[next];

  document.querySelectorAll('.form-row').forEach((row) => {
    row.classList.toggle('is-active', Number(row.dataset.index) === next);
  });

  window.clearTimeout(imageTimer);
  formsFrame?.classList.add('is-swapping');
  imageTimer = window.setTimeout(() => {
    formsImage.src = form.image;
    formsImage.style.objectPosition = form.position;
    formsImage.alt = `${form.title}, ${form.ordinal.toLowerCase()} of Mist Breathing.`;
    formsImage.dataset.index = String(next);
    if (formsCaption) formsCaption.textContent = `${form.kanji} — ${form.gloss}`;
    formsFrame?.classList.remove('is-swapping');
  }, 160);
}

formList?.addEventListener('pointerover', (event) => {
  const button = event.target.closest('[data-form-index]');
  if (button) setActiveForm(Number(button.dataset.formIndex));
});
formList?.addEventListener('focusin', (event) => {
  const button = event.target.closest('[data-form-index]');
  if (button) setActiveForm(Number(button.dataset.formIndex));
});

function updateFormDialog(index) {
  activeForm = (index + forms.length) % forms.length;
  const form = forms[activeForm];
  dialogImage.src = form.image;
  dialogImage.alt = `Original anime-style cel accompanying ${form.title}.`;
  dialogImage.style.objectPosition = form.position;
  dialogKicker.textContent = `MIST BREATHING, ${form.ordinal.toUpperCase()}`;
  dialogJp.textContent = form.jpLong;
  dialogTitle.textContent = form.title;
  dialogDescription.textContent = form.description;
  dialogCount.textContent = `form ${activeForm + 1} of 7`;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-form-index]');
  if (!button) return;
  updateFormDialog(Number(button.dataset.formIndex));
  if (formDialog && !formDialog.open) formDialog.showModal();
});
document.querySelector('#previous-form')?.addEventListener('click', () => updateFormDialog(activeForm - 1));
document.querySelector('#next-form')?.addEventListener('click', () => updateFormDialog(activeForm + 1));
document.querySelector('#close-form')?.addEventListener('click', () => formDialog?.close());

/* ---------------------------------------------------------------------------
   Obscuring Clouds: strike the frame.
   ------------------------------------------------------------------------ */
const strikeButton = document.querySelector('#strike-button');
const impactFlash = document.querySelector('.impact__flash');
const impactStatus = document.querySelector('#impact-status');

strikeButton?.addEventListener('click', () => {
  impactFlash?.classList.remove('is-on');
  void impactFlash?.offsetWidth;
  impactFlash?.classList.add('is-on');
  if (impactStatus) impactStatus.textContent = 'Obscuring Clouds: the tempo breaks and he is gone.';
});

/* ---------------------------------------------------------------------------
   Credits dialog.
   ------------------------------------------------------------------------ */
const creditsDialog = document.querySelector('#credits-dialog');
document.querySelector('#open-credits')?.addEventListener('click', () => {
  if (creditsDialog && !creditsDialog.open) creditsDialog.showModal();
});
document.querySelector('#close-credits')?.addEventListener('click', () => creditsDialog?.close());

/* ---------------------------------------------------------------------------
   Boot.
   ------------------------------------------------------------------------ */
runPreloader().then(startStory);
