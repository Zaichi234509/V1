import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-700.css';
import '@fontsource/hanken-grotesk/latin-600.css';
import './jp-font.css';
import './styles.css';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------------------
   The seven forms — one source of truth for the index, the dialog, the
   fly-through cards and the still fallback.
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
    image: '/images/bright-action.webp',
    position: '50% 40%',
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
    image: '/images/action-mist.webp',
    position: '50% 30%',
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
    image: '/images/leaves.webp',
    position: '50% 50%',
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
    image: '/images/hero.webp',
    position: '52% 45%',
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
    image: '/images/action-mist.webp',
    position: '50% 40%',
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
    image: '/images/bright-action.webp',
    position: '50% 30%',
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
    image: '/images/portrait.webp',
    position: '50% 26%',
  },
];

/* ---------------------------------------------------------------------------
   Frame: progress, header tone, reveals, navigation
   ------------------------------------------------------------------------ */
const header = document.querySelector('#site-header');
const pageProgress = document.querySelector('#page-progress-bar');
const darkSections = ['#blade', '#impact', '#colophon']
  .map((selector) => document.querySelector(selector))
  .filter(Boolean);
const navLinks = [...document.querySelectorAll('.main-nav a')];

let pageFrame = 0;

function updateHeaderTone() {
  const line = header ? header.getBoundingClientRect().bottom - 8 : 64;
  const onDark = darkSections.some((section) => {
    const rect = section.getBoundingClientRect();
    return rect.top <= line && rect.bottom >= line;
  });
  header?.setAttribute('data-on-dark', String(onDark));
}

function updatePage() {
  pageFrame = 0;
  const scrollTop = window.scrollY;
  const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  if (pageProgress) pageProgress.style.transform = `scaleX(${clamp(scrollTop / range).toFixed(4)})`;
  header?.classList.toggle('is-scrolled', scrollTop > 24);
  updateHeaderTone();
  updateHero();
  updateBeats();
}

function requestPageUpdate() {
  if (!pageFrame) pageFrame = requestAnimationFrame(updatePage);
}

/* ---------------------------------------------------------------------------
   1. The pinned hero: the name holds still, his portraits and the ground
   colour change beneath it.
   ------------------------------------------------------------------------ */
const heroRun = document.querySelector('#hero-run');
const heroField = document.querySelector('#hero-field');
const heroTitle = document.querySelector('#hero-title');
const heroPortraits = [...document.querySelectorAll('.hero-portrait')];
let heroIndex = -1;

function updateHero() {
  if (!heroRun || heroPortraits.length === 0) return;
  const rect = heroRun.getBoundingClientRect();
  const index = clamp(Math.round(-rect.top / window.innerHeight), 0, heroPortraits.length - 1);
  if (index === heroIndex) return;
  heroIndex = index;
  const portrait = heroPortraits[index];
  if (heroField) heroField.style.backgroundColor = portrait.dataset.field || '';
  heroPortraits.forEach((item, itemIndex) => item.classList.toggle('is-current', itemIndex === index));
}

if (heroTitle) {
  requestAnimationFrame(() => requestAnimationFrame(() => heroTitle.classList.add('is-in')));
}

/* ---------------------------------------------------------------------------
   2. The seven forms: the photograph holds, the index moves.
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
  }, 180);
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
  dialogImage.alt = `Muichiro artwork accompanying ${form.title}.`;
  dialogImage.style.objectPosition = form.position;
  dialogKicker.textContent = `Mist Breathing, ${form.ordinal.toLowerCase()}`;
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
   3. The blade: a scroll-driven fly-through, with a designed still version
   for reduced motion, no WebGL or a failed script.
   ------------------------------------------------------------------------ */
const bladeSection = document.querySelector('#blade');
const bladeStage = document.querySelector('.blade-stage');
const bladeCanvas = document.querySelector('#blade-canvas');
const bladeRest = document.querySelector('#blade-rest');
const bladeRestGrid = document.querySelector('#blade-rest-grid');
const bladeBeats = [...document.querySelectorAll('.blade-beat')];
const bladeStatus = document.querySelector('#blade-status');
let bladeScene = null;
let bladeRequested = false;

