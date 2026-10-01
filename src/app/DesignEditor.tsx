import type { DraftInput } from "../domain/drafts";
import { useNavigate } from "react-router-dom";
import { lazy, Suspense, useMemo, useRef, useState, useEffect } from "react";
import type { PointerEvent, DragEvent } from "react";
import type { ViewMode } from "../scene/createWarehouseScene";
import {
  configSchema,
  generateLayout,
  templates,
  zones,
  validateRecordSet,
} from "../domain/warehouse";
import type { WarehouseConfig, OperationalRecord } from "../domain/warehouse";
import {
  createModule,
  designFromLayout,
  equipmentCatalog,
  floorElevation,
  moduleSize,
  outlineTemplate,
  polygonArea,
  populateArea,
  distributeModules,
  mobileRobots,
} from "../domain/design";
import type {
  Design,
  DesignFloor,
  DesignModule,
  DesignPoint,
  EquipmentKind,
} from "../domain/design";
import { Icon } from "./ui";
const Scene = lazy(() => import("../scene/WarehouseScene"));
type Tool = "select" | "outline" | "area" | "route";
type Gesture =
  | { kind: "move"; start: DesignPoint; original: Design; ids: string[] }
  | { kind: "area"; start: DesignPoint }
  | { kind: "vertex"; index: number; original: Design };
