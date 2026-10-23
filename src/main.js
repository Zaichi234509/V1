import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './jp-font.css';
import './styles.css';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

// Header, document progress, and the scroll-constructed shot.
const header = document.querySelector('#site-header');
const pageProgress = document.querySelector('#page-progress-bar');
const sequence = document.querySelector('#sequence');
const sequenceNumber = document.querySelector('#sequence-number');
const sequenceStep = document.querySelector('#sequence-step');
const sequenceCopy = document.querySelector('#sequence-copy');
let sequenceStage = -1;
let pageFrame = 0;

const sequenceStages = [
  { number: '02.01', title: 'WIDE', copy: 'Hold the frame. Let the mist settle.' },
  { number: '02.02', title: 'MASK', copy: 'Open a second shot inside the first.' },
  { number: '02.03', title: 'CLOSE', copy: 'Cut closer. Let the eyes carry the action.' },
  { number: '02.04', title: 'IMPACT', copy: 'One bright frame—and the scene changes.' },
];

function updateSequence() {
  if (!sequence) return;

  const rect = sequence.getBoundingClientRect();
  const range = Math.max(1, sequence.offsetHeight - window.innerHeight);
  const progress = clamp(-rect.top / range);
  const stripProgress = clamp(progress / 0.48);
  const portraitProgress = clamp((progress - 0.24) / 0.48);
  const flashProgress = clamp((progress - 0.55) / 0.09);
  const flash = !reduceMotion && progress > 0.55 && progress < 0.64
    ? Math.sin(flashProgress * Math.PI) * 0.72
    : 0;

  sequence.style.setProperty('--sequence-p', progress.toFixed(4));
  sequence.style.setProperty('--strip-scale', (0.74 + stripProgress * 0.34).toFixed(4));
  sequence.style.setProperty('--portrait-reveal', `${100 - portraitProgress * 100}%`);
  sequence.style.setProperty('--backdrop-scale', (1.15 - progress * 0.1).toFixed(4));
  sequence.style.setProperty('--flash-opacity', flash.toFixed(3));

  const nextStage = Math.min(3, Math.floor(progress * 4));
  if (nextStage !== sequenceStage) {
    sequenceStage = nextStage;
    const stage = sequenceStages[nextStage];
    sequenceNumber.textContent = stage.number;
    sequenceStep.textContent = stage.title;
    sequenceCopy.textContent = stage.copy;
  }
}

function updatePage() {
  pageFrame = 0;
  const scrollTop = window.scrollY;
  const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  header?.classList.toggle('is-scrolled', scrollTop > 32);
  if (pageProgress) pageProgress.style.transform = `scaleX(${clamp(scrollTop / scrollRange)})`;
  updateSequence();
}

function requestPageUpdate() {
  if (!pageFrame) pageFrame = requestAnimationFrame(updatePage);
}

window.addEventListener('scroll', requestPageUpdate, { passive: true });
window.addEventListener('resize', requestPageUpdate);
updatePage();

// Content enters with the same clean mask-like reveals used in the edit.
const revealItems = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !reduceMotion) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

