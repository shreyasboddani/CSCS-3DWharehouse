import * as T from "three";
import { industrialAssets, industrialSurfaces } from "./industrialAssets";
import { aisleNumber } from "./aisleNumber";
import { usesTemplateGeometry } from "../domain/design";
import { buildDesignWorld } from "./buildDesignWorld";
import { dockPose, facilityFixtures } from "../domain/facility";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { instanceStatic } from "./instanceStatic";
import { generateLayout, zones } from "../domain/warehouse";
import type {
  WarehouseConfig,
  OperationalRecord,
  Location,
  Layout,
} from "../domain/warehouse";
type Options = {
  config: WarehouseConfig;
  records: OperationalRecord[];
  designPreview: boolean;
  compact: boolean;
  layoutOverride?: Layout;
};
export function buildWarehouseWorld({
  config: c,
  records,
  designPreview,
  compact,
  layoutOverride,
}: Options): Omit<
  ReturnType<typeof buildDesignWorld>,
  "ground" | "highlight"
> & { ground: T.Mesh; highlight: T.Mesh; hitTargets?: T.Object3D[] } {
  if (c.design) {
    const legacyConfig = { ...c, design: undefined };
    const legacy = generateLayout(legacyConfig, "structure");
    if (usesTemplateGeometry(c, legacy))
      return {
        ...buildWarehouseWorld({
          config: legacyConfig,
          layoutOverride: generateLayout(c),
          records,
          designPreview,
          compact,
        }),
        layout: generateLayout(c),
      };
    return buildDesignWorld({ config: c, records, designPreview, compact });
  }
  const layout = layoutOverride || generateLayout(c),
    root = new T.Group(),
    interiorShell = new T.Group(),
    ceiling = new T.Group();
  root.name = c.name || "Warehouse";
  root.add(interiorShell, ceiling);
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  const boxGeo = new T.BoxGeometry(1, 1, 1),
    roundGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.07),
    cylinderGeo = new T.CylinderGeometry(1, 1, 1, 16),
    sphereGeo = new T.SphereGeometry(1, 12, 8);
  for (const geo of [boxGeo, roundGeo, cylinderGeo, sphereGeo])
    geometries.add(geo);
  function material(color: string, roughness = 0.65, metalness = 0) {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(m);
    return m;
  }
  function canvasTexture(
    draw: (ctx: CanvasRenderingContext2D) => void,
    size = 512,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    draw(canvas.getContext("2d")!);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    textures.add(texture);
    return texture;
  }
  let seed = 1826;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cardboardMap = canvasTexture((ctx) => {
    ctx.fillStyle = "#c7a778";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#b99a7030" : "#edd9ae30";
      ctx.fillRect(random() * 512, random() * 512, 3, 1);
    }
    ctx.fillStyle = "#dfcaa4";
    ctx.fillRect(238, 0, 36, 512);
    ctx.strokeStyle = "#b29369";
    ctx.strokeRect(2, 2, 508, 508);
    ctx.fillStyle = "#f7f7ef";
    ctx.fillRect(42, 292, 164, 104);
    ctx.fillStyle = "#3c4955";
    for (let x = 54; x < 192; x += 4)
      ctx.fillRect(x, 325, random() > 0.5 ? 1 : 3, 42);
    ctx.font = "16px monospace";
    ctx.fillText("HANDLING UNIT", 54, 314);
    ctx.fillText("CSCS / WT", 54, 386);
  });
  const m = {
    floor: material(
      c.floorFinish === "slate"
        ? "#85929c"
        : c.floorFinish === "polished"
          ? "#c7d1d8"
          : "#b5bfc6",
      c.floorFinish === "polished" ? 0.32 : 0.78,
      0.05,
    ),
    white: material("#f0f4f7", 0.45),
    navy: material("#294360", 0.48, 0.32),
    blue: material(
      c.rackFinish === "graphite"
        ? "#354a5e"
        : c.rackFinish === "teal"
          ? "#168586"
          : "#2774d3",
      0.3,
      0.25,
    ),
    orange: material("#da9353", 0.48, 0.12),
    steel: material("#8798a7", 0.4, 0.6),
    dark: material("#23303a", 0.66),
    teal: material("#1a9b99", 0.35, 0.1),
    wood: material("#bba27d", 0.88),
    yellow: material("#e9c361", 0.57),
    road: material("#536474", 0.95),
    carton: material("#ffffff", 0.92),
    empty: material("#bacbd8", 0.8),
    screen: material("#284864", 0.22, 0.2),
    skin: material("#d6ae8c", 0.82),
    vest: material("#d8c65e", 0.6),
    glass: material("#a4cbdc", 0.2, 0.3),
  };
  const resources = { geometries, materials, textures };
  const assets = industrialAssets(resources, !compact);
  const finishes = industrialSurfaces(resources, [c.width / 6, c.depth / 6]);
  m.floor.map = finishes.concrete;
  m.floor.bumpMap = finishes.concreteDetail;
  m.floor.bumpScale = 0.012;
  m.floor.roughnessMap = finishes.concreteDetail;
  m.floor.color.set(c.floorFinish === "slate" ? "#929caa" : "#ffffff");
  m.wood.map = finishes.wood;
  m.wood.color.set("#ffffff");
  m.steel.roughnessMap = finishes.metal;
  m.road.map = finishes.asphalt;
  m.road.color.set("#ffffff");
  m.road.bumpMap = finishes.asphalt;
  m.road.bumpScale = 0.015;
  m.white.roughness = 0.38;
  m.carton.map = cardboardMap;
  // Empty slots are selection targets, never phantom inventory boxes.
  m.empty.colorWrite = false;
  m.empty.depthWrite = false;
  m.empty.visible = false;
  m.glass.transparent = true;
  m.glass.opacity = 0.65;
  const led = new T.MeshStandardMaterial({
    color: "#eaf8ff",
    emissive: "#c5e6ff",
    emissiveIntensity: 1.7,
  });
  materials.add(led);
  function mesh(
    parent: T.Object3D,
    geo: T.BufferGeometry,
    mat: T.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) {
    const object = new T.Mesh(geo, mat);
    object.position.set(x, y, z);
    object.scale.set(w, h, d);
    object.castShadow = !compact;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: T.Material = m.white,
    rounded = false,
  ) => mesh(parent, rounded ? roundGeo : boxGeo, mat, x, y, z, w, h, d);
  const cylinder = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    mat: T.Material,
  ) => mesh(parent, cylinderGeo, mat, x, y, z, r, h, r);
  function rod(
    parent: T.Object3D,
    a: T.Vector3,
    b: T.Vector3,
    diameter: number,
    mat: T.Material,
  ) {
    const object = box(
      parent,
      0,
      0,
      0,
      diameter,
      a.distanceTo(b),
      diameter,
      mat,
    );
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return object;
  }
  const textCache = new Map<string, T.MeshBasicMaterial>();
  function plaque(
    parent: T.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    color = "#496982",
    rotation?: [number, number, number],
  ) {
    const key = text + color;
    let mat = textCache.get(key);
    if (!mat) {
      const tex = canvasTexture((ctx) => {
        ctx.scale(0.5, 0.5);
        ctx.fillStyle = "#f5f8fa";
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.font =
          "600 " + Math.min(140, Math.floor(650 / text.length)) + "px Arial";
        ctx.fillText(text, 256, 285);
        ctx.strokeStyle = "#d8e3eb";
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, 504, 504);
      }, 256);
      mat = new T.MeshBasicMaterial({ map: tex });
      materials.add(mat);
      textCache.set(key, mat);
    }
    const geo = new T.PlaneGeometry(w, h);
    geometries.add(geo);
    const p = new T.Mesh(geo, mat);
    p.position.set(x, y, z);
    if (rotation) p.rotation.set(...rotation);
    parent.add(p);
    return p;
  }
  const hitTargets: T.Object3D[] = [],
    binMeshes = new Map<T.InstancedMesh, Location[]>();
  const bind = (object: T.Object3D, id: string) => {
    object.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.userData.locationId = id;
        hitTargets.push(o);
      }
    });
  };
  // Full facility geometry. The overview opens two walls and the roof; walking closes the shell.
  const wallHeight = c.ceilingHeight ?? Math.max(12, c.levels * 1.25 + 2.4),
    front = -c.depth / 2,
    back = c.depth / 2;
  // Keep the foundation below the entire floor thickness. The old slab top
  // was only 5 mm below the floor surface, causing depth/shadow interference
  // when viewing a large facility from above.
  box(root, 0, -0.455, 0, c.width + 1, 0.75, c.depth + 1, m.white, true);
  const ground = box(root, 0, -0.035, 0, c.width, 0.07, c.depth, m.floor);
  ground.name = "Warehouse floor";
  const yardDepth = c.yardDepth ?? 12;
  box(
    root,
    0,
    -0.86,
    0,
    c.width + yardDepth * 2 + 6,
    0.13,
    c.depth + yardDepth * 2 + 6,
    m.white,
    true,
  );
  box(
    root,
    0,
    -0.65,
    front - yardDepth / 2,
    c.width + 10,
    0.12,
    yardDepth,
    m.road,
  );
  if (c.template === "through")
    box(
      root,
      0,
      -0.65,
      back + yardDepth / 2,
      c.width + 10,
      0.12,
      yardDepth,
      m.road,
    );
  if (c.template === "l-flow")
    box(
      root,
      c.width / 2 + yardDepth / 2,
      -0.65,
      0,
      yardDepth,
      0.12,
      c.depth + 10,
      m.road,
    );
  for (let x = -c.width / 2; x < c.width / 2; x += 2.4) {
    box(root, x, -0.57, front - yardDepth + 2, 0.95, 0.012, 0.07, m.white);
    if (c.template === "through")
      box(root, x, -0.57, back + yardDepth - 2, 0.95, 0.012, 0.07, m.white);
  }
  // Architectural perimeter walls with continuous clerestory glazing.
  box(
    root,
    -c.width / 2,
    wallHeight / 2,
    0,
    0.18,
    wallHeight,
    c.depth,
    m.white,
  );
  box(
    interiorShell,
    c.width / 2,
    wallHeight / 2,
    0,
    0.18,
    wallHeight,
    c.depth,
    m.white,
  );
  for (let z = front + 2; z < back - 1; z += 5) {
    box(
      root,
      -c.width / 2 + 0.14,
      wallHeight / 2,
      z,
      0.16,
      wallHeight,
      0.2,
      m.navy,
    );
    box(
      root,
      -c.width / 2 + 0.16,
      wallHeight - 1.2,
      z,
      0.08,
      1.1,
      3.5,
      m.glass,
    );
    box(
      interiorShell,
      c.width / 2 - 0.13,
      wallHeight / 2,
      z,
      0.17,
      wallHeight,
      0.2,
      m.navy,
    );
  }
  function dockWall(z: number, doors: Location[], parent: T.Object3D) {
    const ordered = [...doors].sort((a, b) => a.x - b.x),
      openings = ordered.map((l) => [l.x - 1.6, l.x + 1.6]);
    let start = -c.width / 2;
    for (const [left, right] of openings) {
      if (left > start)
        box(
          parent,
          (start + left) / 2,
          wallHeight / 2,
          z,
          left - start,
          wallHeight,
          0.18,
          m.white,
        );
      start = right;
    }
    if (start < c.width / 2)
      box(
        parent,
        (start + c.width / 2) / 2,
        wallHeight / 2,
        z,
        c.width / 2 - start,
        wallHeight,
        0.18,
        m.white,
      );
    for (const l of doors)
      box(
        parent,
        l.x,
        (wallHeight + 3.7) / 2,
        z,
        3.2,
        wallHeight - 3.7,
        0.18,
        m.white,
      );
  }
  const inboundDoors = layout.locations.filter((l) => l.zone === "inbound"),
    outboundDoors = layout.locations.filter((l) => l.zone === "outbound");
  dockWall(
    front,
    [...inboundDoors, ...(c.template === "u-flow" ? outboundDoors : [])],
    root,
  );
  if (c.template === "through") dockWall(back, outboundDoors, interiorShell);
  else
    box(
      interiorShell,
      0,
      wallHeight / 2,
      back,
      c.width,
      wallHeight,
      0.18,
      m.white,
    );
  if (c.template === "l-flow") {
    // Right wall is hidden in overview; openings remain available for loading.
    interiorShell.children
      .filter((o) => o.position.x > c.width / 2 - 0.3)
      .forEach((o) => (o.visible = false));
    const wall = new T.Group();
    wall.position.x = c.width / 2;
    wall.rotation.y = -Math.PI / 2;
    interiorShell.add(wall);
    // Rotating the local wall swaps its width axis into the building depth axis.
    const doors = [...outboundDoors].sort((a, b) => a.z - b.z);
    let start = front;
    for (const door of doors) {
      const left = door.z - 1.6,
        right = door.z + 1.6;
      if (left > start)
        box(
          wall,
          (start + left) / 2,
          wallHeight / 2,
          0,
          left - start,
          wallHeight,
          0.18,
          m.white,
        );
      box(
        wall,
        door.z,
        (wallHeight + 3.7) / 2,
        0,
        3.2,
        wallHeight - 3.7,
        0.18,
        m.white,
      );
      start = right;
    }
    if (start < back)
      box(
        wall,
        (start + back) / 2,
        wallHeight / 2,
        0,
        back - start,
        wallHeight,
        0.18,
        m.white,
      );
  }
  // Trusses, translucent roof lights, high-bay lamps.
  // A continuous perimeter frame keeps the building legible in both exterior and cutaway views.
  for (const x of [-c.width / 2, c.width / 2]) {
    const parent = x < 0 ? root : interiorShell;
    box(parent, x, wallHeight - 0.18, 0, 0.32, 0.38, c.depth, m.navy);
    box(parent, x, 0.45, 0, 0.23, 0.9, c.depth, m.steel);
  }
  for (const z of [front, back]) {
    const parent = z === front ? root : interiorShell;
    box(parent, 0, wallHeight - 0.18, z, c.width, 0.38, 0.32, m.navy);
    for (let x = -c.width / 2 + 0.5; x < c.width / 2; x += 1.2)
      box(parent, x, wallHeight - 1.2, z - 0.11, 0.018, 1.6, 0.03, m.steel);
  }
  plaque(
    root,
    "CSCS  |  WAREHOUSE TWIN",
    0,
    wallHeight - 1.4,
    front - 0.15,
    Math.min(12, c.width * 0.3),
    1.15,
    "#293b66",
    [0, Math.PI, 0],
  );
  for (const x of [-c.width / 2 + 1.15, c.width / 2 - 1.15]) {
    box(root, x, 0.006, 0, 1, 0.009, c.depth - 2.4, material("#d2d8d8", 0.88));
    box(
      root,
      x + (x < 0 ? 0.6 : -0.6),
      0.018,
      0,
      0.065,
      0.012,
      c.depth - 2.4,
      m.yellow,
    );
  }
  for (const z of [
    layout.centers.storage[1] - c.bays * 1.2 - 1.2,
    layout.centers.storage[1] + c.bays * 1.2 + 1.2,
  ]) {
    const span = c.aisles * (c.aisleWidth + 2.4);
    box(
      root,
      layout.centers.storage[0],
      0.017,
      z,
      span,
      0.014,
      0.055,
      m.yellow,
    );
  }
  // Service fixtures provide architectural scale without pretending to be tracked operational assets.
  for (let z = front + 3; z < back - 1; z += 9) {
    box(
      root,
      -c.width / 2 + 0.22,
      1.05,
      z,
      0.18,
      0.5,
      0.22,
      material("#c04d4b", 0.55),
      true,
    );
    cylinder(root, -c.width / 2 + 0.24, 1.34, z, 0.04, 0.1, m.dark);
    plaque(root, "FIRE", -c.width / 2 + 0.25, 1.7, z, 0.35, 0.18, "#a34244", [
      0,
      Math.PI / 2,
      0,
    ]);
    box(
      root,
      -c.width / 2 + 0.2,
      wallHeight - 0.75,
      z,
      0.15,
      0.42,
      0.7,
      m.steel,
    );
    for (let v = -0.2; v < 0.3; v += 0.08)
      box(
        root,
        -c.width / 2 + 0.285,
        wallHeight - 0.75,
        z + v,
        0.03,
        0.3,
        0.025,
        m.dark,
      );
  }
  const sideDoorZ = back - 2;
  box(root, -c.width / 2 + 0.13, 1.15, sideDoorZ, 0.08, 2.3, 1.1, m.navy, true);
  box(
    root,
    -c.width / 2 + 0.18,
    1.05,
    sideDoorZ - 0.32,
    0.08,
    0.06,
    0.12,
    m.steel,
  );
  plaque(
    root,
    "EXIT",
    -c.width / 2 + 0.2,
    2.55,
    sideDoorZ,
    0.8,
    0.3,
    "#328975",
    [0, Math.PI / 2, 0],
  );
  for (let x = -c.width / 2 + 3; x < c.width / 2; x += 6) {
    box(ceiling, x, wallHeight, 0, 0.12, 0.25, c.depth, m.steel);
    for (let z = front + 2; z < back - 2; z += 4) {
      rod(
        ceiling,
        new T.Vector3(x, wallHeight, z),
        new T.Vector3(x, wallHeight - 0.55, z + 2),
        0.055,
        m.steel,
      );
      rod(
        ceiling,
        new T.Vector3(x, wallHeight - 0.55, z + 2),
        new T.Vector3(x, wallHeight, z + 4),
        0.055,
        m.steel,
      );
    }
    box(ceiling, x, wallHeight - 0.56, 0, 0.1, 0.08, c.depth, m.steel);
    for (let z = front + 5; z < back - 3; z += 7) {
      box(ceiling, x, wallHeight - 0.85, z, 1.8, 0.1, 0.3, led);
      cylinder(ceiling, x, wallHeight - 0.65, z, 0.018, 0.4, m.steel);
    }
  }
  box(ceiling, 0, wallHeight + 0.17, 0, c.width, 0.08, c.depth, m.white);
  for (let x = -c.width / 2 + 2; x < c.width / 2; x += 4) {
    box(ceiling, x, wallHeight + 0.25, 0, 3.8, 0.15, c.depth, m.white);
    box(ceiling, x, wallHeight + 0.34, 0, 0.85, 0.03, c.depth - 2, m.glass);
  }
  // Restraint, floor plans, and named work zones.
  for (const zone of zones) {
    const [x, z] = layout.centers[zone.id];
    if (zone.id !== "storage") {
      const locs = layout.locations.filter((l) => l.zone === zone.id);
      const span =
        (zone.id === "staging"
          ? c.stagingLanes * 2.2
          : zone.id === "packing"
            ? c.packStations * 2.8
            : locs.length * 4) + 1;
      const orient =
        c.template === "l-flow" &&
        (zone.id === "packing" || zone.id === "outbound");
      const tint = material(
        "#" +
          new T.Color(zone.color)
            .lerp(new T.Color("#b5bfc6"), 0.65)
            .getHexString(),
      );
      box(root, x, 0.006, z, orient ? 3 : span, 0.014, orient ? span : 3, tint);
      plaque(
        root,
        zone.name.toUpperCase(),
        x,
        0.03,
        z + 2.35,
        7,
        0.8,
        zone.color,
        [-Math.PI / 2, 0, 0],
      );
    }
  }
  // High-detail rack modules; beams, bracing, feet, decking, and bay identifiers.
  for (const rack of layout.racks) {
    const rackGroup = new T.Group();
    root.add(rackGroup);
    rackGroup.name = "Aisle " + rack.aisle + " " + rack.side;
    for (let b = 0; b <= c.bays; b++) {
      const z = rack.z - rack.length / 2 + b * 2.4;
      for (const dx of [-0.58, 0.58]) {
        box(
          rackGroup,
          rack.x + dx,
          rack.height / 2,
          z,
          0.09,
          rack.height,
          0.09,
          m.blue,
        );
        box(rackGroup, rack.x + dx, 0.035, z, 0.22, 0.07, 0.22, m.navy);
        box(rackGroup, rack.x + dx, 0.38, z, 0.12, 0.7, 0.13, m.yellow);
      }
      for (let y = 0.5; y < rack.height; y += 0.9) {
        rod(
          rackGroup,
          new T.Vector3(rack.x - 0.58, y, z),
          new T.Vector3(rack.x + 0.58, Math.min(y + 0.8, rack.height), z),
          0.035,
          m.steel,
        );
        rod(
          rackGroup,
          new T.Vector3(rack.x + 0.58, y, z),
          new T.Vector3(rack.x - 0.58, Math.min(y + 0.8, rack.height), z),
          0.035,
          m.steel,
        );
      }
    }
    for (let level = 0; level < c.levels; level++) {
      const y = level * 1.25 + 0.12;
      for (const dx of [-0.58, 0.58])
        box(
          rackGroup,
          rack.x + dx,
          y,
          rack.z,
          0.08,
          0.13,
          rack.length,
          m.orange,
        );
      box(
        rackGroup,
        rack.x,
        y + 0.045,
        rack.z,
        1.05,
        0.035,
        rack.length,
        m.steel,
      );
    }
    const aisleFacing = rack.side === "L" ? 1 : -1;
    plaque(
      rackGroup,
      "A" + String(rack.aisle).padStart(2, "0") + " / " + rack.side,
      rack.x,
      rack.height + 0.35,
      rack.z - rack.length / 2 - 0.08,
      1.15,
      0.42,
      "#2f5d87",
      [0, Math.PI, 0],
    );
    if (!compact && c.bays <= 12)
      for (let b = 1; b <= c.bays; b++) {
        const z = rack.z + (b - (c.bays + 1) / 2) * 2.4;
        plaque(
          rackGroup,
          "B" + String(b).padStart(2, "0"),
          rack.x + aisleFacing * 0.631,
          0.17,
          z,
          0.55,
          0.16,
          "#466582",
          [0, (aisleFacing * Math.PI) / 2, 0],
        );
      }
    const centerX =
      rack.side === "L" ? rack.x + c.aisleWidth / 2 + 0.6 : undefined;
    if (centerX !== undefined) {
      const sign = aisleNumber(rack.aisle, centerX, rack.height + 1.2, rack.z - rack.length / 2);
      root.add(sign.sprite);
      textures.add(sign.texture);
      materials.add(sign.material);
      for (const dx of [-c.aisleWidth / 2 + 0.2, c.aisleWidth / 2 - 0.2])
        box(
          root,
          centerX + dx,
          0.008,
          rack.z,
          0.06,
          0.015,
          rack.length + 1.2,
          m.yellow,
        );
      plaque(
        root,
        "AISLE " + String(rack.aisle).padStart(2, "0"),
        centerX,
        0.03,
        rack.z - rack.length / 2 - 1.5,
        2.6,
        0.6,
        "#6d87a0",
        [-Math.PI / 2, 0, 0],
      );
      for (
        let z = rack.z - rack.length / 2 + 1;
        z < rack.z + rack.length / 2;
        z += 5
      ) {
        box(root, centerX, 0.02, z, 0.05, 0.012, 0.6, m.white);
        const left = box(
          root,
          centerX - 0.13,
          0.02,
          z - 0.2,
          0.04,
          0.012,
          0.32,
          m.white,
        );
        left.rotation.y = -0.8;
        const right = box(
          root,
          centerX + 0.13,
          0.02,
          z - 0.2,
          0.04,
          0.012,
          0.32,
          m.white,
        );
        right.rotation.y = 0.8;
      }
    }
  }
  const occupied = new Set(
      records
        .filter(
          (r) =>
            r.status !== "Dispatched" &&
            r.status !== "Expected" &&
            r.quantity > 0,
        )
        .map((r) => r.locationId),
    ),
    bins = layout.locations.filter((l) => l.zone === "storage");
  const hashId = (id: string) => {
    let n = 0;
    for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return n;
  };
  const loaded = bins.filter(
      (l) => occupied.has(l.id) || (designPreview && hashId(l.id) % 10 < 6),
    ),
    loadedIds = new Set(loaded.map((l) => l.id)),
    empty = bins.filter((l) => !loadedIds.has(l.id));
  function instanced(
    geo: T.BufferGeometry,
    mat: T.Material,
    locs: Location[],
    transform: (l: Location, d: T.Object3D) => void,
    pickable = false,
  ) {
    if (!locs.length) return;
    const byAisle = new Map<number, Location[]>();
    for (const location of locs) {
      const list = byAisle.get(location.aisle || 0);
      if (list) list.push(location); else byAisle.set(location.aisle || 0, [location]);
    }
    for (const aisleLocations of byAisle.values()) buildInstances(aisleLocations);
    function buildInstances(locs: Location[]) {
    const instance = new T.InstancedMesh(geo, mat, locs.length),
      dummy = new T.Object3D();
    locs.forEach((l, i) => {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      transform(l, dummy);
      dummy.updateMatrix();
      instance.setMatrixAt(i, dummy.matrix);
    });
    instance.castShadow = !compact && mat !== m.empty;
    instance.receiveShadow = true;
    root.add(instance);
    if (pickable) {
      binMeshes.set(instance, locs);
      hitTargets.push(instance);
    }
    return instance;
    }
  }
  const binDepth = 2 / c.bins;
  instanced(
    boxGeo,
    m.empty,
    empty,
    (l, d) => {
      d.position.set(l.x, l.y + 0.3, l.z);
      d.scale.set(1, 0.8, binDepth * 0.85);
    },
    true,
  );
  instanced(
    boxGeo,
    m.carton,
    loaded,
    (l, d) => {
      d.position.set(l.x, l.y + 0.27, l.z);
      d.scale.set(0.89, 0.73, binDepth * 0.8);
    },
    true,
  );
  // Wooden pallets, feet, and top strapping stay instanced even at large warehouse sizes.
  for (const dx of [-0.36, 0, 0.36])
    instanced(boxGeo, m.wood, loaded, (l, d) => {
      d.position.set(l.x + dx, l.y - 0.1, l.z);
      d.scale.set(0.12, 0.1, binDepth * 0.92);
    });
  for (const dz of [-0.32, 0.32])
    instanced(boxGeo, m.wood, loaded, (l, d) => {
      d.position.set(l.x, l.y - 0.02, l.z + dz * binDepth);
      d.scale.set(1, 0.05, 0.12);
    });
  instanced(boxGeo, m.white, loaded, (l, d) => {
    d.position.set(l.x, l.y + 0.65, l.z);
    d.scale.set(0.1, 0.015, binDepth * 0.81);
  });
  // Scanning and packing stations have functional surfaces, conveyors, tools, and guards.
  const operators: { arm: T.Group; phase: number }[] = [];
  function person(parent: T.Object3D, x: number, z: number, rotation: number) {
    const p = new T.Group();
    p.userData.animated = true;
    p.position.set(x, 0, z);
    p.rotation.y = rotation;
    parent.add(p);
    box(p, 0, 0.86, 0, 0.36, 0.5, 0.24, m.vest, true);
    box(p, 0, 0.58, 0, 0.29, 0.17, 0.22, m.navy, true);
    mesh(p, sphereGeo, m.skin, 0, 1.28, 0, 0.145, 0.16, 0.14);
    mesh(p, sphereGeo, m.white, 0, 1.42, 0, 0.17, 0.07, 0.17);
    for (const dx of [-0.11, 0.11]) {
      box(p, dx, 0.3, 0, 0.12, 0.52, 0.13, m.navy, true);
      box(p, dx, 0.055, -0.04, 0.15, 0.09, 0.25, m.dark, true);
    }
    box(p, 0, 0.9, -0.126, 0.27, 0.035, 0.01, m.white);
    box(p, 0, 0.73, -0.126, 0.27, 0.035, 0.01, m.white);
    const arm = new T.Group();
    arm.position.set(-0.2, 1.03, 0);
    p.add(arm);
    rod(
      arm,
      new T.Vector3(0, 0, 0),
      new T.Vector3(-0.09, -0.12, -0.19),
      0.08,
      m.navy,
    );
    rod(
      arm,
      new T.Vector3(-0.09, -0.12, -0.19),
      new T.Vector3(-0.02, -0.1, -0.39),
      0.07,
      m.skin,
    );
    box(arm, -0.02, -0.1, -0.43, 0.1, 0.07, 0.16, m.dark, true);
    rod(
      p,
      new T.Vector3(0.2, 1.02, 0),
      new T.Vector3(0.24, 0.69, -0.03),
      0.085,
      m.navy,
    );
    operators.push({ arm, phase: x + z });
    return p;
  }
  function pallet(parent: T.Object3D, x: number, z: number, stack = true) {
    for (const dx of [-0.45, 0, 0.45])
      box(parent, x + dx, 0.075, z, 0.15, 0.15, 1.05, m.wood);
    for (let dz = -0.48; dz <= 0.5; dz += 0.22)
      box(parent, x, 0.18, z + dz, 1.15, 0.06, 0.14, m.wood);
    if (stack) {
      box(parent, x, 0.58, z, 1.04, 0.72, 0.92, m.carton);
      box(parent, x - 0.27, 1.11, z, 0.5, 0.3, 0.88, m.carton);
      box(parent, x + 0.27, 1.11, z, 0.5, 0.3, 0.88, m.carton);
    }
  }
  for (const l of layout.locations.filter((l) => l.zone === "staging")) {
    for (const dx of [-0.87, 0.87])
      box(root, l.x + dx, 0.02, l.z, 0.06, 0.018, 2, m.yellow);
    for (const dz of [-1, 1])
      box(root, l.x, 0.02, l.z + dz, 1.8, 0.018, 0.06, m.yellow);
    plaque(root, l.code, l.x, 0.032, l.z - 1.32, 1.4, 0.3, "#568389", [
      -Math.PI / 2,
      0,
      0,
    ]);
    const exists = occupied.has(l.id) || designPreview;
    if (l.id.startsWith("QC-")) {
      const bench = new T.Group();
      bench.position.set(l.x, 0, l.z);
      root.add(bench);
      box(bench, 0, 0.94, 0, 1.25, 0.12, 0.85, m.steel, true);
      for (const x of [-0.5, 0.5])
        box(bench, x, 0.45, 0, 0.08, 0.9, 0.65, m.navy);
      box(bench, 0.35, 1.2, 0.2, 0.4, 0.32, 0.08, m.screen, true);
      box(bench, -0.25, 1.05, 0, 0.45, 0.08, 0.45, m.dark);
      if (exists) box(bench, -0.25, 1.25, 0, 0.36, 0.32, 0.34, m.carton);
      bind(bench, l.id);
    } else if (l.id.startsWith("RET-")) {
      box(root, l.x, 0.3, l.z, 1.2, 0.55, 1, m.teal, true);
      if (exists) box(root, l.x, 0.72, l.z, 0.8, 0.4, 0.7, m.carton);
    } else if (exists) pallet(root, l.x, l.z);
    const marker = box(root, l.x, 0.025, l.z, 1.65, 0.03, 1.75, m.empty);
    bind(marker, l.id);
  }
  const fixtures = facilityFixtures(c, layout);
  const scanner = new T.Group();
  scanner.position.set(fixtures.scanner.x, 0, fixtures.scanner.z);
  root.add(scanner);
  box(scanner, 0, 0.8, 0, 0.8, 0.09, 0.5, m.steel);
  box(scanner, 0, 0.4, 0, 0.12, 0.8, 0.12, m.navy);
  box(scanner, 0, 1.08, 0.16, 0.48, 0.32, 0.07, m.screen, true);
  plaque(scanner, "SCAN", 0, 1.09, 0.119, 0.38, 0.2, "#337a91", [
    0,
    Math.PI,
    0,
  ]);
  if (!compact) person(root, scanner.position.x, scanner.position.z + 0.65, 0);
  for (const l of layout.locations.filter((l) => l.zone === "packing")) {
    const station = new T.Group();
    station.position.set(l.x, 0, l.z);
    if (c.template === "l-flow") station.rotation.y = Math.PI / 2;
    root.add(station);
    box(station, 0, 0.96, 0, 2.1, 0.13, 0.95, m.white, true);
    for (const dx of [-0.88, 0.88])
      for (const dz of [-0.35, 0.35])
        box(station, dx, 0.48, dz, 0.07, 0.96, 0.07, m.navy);
    box(station, 0.65, 1.28, 0.28, 0.48, 0.34, 0.08, m.screen, true);
    box(station, 0.65, 1.06, 0.28, 0.09, 0.23, 0.09, m.steel);
    box(station, -0.65, 1.13, 0.22, 0.35, 0.24, 0.4, m.white, true);
    box(station, -0.65, 1.2, 0.0, 0.22, 0.07, 0.08, m.dark);
    if (occupied.has(l.id) || designPreview)
      box(station, 0, 1.26, -0.12, 0.65, 0.48, 0.55, m.carton);
    box(station, 0.62, 1.04, -0.22, 0.4, 0.03, 0.25, m.dark, true);
    // Independent roller conveyor returns packed units to dispatch; it is not a fake animated shipment.
    box(station, 0, 0.64, 1.05, 1.65, 0.12, 0.6, m.navy);
    for (let x = -0.7; x <= 0.7; x += 0.14) {
      const roller = cylinder(station, x, 0.73, 1.05, 0.05, 0.58, m.steel);
      roller.rotation.x = Math.PI / 2;
    }
    for (const dx of [-0.65, 0.65])
      box(station, dx, 0.33, 1.05, 0.07, 0.65, 0.08, m.navy);
    plaque(station, l.code, 0, 1.75, 0.38, 1.25, 0.35, "#6e839a", [
      0,
      Math.PI,
      0,
    ]);
    bind(station, l.id);
    if (!compact)
      person(
        root,
        c.template === "l-flow" ? l.x - 1.35 : l.x,
        c.template === "l-flow" ? l.z : l.z - 1.35,
        c.template === "l-flow" ? Math.PI * 1.5 : Math.PI,
      );
  }
  function truck(parent: T.Object3D) {
    assets.truck(parent);
  }
  for (const l of layout.locations.filter(
    (l) => l.zone === "inbound" || l.zone === "outbound",
  )) {
    const dock = new T.Group();
    const pose = dockPose(l, c);
    dock.position.set(pose.x, 0, pose.z);
    dock.rotation.y = pose.rotation;
    root.add(dock);
    for (const x of [-1.38, 1.38]) {
      box(dock, x, 1.72, 0, 0.22, 3.5, 0.34, m.navy);
      box(dock, x, 0.55, -0.2, 0.23, 0.8, 0.3, m.dark, true);
    }
    box(dock, 0, 3.5, 0, 3, 0.23, 0.34, m.navy);
    const hasTruck =
      records.some(
        (r) =>
          r.kind === "Truck" &&
          r.locationId === l.id &&
          (r.status === "At dock" || r.status === "On hold"),
      ) || designPreview;
    const shutterBottom = hasTruck ? 2.9 : 0;
    box(
      dock,
      0,
      (shutterBottom + 3.4) / 2,
      0.075,
      2.6,
      3.4 - shutterBottom,
      0.08,
      m.steel,
    );
    for (let y = shutterBottom + 0.15; y < 3.4; y += 0.18)
      box(dock, 0, y, -0.01, 2.6, 0.02, 0.03, m.white);
    box(dock, 0, 0.09, -0.8, 2.3, 0.18, 1.5, m.navy);
    for (const x of [-1.8, 1.8]) {
      cylinder(dock, x, -0.11, -0.55, 0.095, 0.96, m.yellow);
      cylinder(dock, x, -0.09, -0.55, 0.099, 0.12, m.dark);
    }
    for (const x of [-1.7, 1.7])
      box(dock, x, -0.57, -4.5, 0.075, 0.022, 8, m.white);
    for (let y = 0.2; y < 3.4; y += 0.12)
      box(dock, -1.52, y, -0.11, 0.13, 0.02, 0.14, m.yellow);
    for (let z = -1; z > -8; z -= 1.5)
      box(dock, 0, -0.57, z, 0.08, 0.018, 0.6, m.yellow);
    plaque(dock, l.code, 0, -0.56, -9, 1.5, 0.55, "#294966", [
      -Math.PI / 2,
      0,
      0,
    ]);
    plaque(dock, l.code, 0, 4.06, -0.05, 2.1, 0.48, "#2f587f", [0, Math.PI, 0]);
    const zoneMaterial = material(l.zone === "inbound" ? "#3883c6" : "#289492");
    box(dock, 1.49, 2.5, -0.16, 0.1, 0.25, 0.1, zoneMaterial, true);
    bind(dock, l.id);
    const staged = records.some(
      (r) =>
        r.kind === "Handling unit" &&
        r.status !== "Dispatched" &&
        r.locationId === l.id,
    );
    if (staged) {
      pallet(dock, 0, 2.1);
      bind(dock, l.id);
    }
    if (hasTruck) {
      const vehicle = new T.Group();
      vehicle.position.set(0, -0.6, 0);
      dock.add(vehicle);
      truck(vehicle);
      bind(vehicle, l.id);
    }
  }
  // A parked electric lift provides scale; it is a visual fixture, not a tracked asset.
  const forklift = new T.Group();
  forklift.position.set(fixtures.forklift.x, 0, fixtures.forklift.z);
  forklift.rotation.y = 0.3;
  root.add(forklift);
  assets.forklift(forklift);
  const selectionMat = new T.MeshBasicMaterial({
    color: "#18a7c6",
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });
  materials.add(selectionMat);
  const highlight = box(root, 0, 0, 0, 1, 1, 1, selectionMat);
  highlight.visible = false;
  highlight.name = "Selection highlight";
  highlight.castShadow = false;
  // Spatially grouped instancing retains detailed parts with one shared vertex buffer.
  instanceStatic(root, new Set([ground, highlight]), [ceiling, interiorShell]);
  hitTargets.length = 0;
  root.traverse((o) => {
    if (
      o instanceof T.Mesh &&
      (o.userData.locationId || binMeshes.has(o as T.InstancedMesh))
    )
      hitTargets.push(o);
  });
  const originalShellMaterials = new Map<T.Mesh, T.Material | T.Material[]>(),
    ghosts = new Map<T.Material, T.Material>();
  interiorShell.traverse((object) => {
    if (object instanceof T.Mesh)
      originalShellMaterials.set(object, object.material);
  });
  const setShell = (solid: boolean) => {
    interiorShell.visible = true;
    originalShellMaterials.forEach((original, object) => {
      const ghost = (mat: T.Material) => {
        let value = ghosts.get(mat);
        if (!value) {
          value = mat.clone();
          value.transparent = true;
          value.opacity = 0.16;
          value.depthWrite = false;
          ghosts.set(mat, value);
          materials.add(value);
        }
        return value;
      };
      object.material = solid
        ? original
        : Array.isArray(original)
          ? original.map(ghost)
          : ghost(original);
      object.castShadow = solid && !compact;
    });
  };
  return {
    root,
    layout,
    ground,
    setActiveFloor: (_id?: string) => {},
    setAutomation: (
      _state?: import("../domain/automation").AutomationState,
    ) => {},
    animate: (_elapsed: number) => {},
    hitTargets,
    binMeshes,
    highlight,
    ceiling,
    interiorShell,
    operators,
    wallHeight,
    setShell,
    dispose: () => {
      root.traverse((o) => { if (o instanceof T.InstancedMesh) o.dispose(); });
      root.clear();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
