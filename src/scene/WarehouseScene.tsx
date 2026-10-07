import { formatFeet } from "../domain/units";
import { useEffect, useRef, useState } from "react";
import { createWarehouseScene } from "./createWarehouseScene";
import type { ViewMode } from "./createWarehouseScene";
import { FloorPlan } from "../app/FloorPlan";
import type { WarehouseConfig, OperationalRecord } from "../domain/warehouse";
import type { AutomationState } from "../domain/automation";
export type { ViewMode } from "./createWarehouseScene";
const emptyRecords: OperationalRecord[] = [];
type Props = {
  automation?: AutomationState;
  config: WarehouseConfig;
  records?: OperationalRecord[];
  selected?: string;
  focus?: string;
  initialFloorId?: string;
  mode?: ViewMode;
  onSelect?: (id: string) => void;
  compact?: boolean;
  designPreview?: boolean;
  onModelReady?: (exporter: (() => Promise<Blob>) | null) => void;
  onModeChange?: (mode: ViewMode) => void;
};
export default function WarehouseScene({
  automation,
  config,
  records = emptyRecords,
  selected,
  focus,
  initialFloorId,
  mode = "orbit",
  onSelect,
  compact = false,
  designPreview = false,
  onModelReady,
  onModeChange,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    controller = useRef<ReturnType<typeof createWarehouseScene> | null>(null);
  const callbacks = useRef({ onSelect, onModelReady, onModeChange });
  const [failed, setFailed] = useState(false),
    [hover, setHover] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [quality, setQuality] = useState<"auto" | "studio" | "efficient">("auto");
  const [exterior, setExterior] = useState(false);
  const [floorId, setFloorId] = useState(initialFloorId || "");
  useEffect(() => {
    queueMicrotask(() => setFloorId(initialFloorId || ""));
  }, [initialFloorId]);
  const [inspectedId, setInspectedId] = useState("");
  const inspected = config.design?.floors
    .flatMap((f) => f.modules.map((m) => ({ ...m, floorName: f.name })))
    .find((m) => m.id === inspectedId);
  useEffect(() => {
    callbacks.current = { onSelect, onModelReady, onModeChange };
  }, [onSelect, onModelReady, onModeChange]);
  useEffect(() => {
    if (!host.current) return;
    try {
      const instance = createWarehouseScene(host.current, {
        config,
        records,
        compact,
        designPreview,
        quality,
        onSelect: (id) => {
          if (id.startsWith("module:")) setInspectedId(id.slice(7));
          else {
            setInspectedId("");
            callbacks.current.onSelect?.(id);
          }
        },
        onHover: setHover,
        onError: () => setFailed(true),
        onExitWalk: () => callbacks.current.onModeChange?.("orbit"),
      });
      controller.current = instance;
      queueMicrotask(() => setFailed(false));
      callbacks.current.onModelReady?.(instance.exportModel);
      return () => {
        instance.dispose();
        controller.current = null;
        callbacks.current.onModelReady?.(null);
      };
    } catch (error) {
      console.error("Warehouse renderer unavailable", error);
      queueMicrotask(() => setFailed(true));
    }
  }, [config, records, compact, designPreview, attempt, quality]);
  useEffect(() => {
    controller.current?.setAutomation(automation);
  }, [automation, config, records, compact, designPreview, attempt, quality]);
  useEffect(() => {
    controller.current?.focus(selected || focus, mode, floorId || undefined);
  }, [selected, focus, mode, config, records, attempt, floorId, quality]);
  useEffect(() => {
    controller.current?.setExterior(exterior);
  }, [exterior, config, records, attempt, quality]);
  return (
    <div className="scene-wrapper">
      <div
        className="scene-canvas"
        ref={host}
        aria-label="Interactive warehouse. Click a location to inspect it. In Walk mode use WASD or arrow keys and drag to look. The location directory is a keyboard accessible alternative."
      />
      {failed && (
        <div className="scene-fallback">
          <strong>Warehouse plan</strong>
          <p>
            3D is unavailable on this device. Use the location directory to
            inspect and edit records.
          </p>
          <button
            className="button small"
            onClick={() => setAttempt((v) => v + 1)}
          >
            Retry 3D
          </button>
          <FloorPlan config={config} records={records} onSelect={onSelect} />
        </div>
      )}
      {!compact && !failed && (
        <>
          <label className="scene-quality-control">
            Graphics
            <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
              <option value="auto">Automatic</option>
              <option value="studio">Studio lighting</option>
              <option value="efficient">Lower GPU usage</option>
            </select>
          </label>
          {inspected && (
            <div className="scene-equipment-card">
              <button
                aria-label="Close equipment details"
                onClick={() => setInspectedId("")}
              >
                ×
              </button>
              <strong>{inspected.label}</strong>
              <p>
                {inspected.floorName} · {inspected.kind}
              </p>
              <dl>
                <dt>Position</dt>
                <dd>
                  {formatFeet(inspected.x)}, {formatFeet(inspected.z)} ft
                </dd>
                <dt>Task</dt>
                <dd>{inspected.task}</dd>
                <dt>Route</dt>
                <dd>{inspected.route.length} waypoints</dd>
                <dt>Connections</dt>
                <dd>
                  {inspected.sourceId ? "Source assigned" : "No source"} ·{" "}
                  {inspected.targetId
                    ? "Destination assigned"
                    : "No destination"}
                </dd>
              </dl>
              <small>Planning configuration · edit in the 2D studio</small>
            </div>
          )}
          {config.design && (
            <label className="scene-floor-control">
              View floor
              <select
                aria-label="View warehouse floor"
                value={floorId}
                onChange={(e) => {
                  setFloorId(e.target.value);
                  callbacks.current.onSelect?.("");
                }}
              >
                <option value="">All floors</option>
                {config.design.floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="scene-hover">
            {hover ? (
              <>
                <span className="dot" />
                <code>{hover}</code>
                <span>Click to inspect</span>
              </>
            ) : mode === "walk" ? (
              <span>Click the floor to walk there</span>
            ) : null}
          </div>
          {mode !== "walk" && (
            <div className="shell-toggle">
              <button
                className={!exterior ? "active" : ""}
                onClick={() => setExterior(false)}
              >
                Interior cutaway
              </button>
              <button
                className={exterior ? "active" : ""}
                onClick={() => setExterior(true)}
              >
                Complete building
              </button>
              <span>
                {exterior
                  ? "Roof and all exterior walls visible"
                  : config.design
                    ? "Roof removed · near walls transparent"
                    : "Roof removed · near walls transparent"}
              </span>
            </div>
          )}
          <div className="scene-compass">
            <span>N</span>
            <i />
            <span>TRUE SCALE / FEET</span>
          </div>
          {mode === "walk" && (
            <div className="walk-pad" aria-label="Walking controls">
              {[
                ["w", "↑", "Move forward"],
                ["a", "←", "Move left"],
                ["s", "↓", "Move backward"],
                ["d", "→", "Move right"],
              ].map(([key, label, name]) => (
                <button
                  key={key}
                  aria-label={name}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    controller.current?.setKey(key, true);
                  }}
                  onPointerUp={() => controller.current?.setKey(key, false)}
                  onPointerCancel={() => controller.current?.setKey(key, false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      controller.current?.setKey(key, true);
                  }}
                  onKeyUp={() => controller.current?.setKey(key, false)}
                >
                  {label}
                </button>
              ))}
              <small>Drag to look · Esc to exit</small>
            </div>
          )}
        </>
      )}
    </div>
  );
}