export function DesignEditor({
  config,
  onApply,
  onClose,
  records = [],
  onSaveDraft,
  draftStatus,
  draftContext,
}: {
  config: WarehouseConfig;
  onApply: (config: WarehouseConfig) => void;
  onClose: (config?: WarehouseConfig) => void;
  records?: OperationalRecord[];
  onSaveDraft?: (
    config: WarehouseConfig,
    context: DraftInput["context"],
  ) => Promise<unknown>;
  draftStatus?: string;
  draftContext?: DraftInput["context"];
}) {
  const navigate = useNavigate();
  const initial = useMemo(
    () => config.design || designFromLayout(config, generateLayout(config)),
    [config],
  );
  const [design, setDesign] = useState<Design>(initial),
    [history, setHistory] = useState<Design[]>([initial]),
    [cursor, setCursor] = useState(0);
  const [floorId, setFloorId] = useState(
      draftContext?.floorId || initial.floors[0].id,
    ),
    [selected, setSelected] = useState<string[]>([]),
    [tool, setTool] = useState<Tool>(
      draftContext?.outlinePoints?.length ? "outline" : "select",
    ),
    [armed, setArmed] = useState<EquipmentKind>(),
    [points, setPoints] = useState<DesignPoint[]>(
      draftContext?.outlinePoints || [],
    ),
    [rectangle, setRectangle] = useState<{ a: DesignPoint; b: DesignPoint }>(),
    [preview, setPreview] = useState(false),
    [zoom, setZoom] = useState(1),
    [showGrid, setShowGrid] = useState(true),
    [message, setMessage] = useState("");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewMode, setPreviewMode] = useState<ViewMode>("orbit");
  const [siteWidth, setSiteWidth] = useState(config.width),
    [siteDepth, setSiteDepth] = useState(config.depth);
  const [name, setName] = useState(config.name),
    [site, setSite] = useState(config.site),
    [search, setSearch] = useState("");
  const svg = useRef<SVGSVGElement>(null),
    gesture = useRef<Gesture | null>(null);
  const floor = design.floors.find((f) => f.id === floorId) || design.floors[0],
    floorIndex = design.floors.indexOf(floor),
    module = floor.modules.find((m) => m.id === selected[0]);
  const currentConfig = useMemo(
    () => ({
      ...config,
      name,
      site,
      width: siteWidth,
      depth: siteDepth,
      design,
    }),
    [config, name, site, siteWidth, siteDepth, design],
  );

  const draftData = useMemo(
    () => ({ mode: "studio" as const, floorId, outlinePoints: points }),
    [floorId, points],
  );
  const [savedSignature, setSavedSignature] = useState("");
  const signature = JSON.stringify({
    config: currentConfig,
    context: draftData,
  });
  const dirty =
    history.length > 1 ||
    name !== config.name ||
    site !== config.site ||
    siteWidth !== config.width ||
    siteDepth !== config.depth ||
    points.length > 0;
  useEffect(() => {
    if (!onSaveDraft || !dirty) return;
    if (signature === savedSignature) return;
    const timer = setTimeout(() => {
      void onSaveDraft(currentConfig, draftData)
        .then(() => {
          setSavedSignature(signature);
        })
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentConfig, draftData, onSaveDraft, dirty, signature, savedSignature]);
  const unsaved = dirty && signature !== savedSignature;
  useEffect(() => {
    if (!unsaved) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !link ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        link.target ||
        link.origin !== location.origin ||
        !link.pathname.startsWith("/app")
      )
        return;
      if (!onSaveDraft) return;
      event.preventDefault();
      event.stopPropagation();
      void onSaveDraft(currentConfig, draftData)
        .then(() => {
          setSavedSignature(signature);
          navigate(link.pathname + link.search + link.hash);
        })
        .catch(() =>
          setMessage(
            "Your draft could not be saved. Stay here and retry Save draft before leaving.",
          ),
        );
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", leave, true);
    };
  }, [unsaved, currentConfig, draftData, onSaveDraft, signature, navigate]);
  const layout = useMemo(() => generateLayout(currentConfig), [currentConfig]);
  const recordIssue = useMemo(
    () => (records.length ? validateRecordSet(records, currentConfig) : null),
    [records, currentConfig],
  );
  const parsed = configSchema.safeParse(currentConfig);
  const schemaIssues = parsed.success
    ? []
    : parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`);
  const problems = [
    ...new Set([
      ...layout.errors,
      ...schemaIssues,
      ...(recordIssue ? [recordIssue] : []),
    ]),
  ];
  const width = siteWidth + 16,
    depth = siteDepth + 16;
  const commit = (next: Design) => {
    const states = [...history.slice(0, cursor + 1), next].slice(-50);
    setHistory(states);
    setCursor(states.length - 1);
    setDesign(next);
    setMessage("");
  };
  const changeFloor = (next: DesignFloor) =>
    commit({
      ...design,
      floors: design.floors.map((f) => (f.id === floor.id ? next : f)),
    });
  const updateModule = (patch: Partial<DesignModule>) => {
    if (!module) return;
    changeFloor({
      ...floor,
      modules: floor.modules.map((m) =>
        m.id === module.id ? {
          ...m, ...patch,
          route: patch.route || m.route.map((p) => ({ x: p.x + ((patch.x ?? m.x) - m.x), z: p.z + ((patch.z ?? m.z) - m.z) })),
        } : m,
      ),
    });
  };
  const snap = (n: number) => Math.round(n / design.grid) * design.grid;
  const point = (event: { clientX: number; clientY: number }) => {
    const p = svg.current!.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    const result = p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: snap(result.x), z: snap(result.y) };
  };
  function add(kind: EquipmentKind, p: DesignPoint) {
    const next = createModule(
      kind,
      crypto.randomUUID(),
      Math.max(
        0,
        ...floor.modules.filter((m) => m.kind === kind).map((m) => m.number),
      ) + 1,
      p.x,
      p.z,
    );
    if (kind === "aisle") {
      next.bays = config.bays;
      next.levels = config.levels;
      next.bins = config.bins;
      next.aisleWidth = config.aisleWidth;
    }
    changeFloor({ ...floor, modules: [...floor.modules, next] });
    setSelected([next.id]);
    setArmed(undefined);
    setTool("select");
  }
  function pointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const p = point(e),
      target = e.target as Element,
      id = target.closest("[data-module]")?.getAttribute("data-module"),
      vertex = target.getAttribute("data-vertex");
    if (armed) {
      add(armed, p);
      return;
    }
    if (tool === "outline") {
      setPoints([...points, p]);
      return;
    }
    if (tool === "route") {
      if (module && mobileRobots.includes(module.kind as EquipmentKind))
        updateModule({
          route: module.route.length
            ? [...module.route, p]
            : [{ x: module.x, z: module.z }, p],
        });
      else setMessage("Select a mobile robot before drawing a route.");
      return;
    }
    svg.current!.setPointerCapture(e.pointerId);
    if (vertex !== null) {
      gesture.current = {
        kind: "vertex",
        index: Number(vertex),
        original: design,
      };
      return;
    }
    if (tool === "area") {
      gesture.current = { kind: "area", start: p };
      setRectangle({ a: p, b: p });
      return;
    }
    if (id) {
      const ids = e.shiftKey
        ? [...new Set([...selected, id])]
        : selected.includes(id)
          ? selected
          : [id];
      setSelected(ids);
      gesture.current = { kind: "move", start: p, original: design, ids };
    } else setSelected([]);
  }
  function pointerMove(e: PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.kind === "area") {
      setRectangle({ a: g.start, b: p });
      return;
    }
    const next = {
      ...g.original,
      floors: g.original.floors.map((f) =>
        f.id !== floor.id
          ? f
          : g.kind === "vertex"
            ? {
                ...f,
                outline: f.outline.map((v, i) => (i === g.index ? p : v)),
              }
            : {
                ...f,
                modules: f.modules.map((m) =>
                  g.ids.includes(m.id)
                    ? {
                        ...m,
                        x: snap(m.x + p.x - g.start.x),
                        z: snap(m.z + p.z - g.start.z),
                        route: m.route.map((v) => ({
                          x: snap(v.x + p.x - g.start.x),
                          z: snap(v.z + p.z - g.start.z),
                        })),
                      }
                    : m,
                ),
              },
      ),
    };
    setDesign(next);
  }
  function pointerUp(e: PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    svg.current?.releasePointerCapture(e.pointerId);
    if (g.kind === "area" && rectangle) {
      const { a, b } = rectangle,
        w = Math.abs(a.x - b.x),
        d = Math.abs(a.z - b.z);
      if (w >= 1 && d >= 1) {
        const area = {
          ...createModule(
            "area",
            crypto.randomUUID(),
            Math.max(
              0,
              ...floor.modules
                .filter((m) => m.kind === "area")
                .map((m) => m.number),
            ) + 1,
          ),
          x: (a.x + b.x) / 2,
          z: (a.z + b.z) / 2,
          width: w,
          depth: d,
        };
        changeFloor({ ...floor, modules: [...floor.modules, area] });
        setSelected([area.id]);
      }
      setRectangle(undefined);
      setTool("select");
    } else if (g.kind !== "area") commit(design);
  }
  function undo(direction: number) {
    const next = cursor + direction;
    if (next < 0 || next >= history.length) return;
    setCursor(next);
    setDesign(history[next]);
    setSelected([]);
  }
  function removeSelected() {
    changeFloor({
      ...floor,
      modules: floor.modules.filter((m) => !selected.includes(m.id)),
    });
    setSelected([]);
  }
  function addFloor() {
    if (design.floors.length >= 4) return;
    const id = "floor-" + crypto.randomUUID().slice(0, 8);
    commit({
      ...design,
      floors: [
        ...design.floors,
        {
          id,
          name: `Floor ${design.floors.length + 1}`,
          height: 6,
          outline: floor.outline.map((p) => ({ ...p })),
          modules: [],
        },
      ],
    });
    setFloorId(id);
    setSelected([]);
  }
  function fillArea() {
    if (module?.kind !== "area") return;
    if (
      !module.zone ||
      !["storage", "packing", "staging"].includes(module.zone)
    ) {
      setMessage(
        "Auto-fill supports storage, staging and packing areas. Place perimeter docks individually.",
      );
      return;
    }
    const kind =
      module.zone === "storage"
        ? "aisle"
        : module.zone === "packing"
          ? "packing"
          : "staging";
    const prototype = createModule(kind, "prototype", 1);
    prototype.bays = config.bays;
    prototype.levels = config.levels;
    prototype.bins = config.bins;
    prototype.aisleWidth = config.aisleWidth;
    try {
      changeFloor(
        populateArea(floor, module, kind, prototype, () => crypto.randomUUID()),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Cannot populate this area.");
    }
  }
  const selectFloor = (id: string) => {
    setFloorId(id);
    setSelected([]);
    setPoints([]);
    setTool("select");
  };
  const groups = [...new Set(equipmentCatalog.map((e) => e.group))];
  const input = (
    label: string,
    key:
      | "x"
      | "z"
      | "width"
      | "depth"
      | "height"
      | "number"
      | "bays"
      | "levels"
      | "bins"
      | "aisleWidth"
      | "speed"
      | "binCapacity",
    min: number,
    max: number,
    step = 0.5,
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        value={module?.[key] ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max)
            updateModule({ [key]: n });
        }}
      />
    </label>
  );
  return (
    <div className="design-studio">
      <header className="design-header">
        <div>
          <span className="eyebrow">WAREHOUSE DESIGN STUDIO</span>
          <h1>Build your floor. Your way.</h1>
          <p>A measured 2D design, translated into the same 3D space.</p>
        </div>
        <div className="actions">
          {onSaveDraft && (
            <button
              className="button secondary small"
              onClick={() => {
                void onSaveDraft(currentConfig, draftData)
                  .then(() => setSavedSignature(signature))
                  .catch(() => undefined);
              }}
            >
              Save draft
            </button>
          )}
          <button
            className="button secondary small"
            onClick={() => {
              if (onSaveDraft)
                void onSaveDraft(currentConfig, draftData)
                  .then(() => onClose(currentConfig))
                  .catch(() => undefined);
              else onClose(currentConfig);
            }}
          >
            Back to builder
          </button>
          <button
            className="button small"
            disabled={problems.length > 0 || name.trim().length < 2}
            onClick={() => {
              if (onSaveDraft)
                void onSaveDraft(currentConfig, draftData)
                  .then(() => onApply(currentConfig))
                  .catch(() => undefined);
              else onApply(currentConfig);
            }}
          >
            Use this design <Icon name="arrow" />
          </button>
        </div>
      </header>
      {draftStatus && (
        <p className="design-draft-status" role="status">
          {unsaved ? "Changes awaiting save · " : ""}
          {draftStatus} · Drafts can contain unresolved layout issues. Resume
          them from your dashboard.
        </p>
      )}
      <div className="design-metadata">
        <label>
          Warehouse name
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Site
          <input
            value={site}
            maxLength={120}
            onChange={(e) => setSite(e.target.value)}
          />
        </label>
        <label>
          Site width (m)
          <input
            type="number"
            min={24}
            max={140}
            value={siteWidth}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 24 && n <= 140) setSiteWidth(n);
            }}
          />
        </label>
        <label>
          Site depth (m)
          <input
            type="number"
            min={24}
            max={140}
            value={siteDepth}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 24 && n <= 140) setSiteDepth(n);
            }}
          />
        </label>
        <div>
          <strong>{layout.capacity.toLocaleString()}</strong>
          <span>addressable bins</span>
        </div>
        <div>
          <strong>
            {design.floors
              .reduce((a, f) => a + polygonArea(f.outline), 0)
              .toFixed(0)}{" "}
            m²
          </strong>
          <span>total floor area</span>
        </div>
      </div>
      <div className="design-floor-tabs" aria-label="Building floors">
        {design.floors.map((f, i) => (
          <button
            key={f.id}
            aria-pressed={floor.id === f.id}
            onClick={() => selectFloor(f.id)}
          >
            {f.name}
            <small>+{floorElevation(design, i).toFixed(1)} m</small>
          </button>
        ))}
        <button onClick={addFloor} disabled={design.floors.length >= 4}>
          ＋ Add floor
        </button>
      </div>
      <div className="design-toolbar">
        <div className="segmented">
          <button aria-pressed={!preview} onClick={() => setPreview(false)}>
            2D editor
          </button>
          <button aria-pressed={preview} onClick={() => setPreview(true)}>
            3D preview
          </button>
        </div>
        {preview && (
          <div className="segmented">
            {(["orbit", "plan", "walk"] as ViewMode[]).map((view) => (
              <button
                key={view}
                aria-pressed={previewMode === view}
                onClick={() => setPreviewMode(view)}
              >
                {view === "plan"
                  ? "Top view"
                  : view === "walk"
                    ? "Walk through"
                    : "Orbit"}
              </button>
            ))}
          </div>
        )}
        {!preview && (
          <>
            <button
              aria-pressed={tool === "select"}
              onClick={() => {
                setTool("select");
                setArmed(undefined);
              }}
            >
              Select / move
            </button>
            <button
              aria-pressed={tool === "outline"}
              onClick={() => {
                setTool("outline");
                setPoints([]);
                setArmed(undefined);
              }}
            >
              Draw floor outline
            </button>
            <button
              aria-pressed={tool === "area"}
              onClick={() => {
                setTool("area");
                setArmed(undefined);
              }}
            >
              Draw area
            </button>
            <button
              onClick={() => {
                const area = createModule(
                  "area",
                  crypto.randomUUID(),
                  Math.max(
                    0,
                    ...floor.modules
                      .filter((m) => m.kind === "area")
                      .map((m) => m.number),
                  ) + 1,
                );
                changeFloor({ ...floor, modules: [...floor.modules, area] });
                setSelected([area.id]);
              }}
            >
              Add planning area
            </button>
            <button
              disabled={
                !module || !mobileRobots.includes(module.kind as EquipmentKind)
              }
              aria-pressed={tool === "route"}
              onClick={() => setTool("route")}
            >
              Draw robot route
            </button>
            <button disabled={!cursor} onClick={() => undo(-1)}>
              ↶ Undo
            </button>
            <button
              disabled={cursor >= history.length - 1}
              onClick={() => undo(1)}
            >
              ↷ Redo
            </button>
            <label>
              Snap
              <select
                value={design.grid}
                onChange={(e) =>
                  commit({ ...design, grid: Number(e.target.value) })
                }
              >
                {[0.1, 0.25, 0.5, 1, 2].map((n) => (
                  <option value={n} key={n}>
                    {n} m
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-pressed={showGrid}
              onClick={() => setShowGrid(!showGrid)}
            >
              Grid
            </button>
            <label>
              Zoom
              <select
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[0.75, 1, 1.5, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {Math.round(n * 100)}%
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div
        className={`design-workspace ${preview && previewExpanded ? "preview-expanded" : ""}`}
      >
        <aside className="design-library">
          <h2>Module library</h2>
          <input
            aria-label="Search equipment library"
            placeholder="Find equipment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p>Drag a module onto the plan, or select it and click a location.</p>
          {groups.map((group) => (
            <details key={group} open={search ? true : undefined}>
              <summary>{group}</summary>
              {equipmentCatalog
                .filter(
                  (e) =>
                    e.group === group &&
                    e.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((e) => (
                  <button
                    key={e.id}
                    draggable
                    disabled={preview}
                    onDragStart={(event) =>
                      event.dataTransfer.setData(
                        "application/warehouse-module",
                        e.id,
                      )
                    }
                    aria-pressed={armed === e.id}
                    onClick={() => {
                      setArmed(e.id);
                      setTool("select");
                    }}
                  >
                    <span style={{ background: e.color }} />
                    <div>
                      <strong>{e.name}</strong>
                      <small>
                        {e.width} × {e.depth} m
                      </small>
                    </div>
                    <span>＋</span>
                  </button>
                ))}
            </details>
          ))}
          <details>
            <summary>Layout starting points</summary>
            <p>
              Template positions retain existing address IDs. Replacing modules
              may remove occupied locations and will be validated before saving.
            </p>
            {templates.map((t) => (
              <button
                key={t.id}
                disabled={preview}
                onClick={() => {
                  const base = {
                    ...currentConfig,
                    design: undefined,
                    template: t.id,
                  };
                  const next = designFromLayout(base, generateLayout(base));
                  commit({
                    ...design,
                    floors: design.floors.map((f) =>
                      f.id === floor.id
                        ? { ...next.floors[0], id: f.id, name: f.name }
                        : f,
                    ),
                  });
                }}
              >
                {t.name}
              </button>
            ))}
          </details>
        </aside>
        <section className="design-canvas-panel">
          <div className="design-canvas-title">
            {preview && (
              <div className="actions">
                <button onClick={() => setPreviewExpanded(!previewExpanded)}>
                  {previewExpanded ? "Exit expanded preview" : "Expand preview"}
                </button>
                {previewExpanded &&
                  (["orbit", "plan", "walk"] as ViewMode[]).map((v) => (
                    <button
                      key={v}
                      aria-pressed={previewMode === v}
                      onClick={() => setPreviewMode(v)}
                    >
                      {v === "plan"
                        ? "Top view"
                        : v === "walk"
                          ? "Walk through"
                          : "Orbit"}
                    </button>
                  ))}
              </div>
            )}
            <span>
              {preview ? "SPATIAL PREVIEW" : "MEASURED FLOOR PLAN"} /{" "}
              {floor.name}
            </span>
            <span>
              {siteWidth} × {siteDepth} m site ·{" "}
              {polygonArea(floor.outline).toFixed(1)} m² floor
            </span>
          </div>
          {preview ? (
            <div className="design-preview">
              <Suspense fallback={<p>Preparing the 3D design…</p>}>
                <Scene
                  config={currentConfig}
                  records={records}
                  designPreview
                  initialFloorId={floor.id}
                  mode={previewMode}
                  onModeChange={setPreviewMode}
                />
              </Suspense>
              <div className="design-preview-note">
                Major layout changes are made in 2D. Orbit, inspect, or isolate
                a floor here.
              </div>
            </div>
          ) : (
            <div className="design-canvas-scroll">
              <svg
                ref={svg}
                className="design-canvas"
                style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
                viewBox={`${-width / 2} ${-depth / 2} ${width} ${depth}`}
                aria-label={`Editable measured plan for ${floor.name}`}
                role="application"
                tabIndex={0}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  gesture.current = null;
                  setRectangle(undefined);
                  setDesign(history[cursor]);
                }}
                onKeyDown={(e) => {
                  if (
                    selected.length &&
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    const step = design.grid * (e.shiftKey ? 5 : 1);
                    const dx =
                      e.key === "ArrowLeft"
                        ? -step
                        : e.key === "ArrowRight"
                          ? step
                          : 0;
                    const dz =
                      e.key === "ArrowUp"
                        ? -step
                        : e.key === "ArrowDown"
                          ? step
                          : 0;
                    changeFloor({
                      ...floor,
                      modules: floor.modules.map((m) =>
                        selected.includes(m.id)
                          ? {
                              ...m,
                              x: snap(m.x + dx),
                              z: snap(m.z + dz),
                              route: m.route.map((p) => ({
                                x: snap(p.x + dx),
                                z: snap(p.z + dz),
                              })),
                            }
                          : m,
                      ),
                    });
                  }
                  if (e.key === "Delete" && selected.length) {
                    e.preventDefault();
                    removeSelected();
                  }
                  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
                    e.preventDefault();
                    undo(e.shiftKey ? 1 : -1);
                  }
                  if (e.key === "Escape") {
                    setTool("select");
                    setArmed(undefined);
                    setPoints([]);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e: DragEvent<SVGSVGElement>) => {
                  e.preventDefault();
                  const kind = e.dataTransfer.getData(
                    "application/warehouse-module",
                  );
                  if (equipmentCatalog.some((entry) => entry.id === kind))
                    add(kind as EquipmentKind, point(e));
                }}
              >
                <defs>
                  <pattern
                    id="design-meter-grid"
                    width={1}
                    height={1}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 1 0 L 0 0 0 1"
                      fill="none"
                      stroke="#dfe7f0"
                      strokeWidth=".025"
                    />
                    <circle cx={0} cy={0} r=".035" fill="#a9bacd" />
                  </pattern>
                  <pattern
                    id="design-major-grid"
                    width={5}
                    height={5}
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width={5} height={5} fill="url(#design-meter-grid)" />
                    <path
                      d="M 5 0 L 0 0 0 5"
                      stroke="#b8cadb"
                      strokeWidth=".05"
                      fill="none"
                    />
                  </pattern>
                </defs>
                <rect
                  x={-width / 2}
                  y={-depth / 2}
                  width={width}
                  height={depth}
                  fill="#f9fbfe"
                />
                {showGrid && (
                  <rect
                    x={-siteWidth / 2}
                    y={-siteDepth / 2}
                    width={siteWidth}
                    height={siteDepth}
                    fill="url(#design-major-grid)"
                  />
                )}
                <polygon
                  points={floor.outline.map((p) => `${p.x},${p.z}`).join(" ")}
                  fill="#e6eef655"
                  stroke="#3a597d"
                  strokeWidth=".18"
                />
                {floor.outline.map((p, i) => {
                  const q = floor.outline[(i + 1) % floor.outline.length];
                  return (
                    <g key={i}>
                      <text
                        x={(p.x + q.x) / 2}
                        y={(p.z + q.z) / 2 - 0.5}
                        fontSize=".8"
                        fill="#35516d"
                        textAnchor="middle"
                      >
                        {Math.hypot(p.x - q.x, p.z - q.z).toFixed(1)} m
                      </text>
                      <circle
                        data-vertex={i}
                        cx={p.x}
                        cy={p.z}
                        r=".25"
                        fill="#fff"
                        stroke="#356bdd"
                        strokeWidth=".1"
                      >
                        <title>Drag outline vertex {i + 1}</title>
                      </circle>
                    </g>
                  );
                })}
                {Array.from(
                  { length: Math.floor(siteWidth / 5) + 1 },
                  (_, i) => {
                    const x = -siteWidth / 2 + i * 5;
                    return (
                      <text
                        key={i}
                        x={x}
                        y={-siteDepth / 2 - 2}
                        fontSize=".75"
                        textAnchor="middle"
                        fill="#8395aa"
                      >
                        {(i * 5).toFixed(0)} m
                      </text>
                    );
                  },
                )}
                {Array.from(
                  { length: Math.floor(siteDepth / 5) + 1 },
                  (_, i) => {
                    const z = -siteDepth / 2 + i * 5;
                    return (
                      <text
                        key={i}
                        x={-siteWidth / 2 - 2.2}
                        y={z}
                        fontSize=".75"
                        fill="#8395aa"
                      >
                        {i * 5} m
                      </text>
                    );
                  },
                )}
                {floor.modules.map((m) => {
                  const size = moduleSize(m),
                    color =
                      equipmentCatalog.find((e) => e.id === m.kind)?.color ||
                      zones.find((z) => z.id === m.zone)?.color ||
                      "#6276ba";
                  return (
                    <g
                      data-module={m.id}
                      key={m.id}
                      style={{
                        cursor: tool === "select" ? "grab" : "crosshair",
                      }}
                    >
                      <rect
                        x={m.x - size.width / 2}
                        y={m.z - size.depth / 2}
                        width={size.width}
                        height={size.depth}
                        rx=".12"
                        fill={color}
                        fillOpacity={m.kind === "area" ? 0.1 : 0.55}
                        stroke={selected.includes(m.id) ? "#225ee0" : color}
                        strokeWidth={selected.includes(m.id) ? 0.2 : 0.06}
                        strokeDasharray={
                          m.kind === "area" ? ".4 .2" : undefined
                        }
                      />
                      {m.kind === "aisle" && (
                        <g
                          transform={`translate(${m.x},${m.z}) rotate(${m.rotation})`}
                        >
                          {[-1, 1].map((side) => (
                            <g key={side}>
                              <rect
                                x={side * (m.aisleWidth / 2 + 0.6) - 0.6}
                                y={-m.bays * 1.2}
                                width={1.2}
                                height={m.bays * 2.4}
                                fill="#3c6d9a"
                              />
                              {Array.from({ length: m.bays - 1 }, (_, i) => (
                                <line
                                  key={i}
                                  x1={side * (m.aisleWidth / 2 + 0.6) - 0.6}
                                  x2={side * (m.aisleWidth / 2 + 0.6) + 0.6}
                                  y1={-m.bays * 1.2 + (i + 1) * 2.4}
                                  y2={-m.bays * 1.2 + (i + 1) * 2.4}
                                  stroke="#e2b87a"
                                  strokeWidth=".1"
                                />
                              ))}
                            </g>
                          ))}
                        </g>
                      )}
                      <text
                        x={m.x}
                        y={m.z}
                        fontSize={Math.max(0.65, Math.min(0.9, size.width / 8))}
                        fill="#203c5a"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        {m.kind === "aisle"
                          ? `A${String(m.number).padStart(2, "0")}`
                          : m.label}
                      </text>
                      {selected.includes(m.id) && (
                        <text
                          x={m.x}
                          y={m.z + size.depth / 2 + 0.8}
                          fontSize=".7"
                          textAnchor="middle"
                          fill="#235bb1"
                        >
                          {size.width.toFixed(1)} × {size.depth.toFixed(1)} m
                        </text>
                      )}
                      {m.route.length > 0 && (
                        <>
                          <polyline
                            points={m.route
                              .map((p) => `${p.x},${p.z}`)
                              .join(" ")}
                            fill="none"
                            stroke="#1ba9a0"
                            strokeWidth=".16"
                            strokeDasharray=".4 .2"
                          />
                          {m.route.map((p, i) => (
                            <g key={i}>
                              <circle
                                cx={p.x}
                                cy={p.z}
                                r=".22"
                                fill="#fff"
                                stroke="#1ba9a0"
                                strokeWidth=".1"
                              />
                              <text
                                x={p.x + 0.3}
                                y={p.z - 0.3}
                                fontSize=".6"
                                fill="#168d86"
                              >
                                {i + 1}
                              </text>
                            </g>
                          ))}
                        </>
                      )}
                    </g>
                  );
                })}
                {rectangle && (
                  <rect
                    x={Math.min(rectangle.a.x, rectangle.b.x)}
                    y={Math.min(rectangle.a.z, rectangle.b.z)}
                    width={Math.abs(rectangle.a.x - rectangle.b.x)}
                    height={Math.abs(rectangle.a.z - rectangle.b.z)}
                    fill="#356bdd22"
                    stroke="#356bdd"
                    strokeWidth=".1"
                  />
                )}
                {points.length > 0 && (
                  <polyline
                    points={points.map((p) => `${p.x},${p.z}`).join(" ")}
                    fill="none"
                    stroke="#356bdd"
                    strokeWidth=".2"
                  />
                )}
              </svg>
            </div>
          )}
          <div className="design-status">
            <span>
              {armed
                ? `Place ${equipmentCatalog.find((e) => e.id === armed)?.name}`
                : tool === "outline"
                  ? "Click perimeter points, then close the outline."
                  : tool === "area"
                    ? "Drag a rectangle to define a planning area."
                    : tool === "route"
                      ? "Click waypoints for the selected robot. Routes are validated against the floor and fixtures."
                      : "Drag to move · Shift-click to select multiple · Delete to remove · Ctrl/⌘ Z to undo"}
            </span>
            {tool === "outline" && (
              <button
                disabled={points.length < 3}
                onClick={() => {
                  changeFloor({ ...floor, outline: points });
                  setPoints([]);
                  setTool("select");
                }}
              >
                Close outline
              </button>
            )}
          </div>
        </section>
        <aside className="design-inspector">
          {preview && <p>Return to the 2D editor to change the layout.</p>}
          <fieldset disabled={preview}>
            <h2>{module ? "Selected module" : "Floor settings"}</h2>
            {module ? (
              <>
                <label>
                  Label
                  <input
                    value={module.label}
                    maxLength={80}
                    onChange={(e) => updateModule({ label: e.target.value })}
                  />
                </label>
                <div className="design-input-grid">
                  {input("X position (m)", "x", -70, 70)}
                  {input("Z position (m)", "z", -70, 70)}
                  {input("Address number", "number", 1, 999, 1)}
                  {input("Height (m)", "height", 0.1, 18, 0.1)}
                </div>
                <label>
                  Orientation
                  <select
                    value={module.rotation}
                    onChange={(e) =>
                      updateModule({
                        rotation: Number(
                          e.target.value,
                        ) as DesignModule["rotation"],
                      })
                    }
                  >
                    {[0, 90, 180, 270].map((n) => (
                      <option key={n} value={n}>
                        {n}°
                      </option>
                    ))}
                  </select>
                </label>
                {module.kind === "aisle" ? (
                  <>
                    <h3>Rack specification</h3>
                    <div className="design-input-grid">
                      {input("Bays per face", "bays", 1, 20, 1)}
                      {input("Levels", "levels", 1, 6, 1)}
                      {input("Bins per bay / level", "bins", 1, 4, 1)}
                      {input("Aisle clearance (m)", "aisleWidth", 2.4, 6, 0.1)}
                    </div>
                    <p>
                      {2 * module.bays * module.levels * module.bins}{" "}
                      addressable bins · {(module.bays * 2.4).toFixed(1)} m rack
                      length
                    </p>
                    {input("Capacity per bin", "binCapacity", 1, 1000000, 1)}
                    <label>
                      Quantity unit
                      <input
                        value={module.unit}
                        maxLength={20}
                        onChange={(e) => updateModule({ unit: e.target.value })}
                      />
                    </label>
                    <button
                      onClick={() => updateModule({ binCapacity: undefined })}
                    >
                      Clear aisle capacity
                    </button>
                    <p>
                      Each bin uses this quantity limit unless an explicit
                      location rule overrides it.
                    </p>
                  </>
                ) : (
                  <div className="design-input-grid">
                    {input("Width (m)", "width", 0.2, 140, 0.1)}
                    {input("Depth (m)", "depth", 0.2, 140, 0.1)}
                  </div>
                )}
                {module.kind === "area" && (
                  <>
                    <label>
                      Area purpose
                      <select
                        value={module.zone}
                        onChange={(e) =>
                          updateModule({
                            zone: e.target.value as DesignModule["zone"],
                          })
                        }
                      >
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button secondary small"
                      onClick={fillArea}
                    >
                      Auto-fill with{" "}
                      {module.zone === "storage"
                        ? "aisles"
                        : module.zone === "packing"
                          ? "packing stations"
                          : "staging lanes"}
                    </button>
                    <p>
                      Uses your builder rack specification and evenly spaces
                      modules inside this rectangle. Overlaps elsewhere must be
                      resolved before saving.
                    </p>
                  </>
                )}
                {(mobileRobots.includes(module.kind as EquipmentKind) ||
                  ["robot-arm", "belt", "roller", "sorter", "machine"].includes(
                    module.kind,
                  )) && (
                  <>
                    <h3>Automation planning</h3>
                    <label>
                      Task
                      <select
                        value={module.task}
                        onChange={(e) =>
                          updateModule({
                            task: e.target.value as DesignModule["task"],
                          })
                        }
                      >
                        {[
                          "idle",
                          "transport",
                          "replenish",
                          "pick-assist",
                          "palletize",
                          "sort",
                          "charge",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    {mobileRobots.includes(module.kind as EquipmentKind) && (
                      <>
                        {input("Preview speed (m/s)", "speed", 0.05, 3, 0.05)}
                        <label className="design-checkbox">
                          <input
                            type="checkbox"
                            checked={module.loop}
                            onChange={(e) =>
                              updateModule({ loop: e.target.checked })
                            }
                          />
                          Closed-loop route
                        </label>
                        <button
                          onClick={() => {
                            if (module.route.length > 1)
                              updateModule({
                                route: [...module.route, module.route[0]],
                                loop: true,
                              });
                          }}
                        >
                          Close route loop
                        </button>
                        <button
                          onClick={() =>
                            updateModule({ route: [], loop: false })
                          }
                        >
                          Clear route
                        </button>
                        <details>
                          <summary>Edit route waypoints</summary>
                          <p>
                            Start follows the robot position. X/Z are meters
                            from the site center.
                          </p>
                          {module.route.map((p, index) => (
                            <div key={index} className="design-waypoint">
                              <strong>{index + 1}</strong>
                              {(["x", "z"] as const).map((axis) => (
                                <label key={axis}>
                                  {axis.toUpperCase()}
                                  <input
                                    type="number"
                                    step={design.grid}
                                    min={-70}
                                    max={70}
                                    value={p[axis]}
                                    disabled={index === 0}
                                    onChange={(e) => {
                                      const n = Number(e.target.value);
                                      if (
                                        !e.target.value ||
                                        !Number.isFinite(n) ||
                                        Math.abs(n) > 70
                                      )
                                        return;
                                      updateModule({
                                        route: module.route.map((v, i) =>
                                          i === index ? { ...v, [axis]: n } : v,
                                        ),
                                        loop: false,
                                      });
                                    }}
                                  />
                                </label>
                              ))}
                              <button
                                disabled={index === 0}
                                aria-label={`Remove waypoint ${index + 1}`}
                                onClick={() =>
                                  updateModule({
                                    route: module.route.filter(
                                      (_, i) => i !== index,
                                    ),
                                    loop: false,
                                  })
                                }
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            disabled={module.route.length >= 100}
                            onClick={() =>
                              updateModule({
                                route: module.route.length
                                  ? [
                                      ...module.route,
                                      { ...module.route.at(-1)! },
                                    ]
                                  : [{ x: module.x, z: module.z }],
                                loop: false,
                              })
                            }
                          >
                            Add waypoint
                          </button>
                        </details>
                        <p>
                          {module.route.length} waypoints ·{" "}
                          {module.route
                            .slice(1)
                            .reduce(
                              (sum, p, i) =>
                                sum +
                                Math.hypot(
                                  p.x - module.route[i].x,
                                  p.z - module.route[i].z,
                                ),
                              0,
                            )
                            .toFixed(1)}{" "}
                          m route
                        </p>
                      </>
                    )}
                    <label>
                      Source module
                      <select
                        value={module.sourceId || ""}
                        onChange={(e) =>
                          updateModule({
                            sourceId: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Not assigned</option>
                        {floor.modules
                          .filter((m) => m.id !== module.id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Destination module
                      <select
                        value={module.targetId || ""}
                        onChange={(e) =>
                          updateModule({
                            targetId: e.target.value || undefined,
                          })
                        }
                      >
                        <option value="">Not assigned</option>
                        {floor.modules
                          .filter((m) => m.id !== module.id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p>
                      Design intent and illustrative playback. No live fleet
                      connection or hardware commands.
                    </p>
                  </>
                )}
                <h3>Arrange selection ({selected.length})</h3>
                <button
                  disabled={selected.length < 3}
                  onClick={() =>
                    changeFloor(distributeModules(floor, selected, "x"))
                  }
                >
                  Even spacing across X
                </button>
                <button
                  disabled={selected.length < 3}
                  onClick={() =>
                    changeFloor(distributeModules(floor, selected, "z"))
                  }
                >
                  Even spacing across Z
                </button>
                <button
                  onClick={() => {
                    const next = {
                      ...module,
                      id: crypto.randomUUID(),
                      number:
                        Math.max(
                          0,
                          ...floor.modules
                            .filter((m) => m.kind === module.kind)
                            .map((m) => m.number),
                        ) + 1,
                      x: module.x + design.grid,
                      z: module.z + design.grid,
                      route: [],
                    };
                    changeFloor({
                      ...floor,
                      modules: [...floor.modules, next],
                    });
                    setSelected([next.id]);
                  }}
                >
                  Duplicate module
                </button>
                <button className="danger" onClick={removeSelected}>
                  Remove selected
                </button>
              </>
            ) : (
              <>
                <label>
                  Floor name
                  <input
                    value={floor.name}
                    maxLength={80}
                    onChange={(e) =>
                      changeFloor({ ...floor, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Clear height (m)
                  <input
                    type="number"
                    min={3}
                    max={18}
                    step={0.1}
                    value={floor.height}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 3 && n <= 18)
                        changeFloor({ ...floor, height: n });
                    }}
                  />
                </label>
                <p>
                  Elevation: +{floorElevation(design, floorIndex).toFixed(1)} m.
                  Upper floors are stacked using each floor’s clear height plus
                  a 0.3 m slab.
                </p>
                <label>
                  Outline starting shape
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        changeFloor({
                          ...floor,
                          outline: outlineTemplate(
                            e.target.value as
                              "rectangle" | "l-shape" | "t-shape",
                            siteWidth,
                            siteDepth,
                          ),
                        });
                      e.target.value = "";
                    }}
                  >
                    <option value="">Choose shape…</option>
                    <option value="rectangle">Rectangle</option>
                    <option value="l-shape">L-shaped shell</option>
                    <option value="t-shape">T-shaped shell</option>
                  </select>
                </label>
                <p>
                  Draw a custom perimeter or drag its vertex handles. Grid
                  labels show meters from the site’s top-left corner; position
                  fields use its centered X/Z coordinates.
                </p>
                <button
                  disabled={floorIndex === 0}
                  className="danger"
                  onClick={() => {
                    commit({
                      ...design,
                      floors: design.floors.filter((f) => f.id !== floor.id),
                    });
                    selectFloor(design.floors[0].id);
                  }}
                >
                  Remove this floor
                </button>
                <button onClick={() => changeFloor({ ...floor, modules: [] })}>
                  Clear floor modules
                </button>
                <p>
                  Occupied addresses and mappings are protected when you apply
                  and save the design.
                </p>
                <h3>Module directory</h3>
                <div className="design-directory">
                  {floor.modules.map((m) => (
                    <button key={m.id} onClick={() => setSelected([m.id])}>
                      {m.label}
                      <small>
                        {m.kind} · {m.x.toFixed(1)}, {m.z.toFixed(1)} m
                      </small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </fieldset>
        </aside>
      </div>
      <div
        className={`design-validation ${problems.length ? "has-issues" : ""}`}
        aria-live="polite"
      >
        <strong>
          {problems.length
            ? `${problems.length} design issues to resolve`
            : "Layout checks passed"}
        </strong>
        {message && <p role="alert">{message}</p>}
        {problems.length > 0 ? (
          <ul>
            {problems.slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p>
            Perimeter containment, fixture overlap, ceiling clearance, route
            obstacles, and saved record locations checked. This does not certify
            an engineered facility or robot safety.
          </p>
        )}
      </div>
    </div>
  );
}
