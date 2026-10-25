import * as THREE from 'three';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/* The Nichirin blade: a slightly curved blade, a dark guard, a wrapped grip. */
export function createKatana() {
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

  const blade = new THREE.Mesh(
    bladeGeometry,
    new THREE.MeshPhysicalMaterial({
      color: 0xd6f2ef,
      emissive: 0x2a7480,
      emissiveIntensity: 0.95,
      metalness: 0.55,
      roughness: 0.26,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  sword.add(blade);

  sword.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(bladeGeometry, 24),
      new THREE.LineBasicMaterial({ color: 0xd9ffff, transparent: true, opacity: 0.5 }),
    ),
  );

  const groove = new THREE.Mesh(
    new THREE.BoxGeometry(3.72, 0.018, 0.009),
    new THREE.MeshBasicMaterial({ color: 0x2f5b62, transparent: true, opacity: 0.7 }),
  );
  groove.position.set(2.03, 0.032, 0.047);
  sword.add(groove);

  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x0b2126, metalness: 0.8, roughness: 0.34 });
  const paleMetal = new THREE.MeshStandardMaterial({ color: 0x7fb5b2, metalness: 0.85, roughness: 0.26 });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x061318, metalness: 0.14, roughness: 0.76 });
  const wrapMaterial = new THREE.MeshStandardMaterial({ color: 0xa2d8d1, metalness: 0.2, roughness: 0.56 });

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

  sword.position.x = -1.68;
  return sword;
}

/* Mist trails: three thin tubes that unwind behind the blade. */
export function createRibbon(index) {
  const points = [];
  for (let step = 0; step < 11; step += 1) {
    const x = -4.7 + step * 0.94;
    const phase = step * 0.72 + index * 1.9;
    points.push(
      new THREE.Vector3(
        x,
        Math.sin(phase) * (0.55 + index * 0.14) + (index - 1) * 0.3,
        Math.cos(phase) * (0.5 + index * 0.17) - 0.45,
      ),
    );
  }

  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 120, 0.009 + index * 0.003, 5, false),
    new THREE.MeshBasicMaterial({
      color: index === 1 ? 0xe3ffff : 0x69cfc9,
      transparent: true,
      opacity: 0.16 - index * 0.02,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}
