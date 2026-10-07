import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type Resources = {
  geometries: Set<T.BufferGeometry>;
  materials: Set<T.Material>;
  textures: Set<T.Texture>;
};

/** Shared procedural assets: metric scale, reusable geometry, no remote model requests. */
export function industrialAssets(resources: Resources, shadows: boolean) {
  const cube = new T.BoxGeometry(1, 1, 1);
  const rounded = new RoundedBoxGeometry(1, 1, 1, 1, 0.045);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 16);
  const tire = new T.TorusGeometry(0.33, 0.105, 6, 16);
  [cube, rounded, cylinder, tire].forEach((g) => resources.geometries.add(g));
  const paint = (color: string, metallic = 0.15) => {
    const m = new T.MeshPhysicalMaterial({ color, roughness: 0.3,
      metalness: metallic, clearcoat: 0.35, clearcoatRoughness: 0.28 });
    resources.materials.add(m);
    return m;
  };
  const white = paint("#e8edf0"), blue = paint("#164d77"), teal = paint("#168f9c");
  const dark = paint("#25323c"), rim = paint("#b8c2c9", 0.85);
  const rubber = new T.MeshStandardMaterial({ color: "#181d20", roughness: 0.94 });
  const glass = new T.MeshPhysicalMaterial({ color: "#293e4d", roughness: 0.12,
    metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const amber = new T.MeshStandardMaterial({ color: "#e8a12d", emissive: "#b06a12", emissiveIntensity: 0.35 });
  const red = new T.MeshStandardMaterial({ color: "#af2630", emissive: "#7a161e", emissiveIntensity: 0.25 });
  const led = new T.MeshStandardMaterial({ color: "#e9fcff", emissive: "#bdeef9", emissiveIntensity: 1.2 });
  [rubber, glass, amber, red, led].forEach((m) => resources.materials.add(m));
  function part(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material,
    x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadows; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }
  const box = (p: T.Object3D, x: number, y: number, z: number,
    w: number, h: number, d: number, m: T.Material, soft = false) =>
    part(p, soft ? rounded : cube, m, x, y, z, w, h, d);
  function wheel(p: T.Object3D, x: number, y: number, z: number, radius = 0.44) {
    const scale = radius / 0.435;
    const t = part(p, tire, rubber, x, y, z, scale, scale, scale);
    t.rotation.y = Math.PI / 2;
    const hub = part(p, cylinder, rim, x, y, z, radius * 0.56, 0.19 * scale, radius * 0.56);
    hub.rotation.z = Math.PI / 2;
    const cap = part(p, cylinder, dark, x + Math.sign(x) * 0.105 * scale, y, z,
      radius * 0.2, 0.025, radius * 0.2);
    cap.rotation.z = Math.PI / 2;
  }
  function truck(parent: T.Object3D) {
    const g = new T.Group(); g.name = "Detailed dock tractor and trailer"; parent.add(g);
    // Rear threshold at local Z=0. Trailer floor meets the warehouse loading level.
    box(g, 0, 1.95, -4.7, 2.5, 2.7, 9.4, white, true);
    box(g, 0, 0.57, -4.7, 2.46, 0.12, 9.4, rim);
    box(g, 0, 0.44, -4.8, 2.22, 0.18, 9.6, dark);
    box(g, 0, 0.84, -10.3, 2.35, 0.85, 2.45, blue, true);
    box(g, 0, 1.93, -10.27, 2.35, 1.85, 2.3, blue, true);
    box(g, 0, 2.45, -11.44, 2.04, 0.67, 0.025, glass, true);
    box(g, 0, 2.85, -10.02, 2.2, 0.32, 1.74, white, true);
    box(g, 0, 0.64, -11.57, 2.36, 0.25, 0.2, rim, true);
    box(g, 0, 1.24, -11.49, 1.1, 0.58, 0.035, dark);
    for (let y = 1.06; y < 1.5; y += 0.11)
      box(g, 0, y, -11.515, 1, 0.025, 0.018, rim);
    for (const side of [-1, 1]) {
      const x = side * 1.26;
      box(g, x, 0.64, -4.8, 0.024, 0.055, 8.9, rim);
      box(g, x, 0.76, -5.3, 0.025, 0.045, 7.6, amber);
      for (let z = -8.7; z < -0.3; z += 0.8) {
        box(g, x, 1.95, z, 0.015, 2.56, 0.027, rim);
        box(g, x, 0.83, z, 0.025, 0.08, 0.1, amber);
      }
      box(g, side * 1.185, 2.3, -10.27, 0.024, 0.77, 1.45, glass);
      box(g, side * 1.2, 1.57, -10.58, 0.03, 0.035, 0.27, rim);
      box(g, side * 1.35, 2.24, -11.09, 0.16, 0.37, 0.15, dark, true);
      box(g, side * 1.23, 1.65, -11.04, 0.18, 0.035, 0.35, rim);
      box(g, side * 1.04, 0.88, -10.0, 0.25, 0.09, 0.6, rim);
      box(g, side * 0.95, 0.88, -11.6, 0.36, 0.15, 0.027, led, true);
      for (const z of [-1.8, -2.75, -10.15]) wheel(g, side * 1.15, 0.44, z);
      box(g, side * 1.05, 0.79, -2.3, 0.33, 0.15, 1.85, dark, true);
      box(g, side * 0.57, 1.9, 0.017, 1.12, 2.5, 0.035, white);
      box(g, side * 0.78, 1.9, 0.05, 0.035, 2.35, 0.035, rim);
      for (const y of [0.91, 1.89, 2.86])
        box(g, side * 1.14, y, 0.042, 0.12, 0.15, 0.047, rim);
      box(g, side * 0.9, 0.59, 0.035, 0.22, 0.12, 0.035, red);
    }
    box(g, 0, 1.92, 0.05, 0.015, 2.52, 0.018, dark);
    box(g, 0, 0.4, -0.15, 2.4, 0.17, 0.15, rim);
    return g;
  }
  function forklift(parent: T.Object3D) {
    const g = new T.Group(); g.name = "Electric counterbalance forklift"; parent.add(g);
    box(g, 0, 0.48, -0.2, 1.08, 0.6, 1.35, teal, true);
    box(g, 0, 0.58, -0.84, 1.04, 0.67, 0.35, teal, true);
    box(g, 0, 0.73, -0.05, 0.54, 0.14, 0.54, rubber, true);
    box(g, 0, 1, -0.24, 0.55, 0.4, 0.12, rubber, true);
    for (const side of [-1, 1]) {
      for (const z of [-0.63, 0.37]) wheel(g, side * 0.49, 0.21, z, 0.21);
      for (const z of [-0.58, 0.49])
        box(g, side * 0.46, 1.53, z, 0.055, 1.75, 0.055, dark);
      box(g, side * 0.25, 1.3, 0.53, 0.08, 2.25, 0.11, dark);
      box(g, side * 0.26, 0.16, 0.87, 0.11, 0.075, 0.76, rim);
      box(g, side * 0.26, 0.36, 0.49, 0.1, 0.45, 0.11, rim);
      box(g, side * 0.4, 2.38, 0.44, 0.13, 0.065, 0.09, led);
    }
    box(g, 0, 2.43, -0.01, 1.05, 0.1, 1.22, dark, true);
    for (let z = -0.49; z < 0.53; z += 0.2)
      box(g, 0, 2.45, z, 0.94, 0.07, 0.045, rim);
    box(g, 0, 1.16, 0.31, 0.33, 0.06, 0.22, dark, true);
    box(g, 0, 1.05, 0.36, 0.07, 0.38, 0.07, dark);
    box(g, 0, 0.78, 0.47, 0.7, 0.1, 0.12, rim);
    box(g, 0.34, 2.53, -0.35, 0.1, 0.12, 0.1, amber, true);
    return g;
  }
  function robot(parent: T.Object3D, width: number, height: number, depth: number) {
    const g = new T.Group(); g.name = "Autonomous mobile platform"; parent.add(g);
    box(g, 0, height * 0.36, 0, width * 0.98, height * 0.63, depth * 0.98, white, true);
    box(g, 0, height * 0.1, 0, width, height * 0.18, depth, rubber, true);
    box(g, 0, height * 0.72, 0, width * 0.88, height * 0.12, depth * 0.79, dark, true);
    for (const side of [-1, 1]) {
      box(g, side * width * 0.495, height * 0.31, 0, width * 0.015,
        height * 0.065, depth * 0.72, teal);
      box(g, side * width * 0.34, height * 0.38, depth * 0.495,
        width * 0.14, height * 0.075, depth * 0.015, led);
    }
    const lidar = part(g, cylinder, dark, 0, height * 0.87, -depth * 0.27,
      width * 0.12, height * 0.15, width * 0.12);
    lidar.name = "Lidar enclosure";
    box(g, 0, height * 0.88, depth * 0.2, width * 0.42, height * 0.08, depth * 0.3, teal, true);
    return g;
  }
  return { truck, forklift, robot };
}

/** Albedo + height/roughness detail at a consistent scale in each renderer. */
export function industrialSurfaces(resources: Resources, repeats: [number, number]) {
  let seed = 82761;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function map(draw: (ctx: CanvasRenderingContext2D) => void, color = true) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
    draw(canvas.getContext("2d")!);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.anisotropy = 8;
    resources.textures.add(texture); return texture;
  }
  const concrete = map((ctx) => {
    ctx.fillStyle = "#d6d9d8"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 24000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#7e858a18" : "#ffffff23";
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1);
    }
    ctx.strokeStyle = "#8c959b"; ctx.lineWidth = 0.8; ctx.strokeRect(0, 0, 512, 512);
  });
  const concreteDetail = map((ctx) => {
    ctx.fillStyle = "#bababa"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#9a9a9a" : "#d0d0d0";
      ctx.fillRect(random() * 512, random() * 512, 1, 1);
    }
    ctx.strokeStyle = "#333333"; ctx.lineWidth = 1; ctx.strokeRect(0, 0, 512, 512);
  }, false);
  [concrete, concreteDetail].forEach((t) => t.repeat.set(...repeats));
  const wood = map((ctx) => {
    ctx.fillStyle = "#bba17a"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 850; i++) {
      ctx.strokeStyle = random() > 0.5 ? "#79634226" : "#e4d3ae40";
      const y = random() * 512; ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + random() * 15, 340, y - random() * 15, 512, y); ctx.stroke();
    }
  });
  const metal = map((ctx) => {
    ctx.fillStyle = "#b0b0b0"; ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y++) {
      const v = Math.floor(140 + random() * 45); ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(0, y, 512, 1);
    }
  }, false);
  const asphalt = map((ctx) => {
    ctx.fillStyle = "#515c65"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 20000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#252e3b45" : "#aeb7bb40";
      ctx.fillRect(random() * 512, random() * 512, 1.5, 1.5);
    }
  });
  asphalt.repeat.set(...repeats);
  return { concrete, concreteDetail, wood, metal, asphalt };
}