// Reflect the current chapter in the navigation.
const navLinks = [...document.querySelectorAll('.main-nav a')];
const chapters = navLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window) {
  const chapterObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navLinks.forEach((link) => {
        const active = link.getAttribute('href') === `#${entry.target.id}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-35% 0px -55% 0px' });
  chapters.forEach((chapter) => chapterObserver.observe(chapter));
}

// Small drifting particles provide depth without external canvas libraries.
const particleField = document.querySelector('#hero-particles');
if (particleField && !reduceMotion) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 26; index += 1) {
    const particle = document.createElement('i');
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${45 + Math.random() * 60}%`;
    particle.style.setProperty('--duration', `${7 + Math.random() * 9}s`);
    particle.style.setProperty('--delay', `${-Math.random() * 12}s`);
    particle.style.opacity = `${0.2 + Math.random() * 0.5}`;
    fragment.append(particle);
  }
  particleField.append(fragment);
}

const forms = [
  {
    numeral: 'I',
    ordinal: 'FIRST',
    title: 'Low Clouds, Distant Haze',
    jp: '壱ノ型　垂天遠霞',
    description: 'A direct, powerful frontal thrust. The movement is economical: close the distance at speed and make one precise point of contact.',
    image: '/images/bright-action.webp',
    position: 'center',
  },
  {
    numeral: 'II',
    ordinal: 'SECOND',
    title: 'Eight-Layered Mist',
    jp: '弐ノ型　八重霞',
    description: 'Eight slashes arrive in rapid succession, layered one over another. The rhythm is the weapon—each cut leaves less room for an answer.',
    image: '/images/action-mist.webp',
    position: 'center 30%',
  },
  {
    numeral: 'III',
    ordinal: 'THIRD',
    title: 'Scattering Mist Splash',
    jp: '参ノ型　霞散の飛沫',
    description: 'A swift circular slash clears the space around the swordsman and can deflect incoming projectiles like mist breaking apart.',
    image: '/images/leaves.webp',
    position: 'center',
  },
  {
    numeral: 'IV',
    ordinal: 'FOURTH',
    title: 'Shifting Flow Slash',
    jp: '肆ノ型　移流斬り',
    description: 'From a low stance, the swordsman flows into a sudden dash and slash. Stillness and acceleration share a single breath.',
    image: '/images/hero.webp',
    position: 'center',
  },
  {
    numeral: 'V',
    ordinal: 'FIFTH',
    title: 'Sea of Clouds and Haze',
    jp: '伍ノ型　霞雲の海',
    description: 'A blistering zig-zag charge becomes a continuous barrage of slashes, covering a wide area like clouds closing over a landscape.',
    image: '/images/action-mist.webp',
    position: 'center 32%',
  },
  {
    numeral: 'VI',
    ordinal: 'SIXTH',
    title: 'Lunar Dispersing Mist',
    jp: '陸ノ型　月の霞消',
    description: 'An airborne sequence of slashes unfolds around a somersault, ending in a decisive vertical cut through the mist.',
    image: '/images/bright-action.webp',
    position: 'center',
  },
  {
    numeral: 'VII',
    ordinal: 'SEVENTH',
    title: 'Obscuring Clouds',
    jp: '漆ノ型　朧',
    description: 'Muichiro’s own creation. He fluctuates his tempo—appearing almost still, then accelerating so abruptly that he seems to vanish into a cloud of mist.',
    image: '/images/portrait.webp',
    position: 'center 26%',
  },
];

const formIndex = document.querySelector('#form-index');
const formDialog = document.querySelector('#form-dialog');
const formDialogImage = document.querySelector('#form-dialog-image');
const formDialogKicker = document.querySelector('#form-dialog-kicker');
const formDialogNumber = document.querySelector('#form-dialog-number');
const formDialogJp = document.querySelector('#form-dialog-jp');
const formDialogTitle = document.querySelector('#form-dialog-title');
const formDialogDescription = document.querySelector('#form-dialog-description');
const formDialogCount = document.querySelector('#form-dialog-count');
let activeForm = 0;

if (formIndex) {
  formIndex.innerHTML = forms.map((form, index) => `
    <li>
      <button type="button" data-form-index="${index}" aria-label="Open ${form.ordinal.toLowerCase()} form: ${form.title}">
        <span>${form.numeral}</span>
        <small>${form.title}</small>
      </button>
    </li>
  `).join('');
}

function updateFormDialog(index) {
  activeForm = (index + forms.length) % forms.length;
  const form = forms[activeForm];
  formDialogImage.src = form.image;
  formDialogImage.alt = `Muichiro artwork accompanying ${form.title}`;
  formDialogImage.style.objectPosition = form.position;
  formDialogKicker.textContent = `MIST BREATHING / ${form.ordinal} FORM`;
  formDialogNumber.textContent = form.numeral;
  formDialogJp.textContent = form.jp;
  formDialogTitle.textContent = form.title.toUpperCase();
  formDialogDescription.textContent = form.description;
  formDialogCount.textContent = `${String(activeForm + 1).padStart(2, '0')} / 07`;
}

function openForm(index) {
  updateFormDialog(index);
  if (!formDialog.open) formDialog.showModal();
}

document.addEventListener('click', (event) => {
  const formButton = event.target.closest('[data-form-index]');
  if (formButton) openForm(Number(formButton.dataset.formIndex));
});

document.querySelector('#previous-form')?.addEventListener('click', () => updateFormDialog(activeForm - 1));
document.querySelector('#next-form')?.addEventListener('click', () => updateFormDialog(activeForm + 1));
document.querySelector('#close-form')?.addEventListener('click', () => formDialog.close());

// Native dialogs close on Escape; these helpers also support backdrop clicks.
function enableBackdropClose(dialog) {
  dialog?.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}

enableBackdropClose(formDialog);

const creditsDialog = document.querySelector('#credits-dialog');
document.querySelector('#open-credits')?.addEventListener('click', () => creditsDialog.showModal());
document.querySelector('#close-credits')?.addEventListener('click', () => creditsDialog.close());
enableBackdropClose(creditsDialog);

// A manual impact frame lets visitors feel the flash / RGB / shake treatment.
const impactScene = document.querySelector('#impact');
const impactStatus = document.querySelector('#impact-status');
let impactTimer = 0;

document.querySelector('#strike-button')?.addEventListener('click', () => {
  window.clearTimeout(impactTimer);
  impactScene.classList.remove('is-striking');
  void impactScene.offsetWidth;
  impactScene.classList.add('is-striking');
  impactStatus.textContent = 'Impact frame triggered.';
  impactTimer = window.setTimeout(() => impactScene.classList.remove('is-striking'), 700);
});

// Full-screen, 16-second replay of the reference video's visual grammar.
const reelDialog = document.querySelector('#reel-dialog');
const reelStage = document.querySelector('#reel-stage');
const reelToggle = document.querySelector('#reel-toggle');
const reelRestart = document.querySelector('#reel-restart');
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

reelStage.tabIndex = -1;

function setReelPlayingState() {
  reelDialog.classList.toggle('is-paused', !reelPlaying);
  const icon = reelPlaying ? 'pause' : 'play';
  reelToggle.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#icon-${icon}" /></svg>`;
  reelToggle.setAttribute('aria-label', reelPlaying ? 'Pause visual edit' : 'Play visual edit');
}

function renderReel(time) {
  const sceneTime = Math.min(time, reelDuration - 1);
  for (const scene of reelScenes) {
    scene.element.classList.toggle('is-active', sceneTime >= scene.start && sceneTime < scene.end);
  }
  reelProgress.style.transform = `scaleX(${clamp(time / reelDuration)})`;
  const seconds = Math.min(16, Math.floor(time / 1000));
  reelTime.value = `00:${String(seconds).padStart(2, '0')} / 00:16`;
  reelTime.textContent = reelTime.value;
}

function tickReel(now) {
  if (!reelPlaying) return;
  reelElapsed = Math.min(reelDuration, now - reelStartedAt);
  renderReel(reelElapsed);

  if (reelElapsed >= reelDuration) {
    reelPlaying = false;
    setReelPlayingState();
    reelToggle.setAttribute('aria-label', 'Replay visual edit');
    return;
  }
  reelFrame = requestAnimationFrame(tickReel);
}

function playReel(reset = false) {
  cancelAnimationFrame(reelFrame);
  if (reset || reelElapsed >= reelDuration) {
    reelElapsed = 0;
    reelScenes.forEach((scene) => scene.element.classList.remove('is-active'));
    void reelStage.offsetWidth;
    renderReel(0);
  }
  reelPlaying = true;
  reelStartedAt = performance.now() - reelElapsed;
  setReelPlayingState();
  reelFrame = requestAnimationFrame(tickReel);
}

function pauseReel() {
  reelPlaying = false;
  cancelAnimationFrame(reelFrame);
  setReelPlayingState();
}

function openReel() {
  if (!reelDialog.open) reelDialog.showModal();
  reelStage.focus({ preventScroll: true });
  playReel(true);
}

function toggleReel() {
  if (reelPlaying) pauseReel();
  else playReel(reelElapsed >= reelDuration);
}

document.querySelectorAll('[data-open-reel]').forEach((button) => button.addEventListener('click', openReel));
document.querySelector('#close-reel')?.addEventListener('click', () => reelDialog.close());
reelToggle?.addEventListener('click', toggleReel);
reelRestart?.addEventListener('click', () => playReel(true));

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

// Load the WebGL scene only when it approaches the viewport.
const mist3dSection = document.querySelector('#mist-3d');
if (mist3dSection) {
  let mistSceneRequested = false;

  const loadMistScene = async () => {
    if (mistSceneRequested) return;
    mistSceneRequested = true;

    const status = document.querySelector('#mist-3d-loading');
    try {
      const { createMistScene } = await import('./mist-scene.js');
      createMistScene({
        canvas: document.querySelector('#mist-3d-canvas'),
        section: mist3dSection,
        stage: document.querySelector('#mist-3d-stage'),
        status,
        progress: document.querySelector('#mist-3d-progress'),
        motionButton: document.querySelector('#mist-motion'),
        resetButton: document.querySelector('#mist-reset'),
        reducedMotion: reduceMotion,
      });
    } catch (error) {
      console.error('The 3D mist scene could not be initialized.', error);
      document.querySelector('#mist-3d-canvas').hidden = true;
      document.querySelector('#mist-3d-fallback').hidden = false;
      document.querySelector('#mist-3d-stage').classList.add('is-unavailable');
      status.textContent = '3D view unavailable — showing the artwork instead.';
      document.querySelector('#mist-motion').disabled = true;
      document.querySelector('#mist-reset').disabled = true;
    }
  };

  if ('IntersectionObserver' in window) {
    const mistSceneLoader = new IntersectionObserver((entries, observer) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      loadMistScene();
    }, { rootMargin: '100% 0px' });
    mistSceneLoader.observe(mist3dSection);
  } else {
    loadMistScene();
  }
}
