import * as THREE from 'three';
import { createKatana, createRibbon } from './katana.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const FIELD = '#08191f';
const FIELD_STEP = '#0d262e';
const FIELD_INK = '#e2efe8';
const FIELD_MUTED = '#9db9b6';

const CARD_W = 1024;
const CARD_H = 620;
const CARD_ASPECT = CARD_W / CARD_H;

function loadImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function coverDraw(context, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

/**
 * A card in the fly-through: a flat printed plate carrying one form of Mist
 * Breathing — its numeral, its two names, and one real picture.
 */
function drawCard(form, image, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * scale;
  canvas.height = CARD_H * scale;
  const context = canvas.getContext('2d');
  context.scale(scale, scale);

  context.fillStyle = FIELD_STEP;
  context.fillRect(0, 0, CARD_W, CARD_H);

  // The picture holds the right third of the plate, cropped hard to the edges.
  const pictureX = CARD_W * 0.66;
  coverDraw(context, image, pictureX, 0, CARD_W - pictureX, CARD_H);

  const pad = 60;
  const textWidth = pictureX - pad - 60;
  context.textBaseline = 'alphabetic';
  context.letterSpacing = '0px';

  // The numeral, set large, is the plate's one ornament.
  context.fillStyle = FIELD_INK;
  context.font = "400 150px 'Noto Serif JP', serif";
  context.fillText(form.kanji, pad, 182);

  // The form's two-line name, sized to fit the plate beside the picture.
  const lines = form.lines ?? [form.title.toUpperCase()];
  context.font = "500 52px 'Hanken Grotesk', sans-serif";
  context.letterSpacing = '-1.4px';
  const widest = Math.max(...lines.map((line) => context.measureText(line).width));
  if (widest > textWidth) {
    const size = Math.max(30, Math.floor((52 * textWidth) / widest));
    context.font = `500 ${size}px 'Hanken Grotesk', sans-serif`;
  }
  lines.forEach((line, index) => {
    context.fillText(line, pad, 352 + index * 56);
  });
  context.letterSpacing = '0px';

  context.font = "400 30px 'Noto Serif JP', serif";
  context.fillStyle = FIELD_MUTED;
  context.fillText(form.jp, pad, CARD_H - 74);

  context.fillStyle = FIELD_INK;
  context.font = "500 23px 'Hanken Grotesk', sans-serif";
  context.fillText(form.ordinal.toUpperCase(), pad, CARD_H - 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export async function createBladeScene({
  canvas,
  section,
  stage,
  motionButton,
  status,
  forms,
  reducedMotion = false,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08191f, 0.042);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 160);
  camera.position.set(0, 0, 8);

  scene.add(new THREE.HemisphereLight(0xd8ffff, 0x0a2229, 2.1));
  scene.add(new THREE.AmbientLight(0x9fd8d4, 0.9));
  const keyLight = new THREE.DirectionalLight(0xeaffff, 3.4);
  keyLight.position.set(3, 5, 6);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x4fc9c4, 2.2);
  rimLight.position.set(-5, -2, -4);
  scene.add(rimLight);
  const bladeLight = new THREE.PointLight(0x77e6dc, 26, 22, 2);
  bladeLight.position.set(1.6, 0.6, 3);
  scene.add(bladeLight);

  // A soft light that travels with the camera, so the blade always catches it.
  const followLight = new THREE.DirectionalLight(0xe8ffff, 1.6);
  scene.add(followLight, followLight.target);

  // --- The cards ------------------------------------------------------------
  const world = new THREE.Group();
  scene.add(world);

  await document.fonts?.ready?.catch(() => {});
  const phone = window.innerWidth < 760;
  const scale = phone ? 0.75 : 1;
  const images = await Promise.all(forms.map((form) => loadImage(form.image)));

  const cardGroup = new THREE.Group();
  world.add(cardGroup);

  const cardGeometry = new THREE.PlaneGeometry(4.7, 4.7 / CARD_ASPECT);

  const cards = forms.map((form, index) => {
    const texture = drawCard(form, images[index], scale);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      fog: true,
      side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(cardGeometry, material);
    group.add(mesh);

    const side = index % 2 === 0 ? -1 : 1;
    const spread = phone ? 1.1 + (index % 3) * 0.2 : 2.35 + (index % 3) * 0.55;
    const lift = phone ? 0.6 : 0.85;
    group.position.set(side * spread, ((index % 3) - 1) * lift, -4 - index * 5.5);
    group.rotation.set(((index % 2) - 0.5) * 0.08, side * (phone ? 0.22 : 0.42), ((index % 3) - 1) * 0.04);
    if (phone) mesh.scale.setScalar(0.82);
    cardGroup.add(group);
    return { group, material };
  });

  // --- The blade at the end of the flight ----------------------------------
  const blade = new THREE.Group();
  const katana = createKatana();
  katana.scale.setScalar(1.05);
  blade.add(katana);
  for (let index = 0; index < 3; index += 1) blade.add(createRibbon(index));
  blade.position.set(0.2, 0.1, -51.5);
  blade.rotation.set(0.16, -0.34, 0.62);
  blade.scale.setScalar(phone ? 0.62 : 0.95);
  scene.add(blade);

  // --- Scroll, drag, render -------------------------------------------------
  let progress = 0;
  let targetProgress = 0;
  let visible = false;
  let paused = reducedMotion;
  let frame = 0;
  let dragging = false;
  let pointerStart = null;
  let lookX = 0;
  let lookY = 0;
  let lookTargetX = 0;
  let lookTargetY = 0;
  let time = 0;

  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.fov = camera.aspect < 0.85 ? 58 : 46;
    camera.updateProjectionMatrix();
    render();
  }

  function placeCamera(p) {
    const eased = ease(p);
    const calm = 1 - clamp((p - 0.8) / 0.2, 0, 1);
    const sway = Math.sin(eased * Math.PI * 2.1) * (phone ? 0.4 : 1.15);
    camera.position.x = mix(0, 0.6, eased) + sway * calm;
    camera.position.y = mix(0, -0.15, eased) + Math.sin(eased * Math.PI * 1.4) * 0.42 * calm;
    camera.position.z = mix(phone ? 6 : 8, phone ? -46.6 : -45.6, eased);

    camera.lookAt(
      camera.position.x * 0.35 + lookX * 4,
      camera.position.y * 0.35 + lookY * 3,
      camera.position.z - 14,
    );
    camera.rotateZ(Math.sin(eased * Math.PI * 1.2) * 0.05);
  }

  function render() {
    frame = 0;
    if (!visible) return;

    progress += (targetProgress - progress) * 0.14;
    placeCamera(progress);

    followLight.position.copy(camera.position);
    followLight.target.position.copy(blade.position);

    // The mist thins as the blade arrives.
    scene.fog.density = mix(0.045, 0.017, ease(progress));
    bladeLight.intensity = mix(18, 62, ease(progress));

    cards.forEach((card, index) => {
      // A card fades out as the camera reaches it and passes it by.
      const gap = camera.position.z - card.group.position.z;
      const distance = Math.abs(index - progress * (cards.length - 1));
      const near = clamp((gap - 3.2) / 4.5, 0, 1);
      card.material.opacity = clamp(Math.min(near, 1.35 - distance * 0.45), 0, 1);
      card.material.visible = card.material.opacity > 0.01;
      card.group.position.y += Math.sin(time * 0.6 + index) * 0.0006;
    });

    if (!paused) {
      time += 0.016;
      blade.rotation.y = -0.34 + Math.sin(time * 0.34) * 0.1;
      blade.rotation.z = 0.62 + Math.sin(time * 0.27) * 0.04;
      blade.position.y = 0.1 + Math.sin(time * 0.5) * 0.06;
    }
    // The last screen turns the blade broadside so the whole shape reads.
    const finale = clamp((progress - 0.8) / 0.2, 0, 1);
    blade.rotation.z = mix(blade.rotation.z, 0.22, finale);
    blade.rotation.y = mix(blade.rotation.y, 0.16, finale);
    blade.position.x = mix(0.2, phone ? 0 : -0.75, finale);

    // Look offsets settle toward the drag target.
    lookX += (lookTargetX - lookX) * 0.12;
    lookY += (lookTargetY - lookY) * 0.12;

    renderer.render(scene, camera);
    if (!paused || Math.abs(targetProgress - progress) > 0.0005) frame = requestAnimationFrame(render);
  }

  function kick() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render);
  }

  function updateProgress() {
    const rect = section.getBoundingClientRect();
    const range = Math.max(1, section.offsetHeight - window.innerHeight);
    targetProgress = clamp(-rect.top / range, 0, 1);
    kick();
  }

  function updateMotionButton() {
    if (!motionButton) return;
    motionButton.textContent = paused ? 'Resume motion' : 'Pause motion';
    motionButton.setAttribute('aria-pressed', String(paused));
  }

  function resetView() {
    lookTargetX = 0;
    lookTargetY = 0;
    updateProgress();
  }

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    pointerStart = { x: event.clientX, y: event.clientY, lookX: lookTargetX, lookY: lookTargetY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !pointerStart) return;
    lookTargetX = clamp(pointerStart.lookX - (event.clientX - pointerStart.x) * 0.0016, -0.4, 0.4);
    lookTargetY = clamp(pointerStart.lookY + (event.clientY - pointerStart.y) * 0.0014, -0.35, 0.35);
    kick();
  });

  function endDrag(event) {
    dragging = false;
    pointerStart = null;
    canvas.classList.remove('is-dragging');
    if (event?.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('keydown', (event) => {
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'r', 'R'];
    if (!handled.includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') lookTargetX = clamp(lookTargetX - 0.08, -0.4, 0.4);
    if (event.key === 'ArrowRight') lookTargetX = clamp(lookTargetX + 0.08, -0.4, 0.4);
    if (event.key === 'ArrowUp') lookTargetY = clamp(lookTargetY + 0.07, -0.35, 0.35);
    if (event.key === 'ArrowDown') lookTargetY = clamp(lookTargetY - 0.07, -0.35, 0.35);
    if (event.key === 'Home' || event.key.toLowerCase() === 'r') resetView();
    kick();
  });

  motionButton?.addEventListener('click', () => {
    paused = !paused;
    updateMotionButton();
    kick();
  });

  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    if (visible) {
      updateProgress();
      kick();
    }
  }, { rootMargin: '20% 0px' });
  visibilityObserver.observe(section);

  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);

  updateMotionButton();
  updateProgress();
  progress = targetProgress;
  resize();
  renderer.render(scene, camera);
  if (status) status.textContent = 'The three-dimensional blade is ready. Scroll to fly through the seven forms.';

  return {
    resetView,
    setPaused(value) {
      paused = value;
      updateMotionButton();
      kick();
    },
    renderer,
    scene,
    camera,
  };
}
