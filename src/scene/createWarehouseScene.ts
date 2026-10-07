import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildWarehouseWorld } from "./buildWarehouseWorld";
import {
  findWalkPath,
  isWalkable,
  nearestWalkable,
} from "../domain/navigation";
import { zones } from "../domain/warehouse";
import { floorElevation, localPoint } from "../domain/design";
import type { WarehouseConfig, OperationalRecord } from "../domain/warehouse";
import type { Point2 } from "../domain/navigation";
import type { AutomationState } from "../domain/automation";
export type ViewMode = "orbit" | "plan" | "walk";
type Options = {
  config: WarehouseConfig;
  records: OperationalRecord[];
  compact: boolean;
  quality?: "auto" | "studio" | "efficient";
  designPreview: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onError: () => void;
  onExitWalk: () => void;
};
export function createWarehouseScene(host: HTMLElement, options: Options) {
  const { config: c, compact, quality = "auto" } = options;
  let needsDraw = true, activeUntil = 0;
  const wake = () => { needsDraw = true; activeUntil = performance.now() + 1800; };
  const world = buildWarehouseWorld(options),
    scene = new T.Scene();
  scene.add(world.root);
  scene.background = new T.Color("#e9eff5");
  scene.fog = new T.Fog(
    "#e9eff5",
    Math.max(c.width, c.depth) * 2,
    Math.max(c.width, c.depth) * 5,
  );
  let renderer: T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (error) {
    world.dispose();
    throw error;
  }
  const studio = quality === "studio";
  const efficient = quality === "efficient" || (quality === "auto" && world.layout.racks.length >= 160);
  renderer.setPixelRatio(Math.min(devicePixelRatio, compact || efficient ? 1 : studio ? 2 : 1.4));
  renderer.shadowMap.enabled = !compact && !efficient;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  host.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.035);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  room.dispose();
  pmrem.dispose();
  scene.add(new T.HemisphereLight("#eef7ff", "#8196ac", 0.8));
  const sun = new T.DirectionalLight("#fff5e3", 2.1);
  sun.position.set(
    -c.width * 0.45,
    Math.max(50, world.wallHeight + Math.max(c.width, c.depth)),
    c.depth * 0.45,
  );
  sun.castShadow = !compact;
  sun.shadow.mapSize.set(studio ? 3072 : 2048, studio ? 3072 : 2048);
  const extent = Math.max(c.width, c.depth) * 0.7;
  Object.assign(sun.shadow.camera, {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
    near: 1,
    far: Math.max(160, Math.max(c.width, c.depth) * 5 + world.wallHeight * 2),
  });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  const fill = new T.DirectionalLight("#8ebefa", 0.65);
  fill.position.set(25, 18, -25);
  scene.add(fill);
  for (const area of ["staging", "storage", "packing"] as const) {
    const [x, z] = world.layout.centers[area];
    const light = new T.PointLight("#eef6ff", 30, 22, 2);
    light.position.set(x, world.wallHeight - 1, z);
    scene.add(light);
  }
  const size = Math.max(c.width, c.depth, world.wallHeight),
    camera = new T.PerspectiveCamera(42, 1, 0.1, Math.max(600, size * 10));
  camera.position.set(size * 0.77, size * 0.68, size * 0.78);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.minDistance = 2;
  controls.maxDistance = size * 2.3;
  controls.enabled = !compact;
  controls.addEventListener("change", wake);
  const composer = compact || efficient ? null : new EffectComposer(renderer);
  let ao: SSAOPass | null = null;
  if (composer) {
    composer.addPass(new RenderPass(scene, camera));
    ao = new SSAOPass(scene, camera, 1, 1);
    ao.kernelRadius = 1.2;
    ao.minDistance = 0.002;
    ao.maxDistance = 0.08;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
  }
  const locations = new Map(world.layout.locations.map((l) => [l.id, l]));
  const ray = new T.Raycaster(),
    pointer = new T.Vector2(),
    keys = new Set<string>();
  let mode: ViewMode = "orbit",
    walkElevation = 0,
    navigationConfig = c,
    exterior = false,
    yaw = 0,
    pitch = 0,
    walkPath: Point2[] = [],
    arrivalLook: Point2 | null = null,
    lastHover = "";
  let flight: {
    from: T.Vector3;
    to: T.Vector3;
    lookFrom: T.Vector3;
    lookTo: T.Vector3;
    elapsed: number;
    duration: number;
  } | null = null;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const routeMat = new T.LineBasicMaterial({
    color: "#2f99db",
    transparent: true,
    opacity: 0.7,
  });
  let routeGeo = new T.BufferGeometry(),
    routeLine = new T.Line(routeGeo, routeMat);
  routeLine.position.y = 0.05;
  scene.add(routeLine);
  routeLine.visible = false;
  function routeTo(point: Point2, look?: Point2) {
    walkPath = findWalkPath(
      camera.position,
      point,
      navigationConfig,
      world.layout,
    );
    arrivalLook = look || null;
    routeGeo.dispose();
    routeGeo = new T.BufferGeometry().setFromPoints([
      camera.position,
      ...walkPath.map((p) => new T.Vector3(p.x, walkElevation + 0.05, p.z)),
    ]);
    routeLine.geometry = routeGeo;
    routeLine.visible = walkPath.length > 0;
  }
  function setKey(key: string, pressed: boolean) {
    wake();
    if (pressed) {
      keys.add(key);
      walkPath = [];
      routeLine.visible = false;
    } else keys.delete(key);
  }
  function focus(id?: string, nextMode: ViewMode = "orbit", floorId?: string) {
    wake();
    const previous = mode;
    mode = nextMode;
    controls.enabled = mode !== "walk" && !compact;
    keys.clear();
    world.ceiling.visible = mode === "walk" || exterior;
    world.setShell(mode === "walk" || exterior);
    renderer.shadowMap.needsUpdate = true;
    routeLine.visible = false;
    const candidate = id ? locations.get(id) : undefined;
    const location =
        floorId && candidate?.floorId !== floorId ? undefined : candidate,
      zone = zones.find((z) => z.id === id);
    const floorIndex = c.design
      ? Math.max(
          0,
          c.design.floors.findIndex(
            (f) => f.id === (location?.floorId || floorId),
          ),
        )
      : 0;
    const activeFloor = c.design?.floors[floorIndex];
    const previousElevation = walkElevation;
    walkElevation = c.design ? floorElevation(c.design, floorIndex) : 0;
    navigationConfig =
      c.design && activeFloor
        ? { ...c, design: { ...c.design, floors: [activeFloor] } }
        : c;
    world.setActiveFloor(
      location?.floorId ||
        floorId ||
        (mode === "walk" ? activeFloor?.id : undefined),
    );
    const center = zone ? world.layout.centers[zone.id] : [0, 0];
    const point = new T.Vector3(
      location?.x ?? center[0],
      location?.y ??
        (floorId
          ? walkElevation
          : (c.design?.floors.length || 0) > 1
            ? world.wallHeight / 2
            : 0),
      location?.z ?? center[1],
    );
    world.highlight.visible = !!location;
    if (location) {
      const module = c.design?.floors
        .flatMap((f) => f.modules)
        .find((m) => m.id === location.moduleId);
      world.highlight.rotation.y = (-(module?.rotation || 0) * Math.PI) / 180;
      world.highlight.position.set(location.x, location.y + 0.28, location.z);
      world.highlight.scale.set(
        location.zone === "storage" ? 1.03 : 2,
        location.zone === "storage" ? 0.85 : 1.8,
        location.zone === "storage" ? (2 / (module?.bins || c.bins)) * 0.9 : 2,
      );
    }
    if (mode === "walk") {
      flight = null;
      if (previous !== "walk" || previousElevation !== walkElevation) {
        const entry = nearestWalkable(
          { x: world.layout.centers.inbound[0], z: -c.depth / 2 + 3.3 },
          navigationConfig,
          world.layout,
        );
        camera.position.set(entry.x, walkElevation + 1.72, entry.z);
        yaw = Math.PI;
        pitch = 0;
        camera.rotation.order = "YXZ";
      }
      let destination = { x: point.x, z: point.z };
      if (c.design && location) {
        const module = activeFloor?.modules.find(
          (m) => m.id === location.moduleId,
        );
        destination =
          module?.kind === "aisle"
            ? localPoint(module, 0, 0)
            : { x: location.x + 2, z: location.z };
      } else if (location?.zone === "storage") {
        const left = world.layout.racks.find(
          (r) => r.aisle === location.aisle && r.side === "L",
        )!;
        destination = { x: left.x + c.aisleWidth / 2 + 0.6, z: location.z };
      } else if (!c.design && zone?.id === "storage") {
        const left = world.layout.racks[0];
        destination = {
          x: left.x + c.aisleWidth / 2 + 0.6,
          z: left.z - left.length / 2 - 1.2,
        };
      } else if (location?.zone === "packing" || zone?.id === "packing") {
        if (c.template === "l-flow") destination.x -= 2.4;
        else destination.z -= 2.4;
      } else if (location?.zone === "inbound" || location?.zone === "outbound")
        destination.z +=
          c.template === "through" && location.zone === "outbound" ? -2.5 : 2.5;
      if (id)
        routeTo(nearestWalkable(destination, navigationConfig, world.layout), {
          x: point.x,
          z: point.z,
        });
      else {
        walkPath = [];
        routeLine.visible = false;
      }
      return;
    }
    walkPath = [];
    pitch = 0;
    let distance = id ? Math.min(20, size * 0.4) : size * 0.85;
    let to =
      mode === "plan"
        ? new T.Vector3(point.x + 0.01, distance * 1.65, point.z + 0.01)
        : new T.Vector3(
            point.x + distance * 0.75,
            point.y + distance * 0.7,
            point.z + distance * 0.8,
          );
    if (!c.design && location?.zone === "storage" && mode === "orbit") {
      const left = world.layout.racks.find(
        (r) => r.aisle === location.aisle && r.side === "L",
      )!;
      to = new T.Vector3(
        left.x + c.aisleWidth / 2 + 0.6,
        location.y + 1.6,
        location.z + 2.5,
      );
    } else if (
      (zone?.id === "inbound" || location?.zone === "inbound") &&
      mode === "orbit"
    )
      to = new T.Vector3(point.x + 10, 12, point.z - 13);
    point.y += location?.zone === "storage" ? 0.25 : 0.4;
    if (reduced) {
      camera.position.copy(to);
      controls.target.copy(point);
      controls.update();
      flight = null;
    } else
      flight = {
        from: camera.position.clone(),
        to,
        lookFrom: controls.target.clone(),
        lookTo: point,
        elapsed: 0,
        duration: location?.zone === "storage" ? 1.4 : 1.1,
      };
  }
  function hitAt(e: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObject(world.root, true).find((intersection) => {
      if (intersection.object === world.highlight) return false;
      if (intersection.object instanceof T.Mesh) {
        const mats = Array.isArray(intersection.object.material)
          ? intersection.object.material
          : [intersection.object.material];
        if (mats.every((m) => m.transparent && m.opacity < 0.3)) return false;
      }
      let object: T.Object3D | null = intersection.object;
      while (object) {
        if (!object.visible) return false;
        object = object.parent;
      }
      return true;
    });
    if (!hit) return null;
    const locs = world.binMeshes.get(hit.object as T.InstancedMesh);
    let id =
      locs && hit.instanceId !== undefined
        ? locs[hit.instanceId].id
        : hit.instanceId !== undefined
          ? hit.object.userData.instanceIds?.[hit.instanceId]
          : hit.object.userData.locationId;
    let ancestor: T.Object3D | null = hit.object;
    while (!id && ancestor) {
      id =
        ancestor.userData.locationId ||
        (ancestor.userData.moduleId
          ? "module:" + ancestor.userData.moduleId
          : undefined);
      ancestor = ancestor.parent;
    }
    return {
      id: id as string | undefined,
      point: hit.point,
      ground:
        hit.object === world.ground || hit.object.userData.walkSurface === true,
    };
  }
  let lastHoverTime = 0;
  let down: { x: number; y: number; lastX: number; lastY: number } | null =
      null,
    moved = false;
  function pointerDown(e: PointerEvent) {
    wake();
    renderer.domElement.focus({ preventScroll: true });
    down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
    moved = false;
  }
  function pointerMove(e: PointerEvent) {
    if (down) {
      wake();
      const dx = e.clientX - down.lastX,
        dy = e.clientY - down.lastY;
      down.lastX = e.clientX;
      down.lastY = e.clientY;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) moved = true;
      if (mode === "walk" && moved) {
        walkPath = [];
        routeLine.visible = false;
        yaw -= dx * 0.0035;
        pitch = T.MathUtils.clamp(pitch - dy * 0.0035, -1.1, 1.1);
      }
      if (mode !== "walk" && moved) flight = null;
    } else if (!compact) {
      const now = performance.now();
      if (now - lastHoverTime < 70) return;
      lastHoverTime = now;
      const hit = hitAt(e),
        id = hit?.id || "";
      if (id !== lastHover) {
        lastHover = id;
        options.onHover(id);
      }
      renderer.domElement.style.cursor = id
        ? "pointer"
        : mode === "walk"
          ? "crosshair"
          : "grab";
    }
  }
  function pointerUp(e: PointerEvent) {
    if (!down) return;
    down = null;
    if (moved) return;
    const hit = hitAt(e);
    if (hit?.id) options.onSelect(hit.id);
    else if (mode === "walk" && hit?.ground)
      routeTo({ x: hit.point.x, z: hit.point.z });
  }
  function keydown(e: KeyboardEvent) {
    if (
      (e.target as HTMLElement).closest('input,select,textarea,[role="dialog"]')
    )
      return;
    if (
      mode === "walk" &&
      [
        "w",
        "a",
        "s",
        "d",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Shift",
      ].includes(e.key)
    ) {
      e.preventDefault();
      setKey(e.key, true);
    }
    if (mode === "walk" && e.key === "Escape") options.onExitWalk();
  }
  const keyup = (e: KeyboardEvent) => setKey(e.key, false),
    blur = () => {
      keys.clear();
      down = null;
    };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  renderer.domElement.addEventListener("pointerleave", () => {
    down = null;
    options.onHover("");
  });
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  const lost = (e: Event) => {
    e.preventDefault();
    options.onError();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  function draw() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    composer?.setSize(w, h);
    ao?.setSize(Math.ceil(w * 0.5), Math.ceil(h * 0.5));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    needsDraw = true;
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  let visible = true;
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) keys.clear();
  });
  visibilityObserver.observe(host);
  resize();
  const drawnPosition = new T.Vector3(Infinity, Infinity, Infinity), drawnRotation = new T.Quaternion();
  let frame = 0,
    last = performance.now(),
    elapsed = 0;
  function animate(now: number) {
    if (!compact && (!visible || document.hidden)) {
      last = now;
      frame = requestAnimationFrame(animate);
      return;
    }
    if (!compact && now - last < 1000 / 30) {
      frame = requestAnimationFrame(animate);
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.04);
    last = now;
    if (now < activeUntil) elapsed += dt;
    if (mode === "walk") {
      if (walkPath.length) {
        const goal = walkPath[0],
          dx = goal.x - camera.position.x,
          dz = goal.z - camera.position.z,
          distance = Math.hypot(dx, dz),
          amount = Math.min(distance, dt * 3.2);
        const next = {
          x: camera.position.x + (dx / (distance || 1)) * amount,
          z: camera.position.z + (dz / (distance || 1)) * amount,
        };
        if (isWalkable(next, navigationConfig, world.layout)) {
          camera.position.x = next.x;
          camera.position.z = next.z;
        } else {
          walkPath = [];
          routeLine.visible = false;
        }
        const desired = Math.atan2(-dx, -dz),
          delta = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
        yaw += delta * (1 - Math.exp(-dt * 5));
        if (distance < 0.08) walkPath.shift();
        if (!walkPath.length) {
          routeLine.visible = false;
          if (arrivalLook) {
            const lookYaw = Math.atan2(
              camera.position.x - arrivalLook.x,
              camera.position.z - arrivalLook.z,
            );
            yaw = lookYaw;
            arrivalLook = null;
          }
        }
      } else if (keys.size) {
        const forward =
            Number(keys.has("w") || keys.has("ArrowUp")) -
            Number(keys.has("s") || keys.has("ArrowDown")),
          side =
            Number(keys.has("d") || keys.has("ArrowRight")) -
            Number(keys.has("a") || keys.has("ArrowLeft"));
        const speed = dt * (keys.has("Shift") ? 5.5 : 3.2),
          norm = Math.max(1, Math.hypot(forward, side));
        const dx =
            ((-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed) / norm,
          dz =
            ((-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed) / norm;
        if (
          isWalkable(
            { x: camera.position.x + dx, z: camera.position.z },
            navigationConfig,
            world.layout,
          )
        )
          camera.position.x += dx;
        if (
          isWalkable(
            { x: camera.position.x, z: camera.position.z + dz },
            navigationConfig,
            world.layout,
          )
        )
          camera.position.z += dz;
      }
      camera.position.y = walkElevation + 1.72;
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);
    } else {
      if (flight) {
        flight.elapsed += dt;
        const t = Math.min(1, flight.elapsed / flight.duration),
          smooth = t * t * (3 - 2 * t);
        camera.position.lerpVectors(flight.from, flight.to, smooth);
        camera.position.y +=
          Math.sin(t * Math.PI) *
          Math.max(
            0,
            world.wallHeight + 3 - Math.min(flight.from.y, flight.to.y),
          );
        controls.target.lerpVectors(flight.lookFrom, flight.lookTo, smooth);
        if (t === 1) flight = null;
      }
      controls.update();
    }
    const playing = !reduced && now < activeUntil;
    if (playing) world.animate(elapsed);
    if (playing)
      world.operators.forEach(({ arm, phase }) => {
        arm.rotation.x = Math.sin(elapsed * 1.3 + phase) * 0.04;
      });
    const changed = !camera.position.equals(drawnPosition) || !camera.quaternion.equals(drawnRotation);
    if (!document.hidden && (needsDraw || changed || playing || walkPath.length || flight)) {
      draw(); needsDraw = false;
      drawnPosition.copy(camera.position); drawnRotation.copy(camera.quaternion);
    }
    if (!compact) frame = requestAnimationFrame(animate);
  }
  focus(undefined, "orbit");
  frame = requestAnimationFrame(animate);
  return {
    focus,
    setAutomation: (state?: AutomationState) => {
      wake();
      world.setAutomation(state);
      renderer.shadowMap.needsUpdate = true;
    },
    setKey,
    setExterior: (value: boolean) => {
      wake();
      exterior = value;
      world.ceiling.visible = mode === "walk" || exterior;
      world.setShell(mode === "walk" || exterior);
      renderer.shadowMap.needsUpdate = true;
    },
    exportModel: async () => {
      const { GLTFExporter } =
        await import("three/addons/exporters/GLTFExporter.js");
      const proxies: T.Object3D[] = [];
      world.root.traverse((o) => {
        if (o instanceof T.Mesh && !Array.isArray(o.material) && !o.material.colorWrite) {
          if (o.visible) proxies.push(o);
          o.visible = false;
        }
      });
      const previous = world.highlight.visible;
      world.highlight.visible = false;
      const roof = world.ceiling.visible,
        shell = world.interiorShell.visible;
      world.ceiling.visible = true;
      world.setShell(true);
      try {
        const result = await new GLTFExporter().parseAsync(world.root, {
          binary: true,
          onlyVisible: true,
        });
        return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
      } finally {
        proxies.forEach((o) => { o.visible = true; });
        world.highlight.visible = previous;
        world.ceiling.visible = roof;
        world.interiorShell.visible = shell;
        world.setShell(mode === "walk" || exterior);
      }
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
      controls.dispose();
      ao?.dispose();
      composer?.dispose();
      routeGeo.dispose();
      routeMat.dispose();
      environment.dispose();
      world.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
