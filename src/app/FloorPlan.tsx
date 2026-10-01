import { generateLayout, zones } from "../domain/warehouse";
import type {
  WarehouseConfig,
  OperationalRecord,
  Zone,
} from "../domain/warehouse";
export function FloorPlan({
  config,
  records = [],
  onSelect,
}: {
  config: WarehouseConfig;
  records?: OperationalRecord[];
  onSelect?: (id: string) => void;
}) {
  const layout = generateLayout(config),
    occupied = new Set(
      records
        .filter(
          (r) =>
            r.kind !== "Truck" &&
            r.quantity > 0 &&
            !["Expected", "Dispatched"].includes(r.status),
        )
        .map((r) => r.locationId),
    ),
    width = config.width,
    depth = config.depth;
  return (
    <svg
      className="warehouse-floor-plan"
      role="img"
      aria-label="Warehouse floor plan with mapped rack and workstation locations"
      viewBox={`${-width / 2 - 2} ${-depth / 2 - 2} ${width + 4} ${depth + 4}`}
    >
      <rect
        x={-width / 2}
        y={-depth / 2}
        width={width}
        height={depth}
        fill="#edf2f6"
        stroke="#9cabbc"
        strokeWidth=".25"
      />
      {layout.racks.map((r, i) => (
        <rect
          key={i}
          x={r.x - 0.6}
          y={r.z - r.length / 2}
          width={1.2}
          height={r.length}
          fill="#477ba7"
          rx=".15"
        />
      ))}
      {layout.locations
        .filter((l) => l.zone !== "storage" || l.level === 1)
        .map((l) => (
          <g
            key={l.id}
            aria-hidden={!onSelect}
            onClick={() => onSelect?.(l.id)}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            <rect
              x={l.x - 0.5}
              y={l.z - 0.4}
              width={1}
              height={0.8}
              fill={
                occupied.has(l.id)
                  ? "#09a49b"
                  : l.zone === "storage"
                    ? "#b4ccdf"
                    : zones.find((z) => z.id === l.zone)!.color
              }
              stroke="#fff"
              strokeWidth=".08"
            />
            <title>
              {l.code} · {l.label}
            </title>
          </g>
        ))}
      {zones.map((z) => (
        <text
          key={z.id}
          x={layout.centers[z.id][0]}
          y={layout.centers[z.id][1] + 2}
          fontSize=".95"
          textAnchor="middle"
          fill="#27415c"
          fontFamily="sans-serif"
        >
          {z.name}
        </text>
      ))}
    </svg>
  );
}
export function LayoutPlacement({
  config,
  onChange,
}: {
  config: WarehouseConfig;
  onChange: (config: WarehouseConfig) => void;
}) {
  const set = (zone: Zone, axis: "x" | "z", value: number) =>
    onChange({
      ...config,
      layoutOffsets: {
        ...config.layoutOffsets,
        [zone]: {
          x: config.layoutOffsets?.[zone]?.x || 0,
          z: config.layoutOffsets?.[zone]?.z || 0,
          [axis]: value,
        },
      },
    });
  return (
    <details className="layout-placement">
      <summary>Customize area positions</summary>
      <p className="subtle">
        Offsets in meters from the selected template. Docks stay on their
        exterior wall. Overlaps and boundary violations prevent saving.
      </p>
      <FloorPlan config={config} />
      <div className="placement-grid">
        {zones.map((zone) => (
          <div key={zone.id}>
            <strong>{zone.name}</strong>
            {(["x", "z"] as const).map((axis) => (
              <label key={axis}>
                {axis.toUpperCase()} offset
                <input
                  aria-label={zone.name + " " + axis.toUpperCase() + " offset"}
                  type="number"
                  min={-100}
                  max={100}
                  step={0.5}
                  disabled={
                    (zone.id === "inbound" && axis === "z") ||
                    (zone.id === "outbound" &&
                      axis === (config.template === "l-flow" ? "x" : "z"))
                  }
                  value={config.layoutOffsets?.[zone.id]?.[axis] || 0}
                  onChange={(e) => set(zone.id, axis, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-button"
        onClick={() => onChange({ ...config, layoutOffsets: undefined })}
      >
        Reset positions to template
      </button>
    </details>
  );
}