if (bladeRestGrid) {
  bladeRestGrid.innerHTML = forms
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

function showBladeRest(message) {
  bladeSection?.classList.add('is-rest');
  bladeRest?.removeAttribute('hidden');
  bladeCanvas?.setAttribute('hidden', '');
  document.querySelector('.blade-beats')?.setAttribute('hidden', '');
  document.querySelector('.blade-hud p')?.setAttribute('hidden', '');
  const motionButton = document.querySelector('#blade-motion');
  if (motionButton) motionButton.hidden = true;
  if (bladeStatus && message) bladeStatus.textContent = message;
}

function updateBeats() {
  if (!bladeSection || bladeSection.classList.contains('is-rest') || bladeBeats.length === 0) return;
  const rect = bladeSection.getBoundingClientRect();
  const range = Math.max(1, bladeSection.offsetHeight - window.innerHeight);
  const progress = clamp(-rect.top / range, 0, 1);
  const index = progress < 0.24 ? 0 : progress < 0.62 ? 1 : 2;
  bladeBeats.forEach((beat, beatIndex) => beat.classList.toggle('is-current', beatIndex === index));
}

async function loadBladeScene() {
  if (bladeRequested || !bladeCanvas) return;
  bladeRequested = true;
  try {
    const { createBladeScene } = await import('./fly-scene.js');
    bladeScene = await createBladeScene({
      canvas: bladeCanvas,
      section: bladeSection,
      stage: bladeStage,
      motionButton: document.querySelector('#blade-motion'),
      status: bladeStatus,
      forms,
      reducedMotion: reduceMotion,
    });
    bladeStage?.classList.add('is-live');
  } catch (error) {
    console.error('The three-dimensional blade could not start.', error);
    showBladeRest('The three-dimensional view is unavailable; the seven forms are shown held still.');
  }
}

if (bladeSection) {
  if (reduceMotion) {
    showBladeRest('The seven forms are shown held still.');
  } else if ('IntersectionObserver' in window) {
    const loader = new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      loadBladeScene();
    }, { rootMargin: '120% 0px' });
    loader.observe(bladeSection);
  } else {
    loadBladeScene();
  }
}

/* ---------------------------------------------------------------------------
   4. Obscuring Clouds: the impact frame, struck by hand
   ------------------------------------------------------------------------ */
const impact = document.querySelector('#impact');
const impactStatus = document.querySelector('#impact-status');
let impactTimer = 0;

document.querySelector('#strike-button')?.addEventListener('click', () => {
  window.clearTimeout(impactTimer);
  impact.classList.remove('is-striking');
  void impact.offsetWidth;
  impact.classList.add('is-striking');
  if (impactStatus) impactStatus.textContent = 'Impact frame struck.';
  impactTimer = window.setTimeout(() => impact.classList.remove('is-striking'), 700);
});

/* ---------------------------------------------------------------------------
   The 16-second edit, replayed in a dialog
   ------------------------------------------------------------------------ */
const reelDialog = document.querySelector('#reel-dialog');
const reelStage = document.querySelector('#reel-stage');
const reelToggle = document.querySelector('#reel-toggle');
const reelProgress = document.querySelector('#reel-progress-bar');
const reelTime = document.querySelector('#reel-time');
const reelScenes = [...document.querySelectorAll('.reel-scene')].map((element) => ({
  element,
  start: Number(element.dataset.start),
  end: Number(element.dataset.end),
}));
const reelDuration = 16000;
let reelElapsed = 0;
let reelStartedAt = 0;
let reelFrame = 0;
let reelPlaying = false;

if (reelStage) reelStage.tabIndex = -1;

