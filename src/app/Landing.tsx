import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Brand, Icon } from "./ui";
import { useSession } from "./service";
import { exampleWarehouse, generateLayout, zones } from "../domain/warehouse";
import { FloorPlan } from "./FloorPlan";
import type { ViewMode } from "../scene/WarehouseScene";
const Scene = lazy(() => import("../scene/WarehouseScene"));
const stories = [
  [
    "Meet the arrival.",
    "Inspect the dock, the truck, and the cargo expected inside. A clear starting point for every receiving movement.",
  ],
  [
    "Give every move a place.",
    "Connect receiving lanes and handling units to their next location. Keep the physical floor and its records together.",
  ],
  [
    "Find the exact bin.",
    "Move from a warehouse overview to a single aisle, bay, level, and bin. Inspect the inventory attached to that address.",
  ],
  [
    "See what’s ready.",
    "Inspect packing stations and their tasks. Follow quantities through picking, packing, and loading with guarded operations.",
  ],
  [
    "Close the loop.",
    "View outbound docks and truck manifests. Inspect loaded units before dispatching the shipment.",
  ],
];
export function Landing() {
  const user = useSession((s) => s.user);
  const sample = useMemo(() => exampleWarehouse(), []);
  const layout = useMemo(() => generateLayout(sample.config), [sample]);
  const [stage, setStage] = useState(-1);
  const [mode, setMode] = useState<ViewMode>("orbit");
  const [selected, setSelected] = useState<string>();
  const destination = user ? "/app" : "/auth?mode=register";
  const location = layout.locations.find((l) => l.id === selected);
  return (
    <div className="launch">
      <a className="launch-skip" href="#main-content">
        Skip to content
      </a>
      <header className="launch-nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#experience">Experience</a>
          <a href="#build">How it works</a>
          <Link to="/auth">Sign in</Link>
          <Link className="button small" to={destination}>
            Open workspace <Icon name="arrow" />
          </Link>
        </nav>
      </header>
      <main id="main-content">
        <section className="launch-hero">
          <div className="launch-kicker">
            <span className="dot" /> THE SPATIAL WORKSPACE FOR WAREHOUSE
            OPERATIONS
          </div>
          <h1>
            Know your warehouse.
            <br />
            <span>Inside and out.</span>
          </h1>
          <p>
            Turn your floor into an interactive 3D workspace.
            <br className="launch-desktop-break" /> Design the layout. Bring in
            the records. Get closer to every operation.
          </p>
          <div className="launch-actions">
            <Link className="button" to={destination}>
              Build your warehouse <Icon name="arrow" />
            </Link>
            <Link className="launch-text-link" to="/preview">
              Explore the example <span>↗</span>
            </Link>
          </div>
          <div className="launch-mini-label">
            YOUR LAYOUT · YOUR LOCATIONS · YOUR OPERATION
          </div>
        </section>
        <section
          className="launch-showcase"
          id="experience"
          aria-label="Interactive example warehouse"
        >
          <div className="launch-scene-bar">
            <span>
              <i className="dot" /> WAREHOUSE EXPLORER
            </span>
            <span>ILLUSTRATIVE DATA · INTERACTIVE 3D</span>
          </div>
          <div className="launch-scene">
            <Suspense
              fallback={
                <FloorPlan config={sample.config} records={sample.records} />
              }
            >
              <Scene
                config={sample.config}
                records={sample.records}
                focus={stage < 0 ? undefined : zones[stage].id}
                mode={mode}
                selected={selected}
                onSelect={setSelected}
                onModeChange={setMode}
              />
            </Suspense>
            <div className="launch-scene-note">
              <span>01 / EXAMPLE FACILITY</span>
              <strong>
                {sample.config.width} × {sample.config.depth} m
              </strong>
              <small>Drag to orbit · Click to inspect</small>
            </div>
            <div className="launch-view-switch" aria-label="Camera view">
              {(["orbit", "plan", "walk"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={mode === v}
                  onClick={() => setMode(v)}
                >
                  {v === "orbit"
                    ? "3D overview"
                    : v === "plan"
                      ? "Floor plan"
                      : "Walk inside"}
                </button>
              ))}
            </div>
          </div>
          <div
            className="launch-stage-tabs"
            aria-label="Explore warehouse areas"
          >
            {zones.map((z, i) => (
              <button
                key={z.id}
                aria-pressed={stage === i}
                onClick={() => {
                  setStage(i);
                  setSelected(undefined);
                }}
              >
                <span>0{i + 1}</span>
                {z.name}
                <Icon name="arrow" />
              </button>
            ))}
          </div>
          <div className="launch-stage-copy" aria-live="polite">
            <div>
              <span className="launch-kicker">
                {location
                  ? "SELECTED LOCATION"
                  : stage < 0
                    ? "YOUR OPERATION / IN PERSPECTIVE"
                    : `0${stage + 1} / ${zones[stage].name.toUpperCase()}`}
              </span>
              <h2>
                {location
                  ? location.id
                  : stage < 0
                    ? "The whole floor. Within reach."
                    : stories[stage][0]}
              </h2>
            </div>
            <p>
              {location
                ? "This address connects a physical position to its operational records. Open the example workspace to inspect its details and explore the location directory."
                : stage < 0
                  ? "A connected view from receiving to dispatch. Choose an area below the model, change perspective, or select a location to get closer."
                  : stories[stage][1]}
            </p>
            <Link to="/preview" className="launch-text-link">
              Open full explorer ↗
            </Link>
          </div>
        </section>
        <section className="launch-benefits">
          <div>
            <span className="launch-kicker">A CLEARER PICTURE</span>
            <h2>
              Space becomes
              <br />
              <span>understanding.</span>
            </h2>
          </div>
          <div className="launch-benefit-grid">
            {[
              [
                "Navigate naturally",
                "Orbit the facility, read the floor plan, or walk through the aisles. Choose the perspective that fits your task.",
                "grid",
              ],
              [
                "Inspect precisely",
                "Find an address and see its inventory, status, and activity. Physical locations give operational data context.",
                "box",
              ],
              [
                "Move with confidence",
                "Receive, put away, pick, pack, and load through validated actions. Changes stay connected to quantities and locations.",
                "activity",
              ],
            ].map(([title, body, icon]) => (
              <article key={title}>
                <div className="launch-icon">
                  <Icon name={icon} />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="launch-build" id="build">
          <div className="launch-build-heading">
            <span className="launch-kicker">MADE TO FIT YOUR FLOOR</span>
            <h2>
              Start with a flow.
              <br />
              Make it your own.
            </h2>
            <p>
              Three layout templates. Configurable docks, staging lanes, racks,
              storage levels, and packing stations. One connected warehouse.
            </p>
            <Link className="launch-text-link" to={destination}>
              Start mapping ↗
            </Link>
          </div>
          <div className="launch-layouts">
            {[
              ["Through flow", "Receive and dispatch on opposite sides.", "→"],
              ["U-shaped flow", "Bring both dock groups onto one face.", "∪"],
              [
                "L-shaped flow",
                "Connect receiving and dispatch at a corner.",
                "↳",
              ],
            ].map(([title, body, glyph], i) => (
              <article key={title}>
                <span className="launch-layout-number">0{i + 1}</span>
                <div
                  className={`launch-layout-art flow-${i}`}
                  aria-hidden="true"
                >
                  <div className="launch-rack-pattern" />
                  <span>{glyph}</span>
                  <i />
                  <b />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="launch-data">
          <div className="launch-address-card">
            <span className="launch-kicker">LOCATION INTELLIGENCE</span>
            <div className="launch-address">
              A01<span> / </span>L<span> / </span>B01<span> / </span>L01
              <span> / </span>01
            </div>
            <div className="launch-address-labels">
              <span>Aisle</span>
              <span>Side</span>
              <span>Bay</span>
              <span>Level</span>
              <span>Bin</span>
            </div>
            <div className="launch-record-lines">
              <div>
                <span>Physical address</span>
                <strong>Mapped to the floor</strong>
              </div>
              <div>
                <span>Operational records</span>
                <strong>Manual entry + CSV</strong>
              </div>
              <div>
                <span>Change history</span>
                <strong>Attached to the warehouse</strong>
              </div>
            </div>
            <span className="launch-example-tag">ILLUSTRATIVE LOCATION</span>
          </div>
          <div>
            <span className="launch-kicker">MORE THAN A MODEL</span>
            <h2>
              The place.
              <br />
              The record.
              <br />
              <span>The whole picture.</span>
            </h2>
            <p>
              Add records manually or import CSV files. Connect inventory,
              handling units, trucks, and packing tasks to their locations—with
              clear validation before changes are saved.
            </p>
            <div className="launch-integration">
              <Icon name="link" />
              <div>
                <strong>A path to SCOTI connectivity</strong>
                <p>
                  Manual data and CSV import are available today. A direct SCOTI
                  connection requires approved API documentation and mapping.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="launch-steps">
          <span className="launch-kicker">FROM FLOOR TO WORKSPACE</span>
          <h2>A simple way in.</h2>
          <div>
            {[
              ["Map", "Choose a template and configure your facility."],
              ["Populate", "Add your records or import a CSV file."],
              ["Explore", "Navigate the model and inspect each location."],
            ].map(([title, body], i) => (
              <article key={title}>
                <span>0{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="launch-faq">
          <h2>A few things to know.</h2>
          <div>
            {[
              [
                "Can I try it before creating an account?",
                "Yes. Open the example explorer to navigate a warehouse with clearly labeled synthetic records. Create a workspace when you’re ready to save your own facility.",
              ],
              [
                "Can I use my existing warehouse data?",
                "Yes. Enter records manually or use CSV import with column mapping and validation. Location IDs connect those records to your generated warehouse.",
              ],
              [
                "Is this the SCOTI interface?",
                "This is CSCS Warehouse Twin, a spatial warehouse application. It does not reproduce or claim to be the production SCOTI interface. Direct integration is pending approved API details.",
              ],
              [
                "Do I need a device that supports 3D?",
                "3D is a progressive enhancement. A floor plan and location directory provide an alternative when WebGL is unavailable.",
              ],
            ].map(([title, body]) => (
              <details key={title}>
                <summary>
                  {title}
                  <span>+</span>
                </summary>
                <p>{body}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="launch-close">
          <span className="launch-kicker">
            GET YOUR OPERATION IN PERSPECTIVE
          </span>
          <h2>
            Your next view
            <br />
            starts here.
          </h2>
          <Link className="button" to={destination}>
            Create your workspace <Icon name="arrow" />
          </Link>
          <Link className="launch-text-link" to="/preview">
            Or explore the example ↗
          </Link>
        </section>
      </main>
      <footer className="launch-footer">
        <Brand />
        <p>
          CSCS Warehouse Twin
          <br />
          <span>A spatial workspace for warehouse operations.</span>
        </p>
        <Link to="/auth">Sign in ↗</Link>
      </footer>
    </div>
  );
}
