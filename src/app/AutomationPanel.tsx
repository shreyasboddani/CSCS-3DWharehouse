import { formatFeet } from "../domain/units";
import { useState } from "react";
import { api } from "./service";
import { mobileRobots } from "../domain/design";
import { conveyorKinds } from "../domain/automation";
import type { AutomationCommand } from "../domain/automation";
import type { Warehouse } from "../domain/warehouse";

export function AutomationPanel({
  warehouse,
  onChange,
}: {
  warehouse: Warehouse;
  onChange: (warehouse: Warehouse) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [priority, setPriority] = useState(3);
  const modules =
    warehouse.config.design?.floors.flatMap((f) =>
      f.modules
        .filter((m) =>
          mobileRobots.includes(m.kind as (typeof mobileRobots)[number]),
        )
        .map((m) => ({ ...m, floorName: f.name })),
    ) || [];
  const state = warehouse.automation;
  const fixtures =
    warehouse.config.design?.floors.flatMap((f) =>
      f.modules.map((m) => ({ ...m, floorName: f.name })),
    ) || [];
  const conveyors = fixtures.filter((m) => conveyorKinds.includes(m.kind));
  const [toteLabel, setToteLabel] = useState("Test tote");
  async function command(command: AutomationCommand) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ warehouse: Warehouse }>(
        `/warehouses/${warehouse.id}/automation`,
        "POST",
        { version: warehouse.version, command },
      );
      onChange({
        ...result.warehouse,
        config: warehouse.config,
        records: warehouse.records,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation command failed.");
    } finally {
      setBusy(false);
    }
  }
  if (!modules.length && !conveyors.length) return null;
  return (
    <details className="automation-panel">
      <summary>
        <span>Automation lab</span>
        <span className="pill">
          LOCAL SIMULATION · {modules.length} ROBOTS · {conveyors.length}{" "}
          CONVEYORS
        </span>
      </summary>
      <div className="automation-content">
        <div className="automation-intro">
          <div>
            <h2>Rehearse your saved routes</h2>
            <p>
              Queue route circuits, inspect traffic holds and test charging.
              Each open route returns along the same waypoints. This simulation
              does not move inventory or control real equipment.
            </p>
          </div>
          <strong>
            {(state?.elapsed || 0).toFixed(1)}s <small>simulation clock</small>
          </strong>
        </div>
        <fieldset disabled={busy} className="automation-controls">
          <button
            className="button secondary small"
            onClick={() => void command({ type: "reset" })}
          >
            {state ? "Reset simulation" : "Initialize simulation"}
          </button>
          {state && (
            <>
              <button
                className="button small"
                onClick={() =>
                  void command({ type: "pause", paused: !state.paused })
                }
              >
                {state.paused ? "Resume simulation" : "Pause simulation"}
              </button>
              {[1, 10, 30].map((seconds) => (
                <button
                  key={seconds}
                  className="button secondary small"
                  disabled={state.paused}
                  onClick={() => void command({ type: "step", seconds })}
                >
                  Advance {seconds}s
                </button>
              ))}
            </>
          )}
          <label>
            Queue priority{" "}
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>
                  {p}
                  {p === 5 ? " · highest" : p === 1 ? " · lowest" : ""}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {error && (
          <div className="error-box" role="alert">
            {error}{" "}
            <button
              className="button small secondary"
              onClick={() =>
                void api<{ warehouse: Warehouse }>(
                  `/warehouses/${warehouse.id}`,
                )
                  .then((r) => {
                    onChange(r.warehouse);
                    setError("");
                  })
                  .catch((e: Error) => setError(e.message))
              }
            >
              Reload warehouse
            </button>
          </div>
        )}
        <div className="automation-robots">
          {modules.map((m) => {
            const robot = state?.robots.find((r) => r.id === m.id);
            return (
              <article key={m.id} className="automation-robot">
                <div>
                  <strong>{m.label}</strong>
                  <small>
                    {m.floorName} · {m.kind} · {m.route.length} waypoints
                  </small>
                </div>
                <span className="pill">
                  {robot?.status || "Not initialized"}
                </span>
                {robot && (
                  <>
                    <p>
                      {formatFeet(robot.x)}, {formatFeet(robot.z)} ft ·{" "}
                      <strong>{robot.battery.toFixed(1)}% battery</strong>
                    </p>
                    <progress
                      max={100}
                      value={robot.battery}
                      aria-label={`${m.label} simulated battery`}
                    />
                    <p className="automation-reason">
                      {robot.reason ||
                        (state?.paused
                          ? "Simulation paused."
                          : robot.status === "Running"
                            ? "Executing a saved route circuit."
                            : "Ready for a queued route circuit.")}
                    </p>
                  </>
                )}
                <div className="automation-controls">
                  <button
                    disabled={busy || !state || m.route.length < 2}
                    onClick={() =>
                      void command({ type: "enqueue", robotId: m.id, priority })
                    }
                  >
                    Queue circuit
                  </button>
                  <button
                    disabled={busy || !robot}
                    onClick={() =>
                      robot &&
                      void command({
                        type: "enable",
                        robotId: m.id,
                        enabled: !robot.enabled,
                      })
                    }
                  >
                    {robot?.enabled ? "Pause robot" : "Enable robot"}
                  </button>
                  <button
                    disabled={busy || !robot || robot.charging}
                    onClick={() =>
                      void command({ type: "charge", robotId: m.id })
                    }
                  >
                    Charge at station
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {state && (
          <div className="automation-queue">
            <h3>Mission queue</h3>
            {!state.missions.length && (
              <p>
                No circuits queued. Draw routes in the editor, then queue a
                circuit above.
              </p>
            )}
            {[...state.missions].reverse().map((m) => (
              <div key={m.id}>
                <code>{m.id.slice(0, 8)}</code>
                <span>{modules.find((r) => r.id === m.robotId)?.label}</span>
                <span>Priority {m.priority}</span>
                <strong>{m.status}</strong>
                {["Running", "Queued"].includes(m.status) && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void command({ type: "cancel", missionId: m.id })
                    }
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {!!conveyors.length && (
          <section className="automation-conveyors">
            <h3>Conveyor buffers & handoffs</h3>
            <p className="automation-note">
              Logical transfer rehearsal: four virtual totes per conveyor. Links
              use the editor's destination and source fields. Set a receiving
              fixture to finish a flow. This does not certify physical belt
              connections.
            </p>
            <label>
              Virtual tote label{" "}
              <input
                maxLength={80}
                value={toteLabel}
                onChange={(e) => setToteLabel(e.target.value)}
              />
            </label>
            <div className="automation-robots">
              {conveyors.map((m) => {
                const equipment = state?.equipment.find((e) => e.id === m.id);
                return (
                  <article key={m.id} className="automation-robot">
                    <strong>{m.label}</strong>
                    <small>
                      {m.floorName} · {m.kind} →{" "}
                      {fixtures.find((f) => f.id === m.targetId)?.label ||
                        "Destination not set"}
                    </small>
                    <p>
                      {state?.totes.filter(
                        (t) =>
                          t.equipmentId === m.id && t.status !== "Delivered",
                      ).length || 0}{" "}
                      / 4 buffer slots ·{" "}
                      {equipment
                        ? equipment.enabled
                          ? "Ready"
                          : "Paused"
                        : "Not initialized"}
                    </p>
                    <div className="automation-controls">
                      <button
                        disabled={busy || !state || !toteLabel.trim()}
                        onClick={() =>
                          void command({
                            type: "tote",
                            equipmentId: m.id,
                            label: toteLabel,
                          })
                        }
                      >
                        Inject virtual tote
                      </button>
                      <button
                        disabled={busy || !equipment}
                        onClick={() =>
                          equipment &&
                          void command({
                            type: "equipment",
                            equipmentId: m.id,
                            enabled: !equipment.enabled,
                          })
                        }
                      >
                        {equipment?.enabled
                          ? "Pause conveyor"
                          : "Resume conveyor"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            {state && (
              <div className="automation-queue">
                {[...state.totes].reverse().map((t) => (
                  <div key={t.id}>
                    <code>{t.id.slice(0, 8)}</code>
                    <span>
                      {t.label} ·{" "}
                      {fixtures.find((m) => m.id === t.equipmentId)?.label}
                    </span>
                    <strong>{t.status}</strong>
                    <span>{t.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        <p className="automation-note">
          Fixed time steps, conservative robot footprints and priority ordering.
          Traffic holds can require route edits; no automatic deadlock recovery.
          Battery consumption and charge rates are illustrative. Vendor
          telemetry, physical equipment handshakes and SCOTI adapters require a
          supported connection.
        </p>
      </div>
    </details>
  );
}
