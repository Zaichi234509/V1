import * as THREE from 'three';
import { addInkOutline, createCelRamp, createKatana, createRibbon } from './katana.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const INK = 0x07090c;
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
 * A form plate hanging in the fog: dark ink card, big kanji numeral, the two
 * line name in tight caps, a mono slug, and the picture cropped to a strip.
 */
function drawPlate(form, image, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * scale;
  canvas.height = CARD_H * scale;
  const context = canvas.getContext('2d');
  context.scale(scale, scale);

  context.fillStyle = '#0b1014';
  context.fillRect(0, 0, CARD_W, CARD_H);

  // Ink border, like a cel frame.
  context.strokeStyle = 'rgba(111, 224, 200, 0.55)';
  context.lineWidth = 3;
  context.strokeRect(14, 14, CARD_W - 28, CARD_H - 28);

  const pictureX = CARD_W * 0.64;
  coverDraw(context, image, pictureX, 0, CARD_W - pictureX, CARD_H);
  context.fillStyle = 'rgba(7, 9, 12, 0.18)';
  context.fillRect(pictureX, 0, CARD_W - pictureX, CARD_H);

  const pad = 64;
  context.textBaseline = 'alphabetic';

  context.fillStyle = '#f1f6f4';
  context.font = "400 150px 'Noto Serif JP', serif";
  context.fillText(form.kanji, pad, 196);

  const lines = form.lines ?? [form.title.toUpperCase()];
  const textWidth = pictureX - pad - 70;
  context.font = "700 54px 'Hanken Grotesk', sans-serif";
  const widest = Math.max(...lines.map((line) => context.measureText(line).width));
  if (widest > textWidth) {
    const size = Math.max(30, Math.floor((54 * textWidth) / widest));
    context.font = `700 ${size}px 'Hanken Grotesk', sans-serif`;
  }
  lines.forEach((line, index) => {
    context.fillText(line, pad, 356 + index * 58);
  });

  context.font = "500 24px 'JetBrains Mono', monospace";
  context.fillStyle = '#6fe0c8';
  context.fillText(form.ordinal.toUpperCase().replace(/ /g, ' '), pad, CARD_H - 128);

  context.font = "400 32px 'Noto Serif JP', serif";
  context.fillStyle = 'rgba(241, 246, 244, 0.72)';
  context.fillText(form.jp, pad, CARD_H - 72);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A soft radial puff used for the drifting mist planes. */
function mistTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(190, 240, 232, 0.85)');
  gradient.addColorStop(0.45, 'rgba(140, 210, 200, 0.35)');
  gradient.addColorStop(1, 'rgba(120, 190, 185, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function createAnimeScene({
  canvas,
  section,
  stage,
  motionButton,
  status,
  forms,
  onFrame,
  reducedMotion = false,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(INK, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(INK, 0.03);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 420);
  camera.position.set(0, 2.4, 16);

  const ramp = createCelRamp();

  scene.add(new THREE.HemisphereLight(0xbff0e8, 0x04141a, 1.5));
  const keyLight = new THREE.DirectionalLight(0xeafffb, 2.2);
  keyLight.position.set(3, 6, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x53d8c4, 2.4);
  rimLight.position.set(-6, -2, -5);
  scene.add(rimLight);
  const bladeLight = new THREE.PointLight(0x7fe7d2, 24, 26, 2);
  bladeLight.position.set(1.4, 0.6, 2.5);
  scene.add(bladeLight);

  const world = new THREE.Group();
  scene.add(world);

  // --- The painted valley backdrop ----------------------------------------
  await document.fonts?.ready?.catch(() => {});
  const phone = window.innerWidth < 760;
  const valleyImage = await loadImage('/images/anime-valley.jpg');
  if (valleyImage) {
    const texture = new THREE.Texture(valleyImage);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 169),
      new THREE.MeshBasicMaterial({ map: texture, fog: false, depthWrite: false }),
    );
    backdrop.position.set(0, 6, -180);
    backdrop.name = 'backdrop';
    scene.add(backdrop);
  }

  // --- Drifting mist planes -------------------------------------------------
  const puff = mistTexture();
  const mistGroup = new THREE.Group();
  scene.add(mistGroup);
  const mistPlanes = [];
  for (let index = 0; index < 7; index += 1) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(34 + index * 5, 16 + index * 3),
      new THREE.MeshBasicMaterial({
        map: puff,
        transparent: true,
        opacity: 0.05 + (index % 3) * 0.03,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    plane.position.set((index % 2 === 0 ? -1 : 1) * (5 + index), (index % 3) * 2 - 2, -6 - index * 9);
    mistGroup.add(plane);
    mistPlanes.push(plane);
  }

  // --- The form plates hanging in the fog ----------------------------------
  const scale = phone ? 0.7 : 1;
  const images = await Promise.all(forms.map((form) => loadImage(form.image)));
  const plateGeometry = new THREE.PlaneGeometry(5.1, 5.1 / CARD_ASPECT);
  const plates = forms.map((form, index) => {
    const texture = drawPlate(form, images[index], scale);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(plateGeometry, material);
    group.add(mesh);
    const side = index % 2 === 0 ? -1 : 1;
    const spread = phone ? 1.2 + (index % 3) * 0.2 : 2.6 + (index % 3) * 0.5;
    group.position.set(side * spread, ((index % 3) - 1) * 0.9, -14 - index * 5.4);
    group.rotation.set(((index % 2) - 0.5) * 0.07, side * (phone ? 0.24 : 0.4), ((index % 3) - 1) * 0.04);
    if (phone) mesh.scale.setScalar(0.84);
    world.add(group);
    return { group, material };
  });

  // --- The blade ------------------------------------------------------------
  const blade = new THREE.Group();
  const katana = createKatana(ramp);
  katana.scale.setScalar(1.05);
  blade.add(katana);
  for (let index = 0; index < 3; index += 1) blade.add(createRibbon(index));
  blade.position.set(0.4, 0.1, -58);
  blade.rotation.set(0.16, -0.34, 0.62);
  blade.scale.setScalar(phone ? 0.62 : 0.95);
  scene.add(blade);

  // 3D anchors the HUD telemetry pins itself to.
  const anchorTip = new THREE.Object3D();
  anchorTip.position.set(3.4, 0.24, 0);
  katana.add(anchorTip);
  const anchorGuard = new THREE.Object3D();
  anchorGuard.position.set(0, 0.4, 0);
  katana.add(anchorGuard);
  const anchorMist = new THREE.Object3D();
  anchorMist.position.set(-3.4, 1.2, -30);
  world.add(anchorMist);

  // --- Scroll-scrubbed timeline ---------------------------------------------
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
  let stageRect = stage.getBoundingClientRect();

  function resize() {
    stageRect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(stageRect.width));
    const height = Math.max(1, Math.round(stageRect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.85 ? 60 : 48;
    camera.updateProjectionMatrix();
    render();
  }

  /* One timeline, six shots:
     0.00 wide over the valley · 0.16 dive into the fog · 0.34 the plates
     0.68 close on the blade · 0.86 the turn · 1.00 broadside over the valley. */
  function placeCamera(p) {
    const calm = 1 - clamp((p - 0.86) / 0.14, 0, 1);
    const dive = clamp((p - 0.1) / 0.24, 0, 1);
    const run = clamp((p - 0.3) / 0.4, 0, 1);
    const turn = clamp((p - 0.82) / 0.18, 0, 1);

    const z = mix(16, -55, ease(clamp((p - 0.06) / 0.8, 0, 1)));
    const y = mix(2.6, -0.2, ease(dive)) + Math.sin(run * Math.PI * 1.6) * 0.5 * calm;
    const x = Math.sin(run * Math.PI * 2.1) * (phone ? 0.5 : 1.2) * calm + mix(0, -0.6, turn);

    camera.position.set(x + lookX * 3.4, y + lookY * 2.4, z);
    camera.lookAt(
      camera.position.x * 0.3 + lookX * 4.5,
      camera.position.y * 0.3 + lookY * 3,
      camera.position.z - 15,
    );
    camera.rotateZ(Math.sin(run * Math.PI * 1.2) * 0.05 * calm);
  }

  const ndc = new THREE.Vector3();
  function project(object) {
    object.getWorldPosition(ndc);
    ndc.project(camera);
    const inFront = ndc.z < 1;
    return {
      x: (ndc.x * 0.5 + 0.5) * stageRect.width,
      y: (-ndc.y * 0.5 + 0.5) * stageRect.height,
      visible: inFront && ndc.x > -1.15 && ndc.x < 1.15 && ndc.y > -1.15 && ndc.y < 1.15,
    };
  }

  function render() {
    frame = 0;
    if (!visible) return;

    progress += (targetProgress - progress) * 0.12;
    placeCamera(progress);

    // The fog breathes with the dive and clears for the finale.
    const diveFog = Math.sin(clamp(progress / 0.86, 0, 1) * Math.PI) * 0.02;
    scene.fog.density = mix(0.028, 0.012, ease(clamp((progress - 0.84) / 0.16, 0, 1))) + diveFog;
    bladeLight.intensity = mix(16, 60, ease(progress));

    const backdrop = scene.getObjectByName('backdrop');
    if (backdrop) {
      backdrop.position.x = camera.position.x * 0.3;
      backdrop.position.y = 6 + camera.position.y * 0.2;
      backdrop.material.opacity = mix(0.9, 1, progress);
    }

    mistPlanes.forEach((plane, index) => {
      plane.material.opacity =
        (0.05 + (index % 3) * 0.03) * (0.6 + Math.sin(progress * Math.PI) * 1.6);
      if (!paused) plane.position.x += Math.sin(time * 0.2 + index) * 0.004;
    });

    // The featured plate is the beat the headlines and HUD follow.
    const plateWindow = clamp((progress - 0.28) / 0.44, 0, 1) * (plates.length - 1);
    plates.forEach((plate, index) => {
      const distance = Math.abs(index - plateWindow);
      const gap = camera.position.z - plate.group.position.z;
      const near = clamp((gap - 3.4) / 5, 0, 1);
      plate.material.opacity = clamp(Math.min(near, 1.3 - distance * 0.5), 0, 1) * 0.96;
      plate.material.visible = plate.material.opacity > 0.01;
      if (!paused) plate.group.position.y += Math.sin(time * 0.5 + index) * 0.0006;
    });

    if (!paused) {
      time += 0.016;
      blade.rotation.y = -0.34 + Math.sin(time * 0.34) * 0.1;
      blade.rotation.z = 0.62 + Math.sin(time * 0.27) * 0.04;
      blade.position.y = 0.1 + Math.sin(time * 0.5) * 0.06;
    }
    const finale = clamp((progress - 0.82) / 0.18, 0, 1);
    blade.rotation.z = mix(blade.rotation.z, 0.2, finale);
    blade.rotation.y = mix(blade.rotation.y, 0.14, finale);
    blade.position.x = mix(0.4, phone ? 0 : -0.7, finale);

    lookX += (lookTargetX - lookX) * 0.12;
    lookY += (lookTargetY - lookY) * 0.12;

    renderer.render(scene, camera);

    if (onFrame) {
      onFrame({
        progress,
        beat: clamp(Math.round(plateWindow), 0, plates.length - 1),
        anchors: {
          tip: project(anchorTip),
          guard: project(anchorGuard),
          mist: project(anchorMist),
        },
        telemetry: {
          altitude: (camera.position.y * 137 + 2400).toFixed(0),
          heading: (((Math.atan2(camera.position.x, -14) * 180) / Math.PI + 360) % 360).toFixed(1),
          density: (scene.fog.density * 1000).toFixed(1),
          timecode: `00:${String(Math.floor(progress * 16)).padStart(2, '0')}`,
        },
      });
    }

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

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) {
        updateProgress();
        kick();
      }
    },
    { rootMargin: '20% 0px' },
  );
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
  if (status) {
    status.textContent =
      'The anime scene is ready. Scroll to fly the timeline, drag to look around, press R to reset.';
  }

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