function setReelState() {
  reelDialog?.classList.toggle('is-paused', !reelPlaying);
  if (!reelToggle) return;
  const icon = reelPlaying ? 'pause' : 'play';
  reelToggle.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${icon}" /></svg>`;
  reelToggle.setAttribute('aria-label', reelPlaying ? 'Pause the visual edit' : 'Play the visual edit');
}

function renderReel(time) {
  const sceneTime = Math.min(time, reelDuration - 1);
  for (const scene of reelScenes) {
    scene.element.classList.toggle('is-active', sceneTime >= scene.start && sceneTime < scene.end);
  }
  if (reelProgress) reelProgress.style.transform = `scaleX(${clamp(time / reelDuration).toFixed(4)})`;
  const seconds = Math.min(16, Math.floor(time / 1000));
  if (reelTime) {
    reelTime.value = `00:${String(seconds).padStart(2, '0')} / 00:16`;
    reelTime.textContent = reelTime.value;
  }
}

function tickReel(now) {
  if (!reelPlaying) return;
  reelElapsed = Math.min(reelDuration, now - reelStartedAt);
  renderReel(reelElapsed);
  if (reelElapsed >= reelDuration) {
    reelPlaying = false;
    setReelState();
    return;
  }
  reelFrame = requestAnimationFrame(tickReel);
}

function playReel(reset = false) {
  cancelAnimationFrame(reelFrame);
  if (reset || reelElapsed >= reelDuration) {
    reelElapsed = 0;
    reelScenes.forEach((scene) => scene.element.classList.remove('is-active'));
    if (reelStage) void reelStage.offsetWidth;
    renderReel(0);
  }
  reelPlaying = true;
  reelStartedAt = performance.now() - reelElapsed;
  setReelState();
  reelFrame = requestAnimationFrame(tickReel);
}

function pauseReel() {
  reelPlaying = false;
  cancelAnimationFrame(reelFrame);
  setReelState();
}

function toggleReel() {
  if (reelPlaying) pauseReel();
  else playReel(reelElapsed >= reelDuration);
}

document.querySelectorAll('[data-open-reel]').forEach((button) =>
  button.addEventListener('click', () => {
    if (!reelDialog?.open) reelDialog?.showModal();
    reelStage?.focus({ preventScroll: true });
    playReel(true);
  }),
);

document.querySelector('#close-reel')?.addEventListener('click', () => reelDialog?.close());
reelToggle?.addEventListener('click', toggleReel);
document.querySelector('#reel-restart')?.addEventListener('click', () => playReel(true));

reelDialog?.addEventListener('close', () => {
  pauseReel();
  reelElapsed = 0;
  renderReel(0);
});

reelDialog?.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && event.target === reelStage) {
    event.preventDefault();
    toggleReel();
  }
});

/* ---------------------------------------------------------------------------
   Dialogs, reveals, navigation, and the page loop
   ------------------------------------------------------------------------ */
function enableBackdropClose(dialog) {
  dialog?.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}

const creditsDialog = document.querySelector('#credits-dialog');
document.querySelector('#open-credits')?.addEventListener('click', () => creditsDialog?.showModal());
document.querySelector('#close-credits')?.addEventListener('click', () => creditsDialog?.close());
enableBackdropClose(formDialog);
enableBackdropClose(creditsDialog);

const revealItems = document.querySelectorAll('[data-reveal]');
revealItems.forEach((element) => element.classList.add('reveal'));
if ('IntersectionObserver' in window && !reduceMotion) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.04, rootMargin: '0px 0px 12% 0px' },
  );
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const chapters = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window) {
  const chapterObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        navLinks.forEach((link) => {
          const active = link.getAttribute('href') === `#${entry.target.id}`;
          link.classList.toggle('is-active', active);
          if (active) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  chapters.forEach((chapter) => chapterObserver.observe(chapter));
}

window.addEventListener('scroll', requestPageUpdate, { passive: true });
window.addEventListener('resize', requestPageUpdate);
document.addEventListener('visibilitychange', requestPageUpdate);
updatePage();
