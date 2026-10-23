import * as THREE from 'three';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function createKatana() {
  const sword = new THREE.Group();

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, -0.095);
  bladeShape.lineTo(4.25, -0.055);
  bladeShape.quadraticCurveTo(4.68, -0.01, 5, 0.22);
  bladeShape.lineTo(4.38, 0.145);
  bladeShape.quadraticCurveTo(2.2, 0.105, 0, 0.11);
  bladeShape.closePath();

  const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 18,
  });
  bladeGeometry.translate(0, 0, -0.0275);

  const bladeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc9f3f1,
    emissive: 0x123f45,
    emissiveIntensity: 0.42,
    metalness: 0.88,
    roughness: 0.19,
    clearcoat: 0.75,
    clearcoatRoughness: 0.16,
    side: THREE.DoubleSide,
  });
  const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
  sword.add(blade);

  const bladeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(bladeGeometry, 24),
    new THREE.LineBasicMaterial({ color: 0xc7ffff, transparent: true, opacity: 0.52 }),
  );
  sword.add(bladeEdges);

  const groove = new THREE.Mesh(
    new THREE.BoxGeometry(3.72, 0.018, 0.009),
    new THREE.MeshBasicMaterial({ color: 0x355c62, transparent: true, opacity: 0.76 }),
  );
  groove.position.set(2.03, 0.032, 0.047);
  sword.add(groove);

  const edgeLight = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.14, 0.085, 0.052),
      new THREE.Vector3(4.24, 0.115, 0.052),
      new THREE.Vector3(4.82, 0.19, 0.052),
    ]),
    new THREE.LineBasicMaterial({ color: 0xe7ffff, transparent: true, opacity: 0.9 }),
  );
  sword.add(edgeLight);

  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x10292d,
    metalness: 0.82,
    roughness: 0.32,
  });
  const paleMetal = new THREE.MeshStandardMaterial({
    color: 0x78b8b5,
    metalness: 0.85,
    roughness: 0.25,
  });
  const gripMaterial = new THREE.MeshStandardMaterial({
    color: 0x071114,
    metalness: 0.12,
    roughness: 0.76,
  });
  const wrapMaterial = new THREE.MeshStandardMaterial({
    color: 0x9bd9d2,
    metalness: 0.18,
    roughness: 0.58,
  });

  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.085, 40), darkMetal);
  guard.rotation.z = Math.PI / 2;
  sword.add(guard);

  const guardRing = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.025, 8, 40), paleMetal);
  guardRing.rotation.y = Math.PI / 2;
  guardRing.position.x = 0.052;
  sword.add(guardRing);

  const guardCore = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.105, 24), paleMetal);
  guardCore.rotation.z = Math.PI / 2;
  sword.add(guardCore);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 1.48, 16), gripMaterial);
  grip.rotation.z = Math.PI / 2;
  grip.position.x = -0.79;
  sword.add(grip);

  for (const x of [-0.09, -1.5]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.1, 20), paleMetal);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = x;
    sword.add(collar);
  }

  for (let index = 0; index < 10; index += 1) {
    const x = -0.2 - index * 0.135;
    for (const side of [-1, 1]) {
      const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.255, 0.025), wrapMaterial);
      wrap.position.set(x, 0, side * 0.105);
      wrap.rotation.z = (index % 2 === 0 ? 1 : -1) * 0.62;
      sword.add(wrap);
    }
  }

  const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.135, 0.12, 16), darkMetal);
  pommel.rotation.z = Math.PI / 2;
  pommel.position.x = -1.59;
  sword.add(pommel);

  // Center the complete silhouette around its own origin.
  sword.position.x = -1.68;
  return sword;
}

