import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { generateLayout } from "../domain/warehouse";
import type {
  WarehouseConfig,
  OperationalRecord,
  Location,
} from "../domain/warehouse";
import {
  equipmentCatalog,
  floorElevation,
  mobileRobots,
  pointInside,
} from "../domain/design";
import type { DesignModule } from "../domain/design";

/** Render the same saved coordinates as the 2D editor. No layout calculations live here. */
export function buildDesignWorld({
  config: c,
  records,
  designPreview,
  compact,
}: {
  config: WarehouseConfig;
  records: OperationalRecord[];
  designPreview: boolean;
  compact: boolean;
}) {
  const design = c.design!,
    layout = generateLayout(c),
    root = new T.Group(),
    ceiling = new T.Group(),
    interiorShell = new T.Group();
  root.name = c.name;
  root.add(ceiling, interiorShell);
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  const cube = new T.BoxGeometry(1, 1, 1);
  geometries.add(cube);
  const material = (color: string, roughness = 0.7, metalness = 0) => {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(m);
    return m;
  };
  const white = material("#e8edf2"),
    floorMat = material(
      c.floorFinish === "slate"
        ? "#85929c"
        : c.floorFinish === "polished"
          ? "#c7d1d8"
          : "#b5bfc6",
      c.floorFinish === "polished" ? 0.32 : 0.78,
      0.05,
    ),
    steel = material("#7c92a6", 0.45, 0.35),
    blue = material(
      c.rackFinish === "teal"
        ? "#238f94"
        : c.rackFinish === "graphite"
          ? "#4c5d70"
          : "#2774d3",
      0.3,
      0.25,
    ),
    beam = material("#da9353", 0.48, 0.12),
    dark = material("#23354c"),
    cardboard = material("#c8af86"),
    pallet = material("#ab906c"),
    teal = material("#32aca4"),
    skin = material("#d6ae8c"),
    vest = material("#d8c65e"),
    red = material("#bf5554");

  let seed = 918273;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function texture(draw: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    draw(ctx);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    textures.add(map);
    return map;
  }
  const concrete = texture((ctx) => {
    ctx.fillStyle = "#d1d9df";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#8293a015" : "#f9fbfd30";
      ctx.fillRect(
        random() * 512,
        random() * 512,
        1 + random() * 2,
        1 + random() * 2,
      );
    }
    ctx.strokeStyle = "#9fadb726";
    ctx.strokeRect(0, 0, 512, 512);
  });
  concrete.wrapS = concrete.wrapT = T.RepeatWrapping;
  concrete.repeat.set(0.2, 0.2);
  floorMat.map = concrete;
  cardboard.color.set("#ffffff");
  cardboard.map = texture((ctx) => {
    ctx.fillStyle = "#c7a778";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = random() > 0.5 ? "#b99a7030" : "#edd9ae30";
      ctx.fillRect(random() * 512, random() * 512, 3, 1);
    }
    ctx.fillStyle = "#dfcaa4";
    ctx.fillRect(238, 0, 36, 512);
    ctx.fillStyle = "#f7f7ef";
    ctx.fillRect(42, 292, 164, 104);
    ctx.fillStyle = "#3c4955";
    for (let x = 54; x < 192; x += 4)
      ctx.fillRect(x, 325, random() > 0.5 ? 1 : 3, 42);
    ctx.font = "16px monospace";
    ctx.fillText("HANDLING UNIT", 54, 314);
  });
  const yellow = material("#e9c361", 0.57),
    glass = material("#a4cbdc", 0.2, 0.3),
    led = new T.MeshStandardMaterial({
      color: "#f1f8ff",
      emissive: "#e2efff",
      emissiveIntensity: 0.6,
    });
  materials.add(led);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 8);
  geometries.add(cylinder);
  const rod = (
    parent: T.Object3D,
    a: T.Vector3,
    b: T.Vector3,
    r: number,
    mat: T.Material,
  ) => {
    const mesh = new T.Mesh(cylinder, mat);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(r, a.distanceTo(b), r);
    mesh.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    mesh.castShadow = !compact;
    parent.add(mesh);
    return mesh;
  };
  const box = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: T.Material,
  ) => {
    const mesh = new T.Mesh(cube, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = !compact;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const floors: T.Group[] = [],
    roofs: T.Group[] = [],
    walls: T.Group[] = [],
    mobile: { object: T.Group; module: DesignModule; floorIndex: number }[] =
      [];
  const binMeshes = new Map<T.InstancedMesh, Location[]>(),
    operators: { arm: T.Object3D; phase: number }[] = [];
  const activeStock = new Set(
    records
      .filter(
        (r) =>
          r.kind !== "Truck" &&
          r.quantity > 0 &&
          !["Expected", "Dispatched"].includes(r.status),
      )
      .map((r) => r.locationId),
  );
  const shapeFor = (points: { x: number; z: number }[]) => {
    const shape = new T.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    for (const p of points.slice(1)) shape.lineTo(p.x, -p.z);
    shape.closePath();
    return shape;
  };
  const slab = (
    parent: T.Object3D,
    fi: number,
    top: number,
    depth: number,
    mat: T.Material,
  ) => {
    const geo = new T.ExtrudeGeometry(shapeFor(design.floors[fi].outline), {
      depth,
      bevelEnabled: false,
    });
    geo.rotateX(-Math.PI / 2);
    geometries.add(geo);
    const mesh = new T.Mesh(geo, mat);
    mesh.userData.walkSurface = !roofs.includes(parent as T.Group);
    mesh.position.y = top - depth;
    mesh.receiveShadow = true;
    mesh.castShadow = !compact;
    parent.add(mesh);
    return mesh;
  };
  const ground = slab(root, 0, 0, 0.25, floorMat);
  ground.name = "Warehouse floor";
  const platform = box(
    root,
    0,
    -0.65,
    0,
    c.width + 30,
    0.15,
    c.depth + 30,
    white,
  );
  platform.castShadow = false;
  box(root, 0, -0.52, 0, c.width + 26, 0.08, c.depth + 26, material("#6c8295"));
  const label = (
    parent: T.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#eef4fa";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#27405d";
    ctx.font = "600 42px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text.slice(0, 24), 256, 78);
    const texture = new T.CanvasTexture(canvas);
    const mat = new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide });
    materials.add(mat);
    const geo = new T.PlaneGeometry(w, w / 4);
    geometries.add(geo);
    const mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  design.floors.forEach((f, fi) => {
    const elevation = floorElevation(design, fi),
      group = new T.Group(),
      roof = new T.Group(),
      wallGroup = new T.Group();
    root.add(group);
    ceiling.add(roof);
    interiorShell.add(wallGroup);
    floors.push(group);
    roofs.push(roof);
    walls.push(wallGroup);
    group.name = f.name;
    group.userData.floorId = f.id;
    if (fi) slab(group, fi, elevation, 0.3, floorMat);
    slab(roof, fi, elevation + f.height, 0.15, white);
    for (let j = 0; j < f.outline.length; j++) {
      const a = f.outline[j],
        b = f.outline[(j + 1) % f.outline.length],
        length = Math.hypot(a.x - b.x, a.z - b.z),
        angle = -Math.atan2(b.z - a.z, b.x - a.x);
      const wall = box(
        wallGroup,
        (a.x + b.x) / 2,
        elevation + f.height / 2,
        (a.z + b.z) / 2,
        length,
        f.height,
        0.15,
        white,
      );
      wall.rotation.y = angle;
      const trim = box(
        wallGroup,
        (a.x + b.x) / 2,
        elevation + 0.35,
        (a.z + b.z) / 2,
        length,
        0.7,
        0.2,
        dark,
      );
      trim.rotation.y = angle;
      for (let k = 1; k < length / 4; k++) {
        const t = (k * 4) / length,
          p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const rib = box(
          wallGroup,
          p.x,
          elevation + f.height / 2,
          p.z,
          0.045,
          f.height - 0.2,
          0.2,
          steel,
        );
        rib.rotation.y = angle;
      }
      for (let k = 2; k < length - 2; k += 6) {
        const t = k / length,
          p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const window = box(
          wallGroup,
          p.x,
          elevation + f.height - 1.1,
          p.z,
          Math.min(3, length - 4),
          0.75,
          0.21,
          glass,
        );
        window.rotation.y = angle;
      }

      const fascia = box(
        wallGroup,
        (a.x + b.x) / 2,
        elevation + f.height - 0.2,
        (a.z + b.z) / 2,
        length,
        0.25,
        0.22,
        dark,
      );
      fascia.rotation.y = angle;
    }

    for (let x = -c.width / 2 + 4; x < c.width / 2; x += 8)
      for (let z = -c.depth / 2 + 4; z < c.depth / 2; z += 8) {
        if (!pointInside({ x, z }, f.outline)) continue;
        box(roof, x, elevation + f.height - 0.75, z, 1.8, 0.1, 0.3, led);
        rod(
          roof,
          new T.Vector3(x, elevation + f.height - 0.05, z),
          new T.Vector3(x, elevation + f.height - 0.7, z),
          0.015,
          steel,
        );
      }
    label(group, f.name, 0, elevation + 0.025, 0, 6);
    for (const m of f.modules) {
      const g = new T.Group();
      g.position.set(m.x, elevation, m.z);
      g.rotation.y = (-m.rotation * Math.PI) / 180;
      group.add(g);
      g.name = m.label;
      g.userData.moduleId = m.id;
      const loc = layout.locations.find((l) => l.moduleId === m.id);
      if (loc) g.userData.locationId = loc.id;
      const color = material(
        equipmentCatalog.find((e) => e.id === m.kind)?.color || "#a2b7d2",
      );
      if (m.kind === "area") {
        const tint = new T.MeshBasicMaterial({
          color: (
            {
              inbound: "#3c7be8",
              staging: "#18a399",
              storage: "#6276ba",
              packing: "#bc9453",
              outbound: "#357e83",
            } as const
          )[m.zone || "storage"],
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
        });
        materials.add(tint);
        box(g, 0, 0.006, 0, m.width, 0.008, m.depth, tint).castShadow = false;
        label(
          g,
          m.label,
          0,
          0.025,
          -m.depth / 2 + 0.7,
          Math.min(7, m.width * 0.8),
        );
      } else if (m.kind === "aisle") {
        for (const side of [-1, 1]) {
          const x = side * (m.aisleWidth / 2 + 0.6),
            height = m.levels * 1.25 + 0.3;
          for (let b = 0; b <= m.bays; b++)
            for (const dx of [-0.57, 0.57]) {
              const z = (b - m.bays / 2) * 2.4;
              box(g, x + dx, height / 2, z, 0.09, height, 0.09, blue);
              box(g, x + dx, 0.15, z, 0.16, 0.3, 0.16, beam);
            }
          for (let level = 0; level < m.levels; level++) {
            const y = level * 1.25 + 0.3;
            for (const dx of [-0.58, 0.58])
              box(g, x + dx, y, 0, 0.08, 0.1, m.bays * 2.4, beam);
            box(g, x, y - 0.03, 0, 1.05, 0.03, m.bays * 2.4, steel);
          }
        }

        for (const side of [-1, 1]) {
          const x = side * (m.aisleWidth / 2 + 0.6),
            h = m.levels * 1.25 + 0.3;
          for (let b = 0; b <= m.bays; b++) {
            const z = (b - m.bays / 2) * 2.4;
            for (const dx of [-0.58, 0.58]) {
              box(g, x + dx, 0.035, z, 0.22, 0.07, 0.22, dark);
              box(g, x + dx, 0.38, z, 0.12, 0.7, 0.13, yellow);
            }
            for (let y = 0.5; y < h; y += 0.9) {
              rod(
                g,
                new T.Vector3(x - 0.58, y, z),
                new T.Vector3(x + 0.58, Math.min(y + 0.8, h), z),
                0.018,
                steel,
              );
              rod(
                g,
                new T.Vector3(x + 0.58, y, z),
                new T.Vector3(x - 0.58, Math.min(y + 0.8, h), z),
                0.018,
                steel,
              );
            }
          }
          for (let b = 1; b <= m.bays; b++) {
            const z = (b - (m.bays + 1) / 2) * 2.4;
            label(g, `B${String(b).padStart(2, "0")}`, x, 0.025, z, 1);
          }
        }
        for (const x of [-m.aisleWidth / 2 + 0.15, m.aisleWidth / 2 - 0.15])
          box(g, x, 0.013, 0, 0.06, 0.012, m.bays * 2.4 + 1, yellow);
        for (let z = -m.bays * 1.2 + 1; z < m.bays * 1.2; z += 5) {
          box(g, 0, 0.023, z, 0.05, 0.012, 0.6, white);
          const l = box(g, -0.13, 0.023, z - 0.2, 0.04, 0.012, 0.32, white),
            r = box(g, 0.13, 0.023, z - 0.2, 0.04, 0.012, 0.32, white);
          l.rotation.y = -0.8;
          r.rotation.y = 0.8;
        }
        const bins = layout.locations.filter((l) => l.moduleId === m.id),
          occupied = bins.filter(
            (l, i) => activeStock.has(l.id) || (designPreview && i % 3 === 0),
          );
        if (occupied.length) {
          const mesh = new T.InstancedMesh(cube, cardboard, occupied.length),
            matrix = new T.Matrix4();
          for (let i = 0; i < occupied.length; i++) {
            const l = occupied[i];
            matrix.compose(
              new T.Vector3(l.x, l.y + 0.25, l.z),
              new T.Quaternion().setFromAxisAngle(
                new T.Vector3(0, 1, 0),
                (-m.rotation * Math.PI) / 180,
              ),
              new T.Vector3(0.9, 0.45, 1.8 / m.bins),
            );
            mesh.setMatrixAt(i, matrix);
          }
          mesh.castShadow = !compact;
          mesh.receiveShadow = true;
          root.add(mesh);
          mesh.userData.floorId = f.id;
          binMeshes.set(mesh, occupied);
          const bases = new T.InstancedMesh(cube, pallet, occupied.length),
            mat = new T.Matrix4();
          occupied.forEach((l, i) => {
            mat.compose(
              new T.Vector3(l.x, l.y - 0.03, l.z),
              new T.Quaternion().setFromAxisAngle(
                new T.Vector3(0, 1, 0),
                (-m.rotation * Math.PI) / 180,
              ),
              new T.Vector3(1, 0.09, 1.95 / m.bins),
            );
            bases.setMatrixAt(i, mat);
          });
          bases.userData.floorId = f.id;
          bases.castShadow = !compact;
          root.add(bases);
          binMeshes.set(bases, occupied);
        }
        const addressable = layout.locations.filter((l) => l.moduleId === m.id);
        if (addressable.length) {
          const pickMaterial = new T.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: false,
          });
          materials.add(pickMaterial);
          const proxies = new T.InstancedMesh(
            cube,
            pickMaterial,
            addressable.length,
          );
          const matrix = new T.Matrix4();
          addressable.forEach((l, i) => {
            matrix.compose(
              new T.Vector3(l.x, l.y + 0.25, l.z),
              new T.Quaternion().setFromAxisAngle(
                new T.Vector3(0, 1, 0),
                (-m.rotation * Math.PI) / 180,
              ),
              new T.Vector3(0.95, 0.65, 2.1 / m.bins),
            );
            proxies.setMatrixAt(i, matrix);
          });
          proxies.userData.floorId = f.id;
          root.add(proxies);
          binMeshes.set(proxies, addressable);
        }
        label(g, `AISLE ${m.number}`, 0, 0.03, -m.bays * 1.2 - 0.5, 2.7);
      } else if (m.kind === "inbound" || m.kind === "outbound") {
        for (const x of [-m.width / 2 + 0.12, m.width / 2 - 0.12])
          box(g, x, 1.9, -m.depth / 2 + 0.08, 0.24, 3.8, 0.3, dark);
        box(g, 0, 3.8, -m.depth / 2 + 0.08, m.width, 0.25, 0.3, dark);
        box(g, 0, 1.9, -m.depth / 2 + 0.14, m.width - 0.35, 3.7, 0.06, steel);
        for (let y = 0.4; y < 3.7; y += 0.3)
          box(g, 0, y, -m.depth / 2 + 0.18, m.width - 0.4, 0.025, 0.015, white);
        label(
          g,
          `${m.kind === "inbound" ? "IN" : "OUT"}-${m.number}`,
          0,
          0.035,
          0.2,
          2,
        );

        for (const side of [-1, 1]) {
          box(
            g,
            side * (m.width / 2 + 0.18),
            0.55,
            -m.depth / 2 + 0.4,
            0.15,
            1.1,
            0.15,
            yellow,
          );
          box(
            g,
            side * (m.width / 2 - 0.12),
            0.025,
            0,
            0.05,
            0.015,
            m.depth,
            yellow,
          );
          box(
            g,
            side * (m.width / 2 + 0.2),
            -0.45,
            -m.depth / 2 - 6,
            0.07,
            0.015,
            12,
            white,
          );
        }
        box(
          g,
          0,
          0.12,
          -m.depth / 2,
          Math.max(1, m.width - 1),
          0.2,
          0.8,
          steel,
        );
        const truck = records.find(
          (r) =>
            r.locationId === loc?.id &&
            r.kind === "Truck" &&
            ["At dock", "On hold"].includes(r.status),
        );
        if (truck || designPreview) {
          const truckGroup = new T.Group();
          g.add(truckGroup);
          truckGroup.userData.locationId = loc?.id;
          box(truckGroup, 0, 1.6, -m.depth / 2 - 5.1, 2.6, 2.7, 9.4, white);
          box(truckGroup, 0, 0.18, -m.depth / 2 - 5.1, 2.4, 0.3, 9.4, dark);
          box(truckGroup, 0, 0.85, -m.depth / 2 - 10.9, 2.5, 2.4, 2.4, blue);
          box(truckGroup, 0, 1.45, -m.depth / 2 - 12.12, 2.1, 0.8, 0.03, dark);

          for (const x of [-1.31, 1.31]) {
            for (let z = -m.depth / 2 - 0.6; z > -m.depth / 2 - 9.7; z -= 0.75)
              box(truckGroup, x, 1.6, z, 0.025, 2.5, 0.035, steel);
            box(
              truckGroup,
              x,
              0.27,
              -m.depth / 2 - 5.1,
              0.035,
              0.06,
              9.4,
              yellow,
            );
            box(
              truckGroup,
              x,
              1.45,
              -m.depth / 2 - 10.9,
              0.025,
              0.72,
              1.1,
              glass,
            );
            box(
              truckGroup,
              x * 1.16,
              1.35,
              -m.depth / 2 - 11.55,
              0.18,
              0.32,
              0.16,
              dark,
            );
          }
          box(
            truckGroup,
            0,
            1.45,
            -m.depth / 2 - 12.125,
            2.05,
            0.82,
            0.04,
            glass,
          );
          box(truckGroup, 0, 0.4, -m.depth / 2 - 12.14, 1.3, 0.38, 0.045, dark);
          for (const x of [-0.93, 0.93])
            box(
              truckGroup,
              x,
              0.4,
              -m.depth / 2 - 12.16,
              0.25,
              0.12,
              0.05,
              led,
            );
          for (const x of [-1.12, 1.12])
            box(truckGroup, x, 0.25, -m.depth / 2 - 0.3, 0.18, 0.16, 0.08, red);
          for (const x of [-1.15, 1.15])
            for (const z of [-2, -3, -10.8]) {
              const geo = new T.CylinderGeometry(0.45, 0.45, 0.25, 12);
              geo.rotateZ(Math.PI / 2);
              geometries.add(geo);
              const wheel = new T.Mesh(geo, dark);
              wheel.position.set(x, -0.03, -m.depth / 2 + z);
              truckGroup.add(wheel);
            }
        }
      } else if (
        m.kind === "belt" ||
        m.kind === "roller" ||
        m.kind === "sorter"
      ) {
        box(g, 0, m.height - 0.1, 0, m.width, 0.2, m.depth, dark);
        for (const x of [-m.width / 2, m.width / 2])
          box(g, x, m.height, 0, 0.08, 0.16, m.depth, steel);
        for (let z = -m.depth / 2 + 0.2; z < m.depth / 2; z += 0.3)
          box(
            g,
            0,
            m.height + 0.015,
            z,
            m.width - 0.15,
            0.035,
            m.kind === "roller" ? 0.08 : 0.015,
            m.kind === "roller" ? steel : color,
          );
        for (const x of [-m.width / 2 + 0.15, m.width / 2 - 0.15])
          for (const z of [-m.depth / 2 + 0.3, m.depth / 2 - 0.3])
            box(g, x, m.height / 2, z, 0.09, m.height, 0.09, steel);
        if (m.task !== "idle")
          box(g, 0, m.height + 0.2, 0, 0.6, 0.4, 0.6, cardboard);
      } else if (m.kind === "office") {
        for (const x of [-m.width / 2, m.width / 2])
          box(g, x, m.height / 2, 0, 0.12, m.height, m.depth, white);
        for (const z of [-m.depth / 2, m.depth / 2])
          box(g, 0, m.height / 2, z, m.width, m.height, 0.12, white);
        box(g, 0, m.height + 0.05, 0, m.width, 0.1, m.depth, white);
        box(g, 0, 0.75, 0, 2, 0.12, 1, steel);
        box(g, 0, 0.3, 0.8, 0.6, 0.6, 0.6, dark);
        label(g, m.label, 0, m.height + 0.12, 0, Math.min(4, m.width));
      } else if (m.kind === "stairs") {
        const steps = Math.ceil(m.height / 0.2);
        for (let i = 0; i < steps; i++)
          box(
            g,
            0,
            (m.height * (i + 0.5)) / steps,
            -m.depth / 2 + ((i + 0.5) * m.depth) / steps,
            m.width,
            (m.height * (i + 1)) / steps,
            m.depth / steps,
            steel,
          );
        for (const x of [-m.width / 2, m.width / 2]) {
          const rail = box(
            g,
            x,
            m.height / 2 + 1,
            0,
            0.06,
            0.06,
            Math.hypot(m.height, m.depth),
            dark,
          );
          rail.rotation.x = -Math.atan2(m.height, m.depth);
        }
      } else if (m.kind === "asrs") {
        box(g, 0, m.height / 2, 0, m.width, m.height, m.depth, blue);
        for (let y = 0.5; y < m.height; y += 1)
          for (let z = -m.depth / 2 + 0.5; z < m.depth / 2; z += 1)
            box(g, m.width / 2 + 0.015, y, z, 0.03, 0.65, 0.75, cardboard);
        label(g, "AS/RS", 0, m.height + 0.03, 0, 4);
      } else if (m.kind === "robot-arm") {
        box(g, 0, 0.3, 0, 1, 0.6, 1, dark);
        box(g, 0, 1, 0, 0.3, 1, 0.3, color);
        const arm = box(g, 0.4, 1.65, 0, 1, 0.25, 0.25, color);
        box(g, 0.9, 1.35, 0, 0.18, 0.6, 0.18, steel);
        operators.push({ arm, phase: m.number });
        for (const x of [-m.width / 2, m.width / 2])
          box(g, x, 0.5, 0, 0.04, 1, m.depth, beam);
      } else if (
        mobileRobots.includes(m.kind as (typeof mobileRobots)[number])
      ) {
        g.userData.animated = true;
        box(g, 0, m.height / 2, 0, m.width, m.height, m.depth, color);
        box(
          g,
          0,
          m.height + 0.04,
          0,
          m.width * 0.7,
          0.08,
          m.depth * 0.65,
          dark,
        );
        for (const x of [-m.width / 2, m.width / 2])
          for (const z of [-m.depth / 3, m.depth / 3])
            box(g, x, 0.12, z, 0.1, 0.24, 0.24, dark);
        box(g, 0, m.height + 0.1, m.depth / 3, 0.2, 0.12, 0.15, teal);
        mobile.push({ object: g, module: m, floorIndex: fi });
        if (m.route.length > 1) {
          const geo = new T.BufferGeometry().setFromPoints(
            m.route.map((p) => new T.Vector3(p.x, elevation + 0.04, p.z)),
          );
          geometries.add(geo);
          const mat = new T.LineBasicMaterial({ color: "#329db1" });
          materials.add(mat);
          group.add(new T.Line(geo, mat));
        }
      } else if (["packing", "quality", "machine"].includes(m.kind)) {
        box(g, 0, m.height, 0, m.width, 0.15, m.depth, steel);
        for (const x of [-m.width / 2 + 0.15, m.width / 2 - 0.15])
          for (const z of [-m.depth / 2 + 0.15, m.depth / 2 - 0.15])
            box(g, x, m.height / 2, z, 0.1, m.height, 0.1, dark);
        box(g, m.width * 0.25, m.height + 0.3, 0, 0.5, 0.6, 0.4, dark);
        box(g, -m.width * 0.25, m.height + 0.15, 0, 0.5, 0.3, 0.5, cardboard);

        if (!compact && ["packing", "quality"].includes(m.kind)) {
          const person = new T.Group();
          person.position.set(-m.width * 0.22, 0, m.depth * 0.42);
          g.add(person);
          for (const x of [-0.12, 0.12]) {
            box(person, x, 0.38, 0, 0.16, 0.65, 0.18, dark);
            box(person, x, 0.06, -0.03, 0.18, 0.12, 0.3, dark);
          }
          box(person, 0, 0.94, 0, 0.45, 0.58, 0.25, vest);
          box(person, 0, 1.36, 0, 0.28, 0.3, 0.27, skin);
          box(person, 0, 1.53, 0, 0.31, 0.12, 0.3, yellow);
          for (const x of [-0.28, 0.28])
            rod(
              person,
              new T.Vector3(x, 1.1, 0),
              new T.Vector3(x * 0.6, 0.94, -0.32),
              0.055,
              skin,
            );
          box(person, 0.2, 0.95, -0.33, 0.08, 0.08, 0.15, dark);
        }
      } else if (["staging", "returns", "pallet-buffer"].includes(m.kind)) {
        box(g, 0, 0.01, 0, m.width, 0.015, m.depth, color);
        box(g, 0, 0.12, 0, 1.1, 0.2, 1.2, pallet);
        if (
          designPreview ||
          records.some((r) => r.locationId === loc?.id && r.quantity > 0)
        )
          for (let i = 0; i < 3; i++)
            box(
              g,
              ((i % 2) - 0.5) * 0.45,
              0.5 + Math.floor(i / 2) * 0.45,
              0,
              0.4,
              0.45,
              0.6,
              cardboard,
            );
      } else if (m.kind === "forklift") {
        box(g, 0, 0.45, 0, 1.1, 0.9, 1.8, color);
        for (const x of [-0.5, 0.5])
          box(g, x, 1.7, -0.65, 0.08, 2.4, 0.1, dark);
        box(g, 0, 2.3, 0, 1.2, 0.12, 1.4, dark);
        for (const x of [-0.4, 0.4])
          box(g, x, 0.1, -1.5, 0.12, 0.1, 1.5, steel);
      } else {
        box(g, 0, m.height / 2, 0, m.width, m.height, m.depth, color);
        label(g, m.label, 0, m.height + 0.02, 0, Math.min(3, m.width));
      }
    }
    // Batch static parts per material while retaining selectable module groups and animated robots.
    group.traverse((object) => {
      if (
        !(object instanceof T.Group) ||
        object.userData.animated ||
        !object.userData.moduleId
      )
        return;
      const groups = new Map<T.Material, T.Mesh[]>();
      for (const child of object.children) {
        if (
          child instanceof T.Mesh &&
          !Array.isArray(child.material) &&
          (child.geometry === cube || child.geometry === cylinder) &&
          !operators.some((o) => o.arm === child)
        ) {
          const list = groups.get(child.material) || [];
          list.push(child);
          groups.set(child.material, list);
        }
      }
      object.updateMatrix();
      groups.forEach((meshes, mat) => {
        const parts = meshes.map((mesh) => {
          mesh.updateMatrix();
          return mesh.geometry.clone().applyMatrix4(mesh.matrix);
        });
        const geo = mergeGeometries(parts, false);
        parts.forEach((p) => p.dispose());
        if (!geo) return;
        geometries.add(geo);
        const merged = new T.Mesh(geo, mat);
        merged.castShadow = !compact;
        merged.receiveShadow = true;
        object.add(merged);
        meshes.forEach((mesh) => mesh.removeFromParent());
      });
    });
  });
  const highlightMat = new T.MeshBasicMaterial({
    color: "#20b9ad",
    wireframe: true,
  });
  materials.add(highlightMat);
  const highlight = new T.Mesh(cube, highlightMat);
  root.add(highlight);
  highlight.visible = false;
  const original = new Map<T.Mesh, T.Material | T.Material[]>(),
    ghosts = new Map<T.Material, T.Material>();
  interiorShell.traverse((o) => {
    if (o instanceof T.Mesh) original.set(o, o.material);
  });
  const setShell = (solid: boolean) => {
    original.forEach((mat, mesh) => {
      const ghost = (m: T.Material) => {
        let g = ghosts.get(m);
        if (!g) {
          g = m.clone();
          g.transparent = true;
          g.opacity = 0.14;
          g.depthWrite = false;
          materials.add(g);
          ghosts.set(m, g);
        }
        return g;
      };
      const keepSolid =
        solid ||
        (mesh.position.x < -0.5 &&
          Math.abs(mesh.position.x) > Math.abs(mesh.position.z)) ||
        (mesh.position.z < -0.5 &&
          Math.abs(mesh.position.z) >= Math.abs(mesh.position.x));
      mesh.material = keepSolid
        ? mat
        : Array.isArray(mat)
          ? mat.map(ghost)
          : ghost(mat);
      mesh.castShadow = keepSolid && !compact;
    });
  };
  const setActiveFloor = (id?: string) => {
    const index = design.floors.findIndex((f) => f.id === id);
    floors.forEach((g, i) => (g.visible = index < 0 || i === index));
    roofs.forEach((g, i) => (g.visible = index < 0 || i === index));
    walls.forEach((g, i) => (g.visible = index < 0 || i === index));
    ground.visible = index <= 0;
    binMeshes.forEach(
      (_, mesh) => (mesh.visible = index < 0 || mesh.userData.floorId === id),
    );
  };
  let simulated = false;
  const setAutomation = (
    state?: import("../domain/automation").AutomationState,
  ) => {
    simulated = !!state;
    for (const { object, module: m, floorIndex } of mobile) {
      const robot = state?.robots.find((r) => r.id === m.id);
      object.position.set(
        robot?.x ?? m.x,
        floorElevation(design, floorIndex),
        robot?.z ?? m.z,
      );
      object.rotation.y = robot?.heading ?? (-m.rotation * Math.PI) / 180;
    }
  };
  function animate(elapsed: number) {
    if (simulated || !designPreview) return;
    for (const { object, module: m, floorIndex } of mobile) {
      if (m.route.length < 2 || m.task === "idle") continue;
      const lengths = m.route
          .slice(1)
          .map((p, i) => Math.hypot(p.x - m.route[i].x, p.z - m.route[i].z)),
        total = lengths.reduce((a, b) => a + b, 0);
      if (total < 0.001) continue;
      let distance = m.loop
        ? (elapsed * m.speed) % total
        : Math.min(elapsed * m.speed, total);
      for (let i = 0; i < lengths.length; i++) {
        if (distance <= lengths[i]) {
          const a = m.route[i],
            b = m.route[i + 1],
            t = distance / (lengths[i] || 1);
          object.position.set(
            a.x + (b.x - a.x) * t,
            floorElevation(design, floorIndex),
            a.z + (b.z - a.z) * t,
          );
          object.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
          break;
        }
        distance -= lengths[i];
      }
    }
  }
  return {
    root,
    layout,
    ceiling,
    interiorShell,
    ground,
    highlight,
    binMeshes,
    operators,
    wallHeight: Math.max(
      ...design.floors.map((f, i) => floorElevation(design, i) + f.height),
    ),
    setShell,
    setActiveFloor,
    setAutomation,
    animate,
    dispose: () => {
      root.traverse((o) => {
        if (o instanceof T.Mesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((mat) => {
            if (mat instanceof T.MeshBasicMaterial) mat.map?.dispose();
          });
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      root.clear();
    },
  };
}