function createRibbon(index) {
  const points = [];
  for (let step = 0; step < 11; step += 1) {
    const x = -4.7 + step * 0.94;
    const phase = step * 0.72 + index * 1.9;
    points.push(new THREE.Vector3(
      x,
      Math.sin(phase) * (0.55 + index * 0.14) + (index - 1) * 0.3,
      Math.cos(phase) * (0.5 + index * 0.17) - 0.45,
    ));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const ribbon = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 120, 0.009 + index * 0.003, 5, false),
    new THREE.MeshBasicMaterial({
      color: index === 1 ? 0xd7ffff : 0x70d9d4,
      transparent: true,
      opacity: 0.15 - index * 0.018,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  return ribbon;
}

function createParticles(count) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const stride = index * 3;
    positions[stride] = (Math.random() - 0.5) * 11;
    positions[stride + 1] = (Math.random() - 0.5) * 6.5;
    positions[stride + 2] = (Math.random() - 0.5) * 5 - 0.5;
    color.set(index % 5 === 0 ? 0xe4ffff : 0x72cfc9);
    colors[stride] = color.r;
    colors[stride + 1] = color.g;
    colors[stride + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.026,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  );
}

export function createMistScene({
  canvas,
  section,
  stage,
  status,
  progress,
  motionButton,
  resetButton,
  reducedMotion = false,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
  camera.position.set(0, 0.15, 10.5);

  scene.add(new THREE.HemisphereLight(0xd9ffff, 0x061012, 1.8));
  const keyLight = new THREE.DirectionalLight(0xe7ffff, 3.2);
  keyLight.position.set(2.5, 4, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x56c9c7, 2.4);
  rimLight.position.set(-4, -1, -3);
  scene.add(rimLight);
  const mistLight = new THREE.PointLight(0x74f2e6, 18, 15, 2);
  mistLight.position.set(1.8, 0.5, 2.5);
  scene.add(mistLight);

  const world = new THREE.Group();
  scene.add(world);
  world.add(createKatana());

  const ribbons = new THREE.Group();
  for (let index = 0; index < 3; index += 1) ribbons.add(createRibbon(index));
  world.add(ribbons);

  const particles = createParticles(window.innerWidth < 760 ? 360 : 640);
  scene.add(particles);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x8de7df,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.008, 4, 180), haloMaterial);
  halo.position.z = -1.7;
  halo.rotation.set(0.22, 0.15, -0.25);
  scene.add(halo);
  const haloInner = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.006, 4, 150), haloMaterial.clone());
  haloInner.material.opacity = 0.07;
  haloInner.position.z = -1.9;
  haloInner.rotation.set(-0.35, 0.4, 0.4);
  scene.add(haloInner);

  let frame = 0;
  let visible = false;
  let paused = reducedMotion;
  let dragging = false;
  let scrollProgress = 0;
  let baseCameraZ = 10.5;
  let dragTargetX = 0;
  let dragTargetY = 0;
  let dragX = 0;
  let dragY = 0;
  let hoverTargetX = 0;
  let hoverTargetY = 0;
  let hoverX = 0;
  let hoverY = 0;
  let pointerStart = null;

  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    baseCameraZ = camera.aspect < 0.8 ? 16.8 : camera.aspect < 1.15 ? 15.2 : 10.5;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function updateScroll() {
    const rect = section.getBoundingClientRect();
    const range = Math.max(1, section.offsetHeight - window.innerHeight);
    scrollProgress = clamp(-rect.top / range, 0, 1);
    if (progress) progress.style.transform = `scaleX(${scrollProgress})`;
  }

  function updateMotionButton() {
    if (!motionButton) return;
    motionButton.textContent = paused ? 'Resume motion' : 'Pause motion';
    motionButton.setAttribute('aria-pressed', String(paused));
  }

  function resetView() {
    dragTargetX = 0;
    dragTargetY = 0;
    hoverTargetX = 0;
    hoverTargetY = 0;
  }

  function animate(now) {
    frame = 0;
    if (!visible || document.hidden) return;

    const time = now * 0.001;
    const motion = paused ? 0 : 1;
    dragX += (dragTargetX - dragX) * 0.075;
    dragY += (dragTargetY - dragY) * 0.075;
    hoverX += (hoverTargetX - hoverX) * 0.045;
    hoverY += (hoverTargetY - hoverY) * 0.045;

    world.rotation.x = 0.14 + scrollProgress * 0.28 + dragY + hoverY
      + Math.sin(time * 0.55) * 0.035 * motion;
    world.rotation.y = -0.34 + scrollProgress * 0.86 + dragX + hoverX
      + Math.sin(time * 0.38) * 0.15 * motion;
    world.rotation.z = -0.34 + scrollProgress * 0.46;
    world.position.y = (scrollProgress - 0.5) * 0.28 + Math.sin(time * 0.72) * 0.11 * motion;

    camera.position.z += (baseCameraZ - scrollProgress * 1.05 - camera.position.z) * 0.065;
    camera.position.x += (((scrollProgress - 0.5) * 0.5) - camera.position.x) * 0.05;
    camera.lookAt(0, 0, 0);

    particles.rotation.y = time * 0.018 * motion + scrollProgress * 0.12;
    particles.rotation.z = -0.08 + Math.sin(time * 0.12) * 0.035 * motion;
    ribbons.children.forEach((ribbon, index) => {
      ribbon.position.y = Math.sin(time * (0.28 + index * 0.05) + index) * 0.13 * motion;
      ribbon.rotation.x = Math.sin(time * 0.18 + index) * 0.08 * motion;
    });
    halo.rotation.z = -0.25 + time * 0.025 * motion + scrollProgress * 0.2;
    haloInner.rotation.z = 0.4 - time * 0.032 * motion - scrollProgress * 0.16;

    renderer.render(scene, camera);
    frame = requestAnimationFrame(animate);
  }

  function start() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(animate);
  }

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    pointerStart = { x: event.clientX, y: event.clientY, rotationX: dragTargetX, rotationY: dragTargetY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    const bounds = canvas.getBoundingClientRect();
    if (dragging && pointerStart) {
      dragTargetX = pointerStart.rotationX + (event.clientX - pointerStart.x) * 0.007;
      dragTargetY = clamp(pointerStart.rotationY + (event.clientY - pointerStart.y) * 0.005, -0.85, 0.85);
    } else {
      hoverTargetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.16;
      hoverTargetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.1;
    }
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
  canvas.addEventListener('pointerleave', (event) => {
    if (!dragging) {
      hoverTargetX = 0;
      hoverTargetY = 0;
    }
    if (event.pointerType === 'touch') endDrag(event);
  });

  canvas.addEventListener('keydown', (event) => {
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'r', 'R'];
    if (!handled.includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') dragTargetX -= 0.14;
    if (event.key === 'ArrowRight') dragTargetX += 0.14;
    if (event.key === 'ArrowUp') dragTargetY = clamp(dragTargetY - 0.1, -0.85, 0.85);
    if (event.key === 'ArrowDown') dragTargetY = clamp(dragTargetY + 0.1, -0.85, 0.85);
    if (event.key === 'Home' || event.key.toLowerCase() === 'r') resetView();
  });

  motionButton?.addEventListener('click', () => {
    paused = !paused;
    updateMotionButton();
  });
  resetButton?.addEventListener('click', resetView);
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', start);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  const visibilityObserver = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? false;
    if (visible) start();
  }, { rootMargin: '15% 0px' });
  visibilityObserver.observe(section);

  updateMotionButton();
  updateScroll();
  resize();
  renderer.render(scene, camera);
  status.hidden = true;
  stage.classList.add('is-ready');

  return { resetView, renderer, scene, camera };
}
