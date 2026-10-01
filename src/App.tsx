import { DraftList } from "./app/DraftList";
import { AutomationPanel } from "./app/AutomationPanel";
import type { DesignDraft, DraftInput } from "./domain/drafts";
import { Landing } from "./app/Landing";
import { Brand, Icon } from "./app/ui";
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { api, useSession, returnToPath } from "./app/service";
import type { User } from "./app/service";
import {
  defaultConfig,
  templates,
  generateLayout,
  zones,
  kinds,
  allowedStatuses,
  exampleWarehouse,
} from "./domain/warehouse";
import type {
  Warehouse,
  WarehouseConfig,
  OperationalRecord,
  Location,
  Zone,
} from "./domain/warehouse";
import type { ViewMode } from "./scene/WarehouseScene";
import { DesignEditor } from "./app/DesignEditor";
import { FloorPlan, LayoutPlacement } from "./app/FloorPlan";
import {
  CsvImport,
  LocationMappings,
  CapacityDialog,
  OperationsOverview,
  ArchivedWarehouses,
  OperationDialog,
  Modal,
} from "./app/WarehouseWorkflows";
import { exportCsv } from "./domain/csv";
import { availableOperations } from "./domain/operations";
import type { Operation } from "./domain/operations";
import { operationalSummary } from "./domain/summary";
const Scene = lazy(() => import("./scene/WarehouseScene"));
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
function SceneView(props: React.ComponentProps<typeof Scene>) {
  if (props.compact)
    return <FloorPlan config={props.config} records={props.records} />;
  return (
    <Suspense
      fallback={<div className="loading-scene">Preparing your warehouse…</div>}
    >
      <Scene {...props} />
    </Suspense>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice" role="alert">
      {children}
    </div>
  );
}
function Protected() {
  const { user, ready, initializationError, initialize } = useSession();
  const location = useLocation();
  if (!ready) return <div className="full-loading">Opening workspace…</div>;
  if (initializationError)
    return (
      <div className="page">
        <Notice>{initializationError}</Notice>
        <button className="button" onClick={() => void initialize()}>
          Retry connection
        </button>
      </div>
    );
  return user ? (
    <Shell />
  ) : (
    <Navigate
      to={
        "/auth?next=" + encodeURIComponent(location.pathname + location.search)
      }
      replace
    />
  );
}
function Shell() {
  const [logoutError, setLogoutError] = useState(""),
    [loggingOut, setLoggingOut] = useState(false);
  const { user, logout } = useSession(),
    navigate = useNavigate();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="workspace-icon">{user?.workspace.charAt(0)}</span>
          <div>
            <strong>{user?.workspace}</strong>
            <small>Workspace</small>
          </div>
        </div>
        <small className="nav-label">YOUR OPERATIONS</small>
        <nav>
          <NavLink to="/app" end>
            <Icon name="grid" />
            Warehouses
          </NavLink>
          <NavLink to="/app/activity">
            <Icon name="activity" />
            Activity
          </NavLink>
          <NavLink to="/app/connections">
            <Icon name="link" />
            Connections
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="product-note">
            <span className="dot" />
            Your operation, in perspective.
            <p>From the dock to the last storage bin.</p>
          </div>
          <button
            className="profile"
            disabled={loggingOut}
            onClick={async () => {
              setLoggingOut(true);
              setLogoutError("");
              try {
                await logout();
                navigate("/");
              } catch (error) {
                setLogoutError(errorText(error));
              } finally {
                setLoggingOut(false);
              }
            }}
          >
            <span className="avatar">{user?.name.charAt(0)}</span>
            <span>
              <strong>{user?.name}</strong>
              <small>Sign out ↗</small>
            </span>
          </button>
          {logoutError && (
            <p className="notice" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      <main className="workspace-main">
        <Outlet />
      </main>
    </div>
  );
}
function Auth() {
  const [params] = useSearchParams(),
    register = params.get("mode") === "register";
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate(),
    setUser = useSession((s) => s.setUser),
    user = useSession((s) => s.user);
  const nextPath = returnToPath(params.get("next"));
  if (user) return <Navigate to={nextPath} replace />;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api<{ user: User }>(
        "/auth/" + (register ? "register" : "login"),
        "POST",
        data,
      );
      setUser(result.user);
      navigate(nextPath);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <Brand />
        <div>
          <span className="eyebrow">A CLEARER VIEW OF OPERATIONS</span>
          <h1>
            Make space
            <br />
            for clarity.
          </h1>
          <p>
            Your warehouse, its locations, and the information that makes it
            work.
          </p>
        </div>
        <span>CSCS / WAREHOUSE TWIN</span>
      </div>
      <div className="auth-form">
        <Link className="back-link" to="/">
          ← Back to website
        </Link>
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>{register ? "Start with your warehouse." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create an account to map and save your operation."
              : "Sign in to your warehouse workspace."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <>
                <label>
                  Your name
                  <input
                    name="name"
                    required
                    minLength={2}
                    autoComplete="name"
                  />
                </label>
                <label>
                  Workspace name
                  <input
                    name="workspace"
                    required
                    minLength={2}
                    placeholder="e.g. Atlanta Operations"
                  />
                </label>
              </>
            )}
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
              <small>At least 10 characters.</small>
            </label>
            {error && <Notice>{error}</Notice>}
            <button className="button" disabled={busy}>
              {busy
                ? "Please wait…"
                : register
                  ? "Create workspace"
                  : "Sign in"}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New here?"}{" "}
            <Link to={register ? "/auth" : "/auth?mode=register"}>
              {register ? "Sign in" : "Create a workspace"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
function Dashboard() {
  const { warehouses, refresh, user } = useSession(),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    navigate = useNavigate();
  useEffect(() => {
    refresh()
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [refresh]);
  async function createExample() {
    setBusy(true);
    try {
      const { warehouse } = await api<{ warehouse: Warehouse }>(
        "/warehouses",
        "POST",
        { example: true },
      );
      await refresh();
      navigate("/app/warehouses/" + warehouse.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const items = warehouses.filter((w) =>
    (w.config.name + " " + w.config.site)
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const capacity = warehouses.reduce(
    (sum, w) => sum + generateLayout(w.config).capacity,
    0,
  );
  return (
    <div className="page">
      <div className="page-top">
        <span className="breadcrumb">{user?.workspace} / Overview</span>
        <span className="subtle">SPATIAL OPERATIONS</span>
      </div>
      <header className="page-heading">
        <div>
          <span className="eyebrow">YOUR NETWORK, IN PERSPECTIVE</span>
          <h1>Warehouses</h1>
          <p>A place for every operation. A perspective on every location.</p>
        </div>
        <Link className="button" to="/app/new">
          <Icon name="plus" />
          Map new warehouse
        </Link>
      </header>
      {error && <Notice>{error}</Notice>}
      <div className="metrics">
        <div>
          <span>Mapped warehouses</span>
          <strong>{warehouses.length.toString().padStart(2, "0")}</strong>
          <small>In your workspace</small>
        </div>
        <div>
          <span>Storage locations</span>
          <strong>{capacity.toLocaleString()}</strong>
          <small>Generated from your layouts</small>
        </div>
        <div>
          <span>Operational records</span>
          <strong>
            {warehouses.reduce((s, w) => s + w.records.length, 0)}
          </strong>
          <small>Manual and labeled example data</small>
        </div>
        <div className="metric-feature">
          <Icon />
          <strong>Built for your floor.</strong>
          <p>
            Map the structure. Add the context.
            <br />
            Explore the whole operation.
          </p>
        </div>
      </div>
      <div className="list-heading">
        <h2>
          Your spaces <span>{items.length}</span>
        </h2>
        <input
          className="search"
          aria-label="Search warehouses"
          placeholder="Search warehouses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="empty-state">Loading warehouses…</div>
      ) : !warehouses.length ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon />
          </span>
          <h2>Your first warehouse starts here.</h2>
          <p>
            Choose your layout and configure each section.
            <br />
            We’ll assemble a spatial workspace around it.
          </p>
          <Link className="button" to="/app/new">
            Map new warehouse <Icon name="arrow" />
          </Link>
          <button
            className="text-button"
            onClick={createExample}
            disabled={busy}
          >
            {busy
              ? "Creating example…"
              : "Or start with a labeled example warehouse →"}
          </button>
        </div>
      ) : (
        <div className="warehouse-grid">
          {items.map((w) => (
            <Link
              to={"/app/warehouses/" + w.id}
              className="warehouse-card"
              key={w.id}
            >
              <div className="warehouse-thumb">
                <SceneView config={w.config} records={w.records} compact />
                <span className="pill">
                  {w.records.some((r) => r.source === "Example")
                    ? "Contains example data"
                    : "Manual records"}
                </span>
              </div>
              <div className="warehouse-card-copy">
                <div>
                  <h3>{w.config.name}</h3>
                  <p>{w.config.site || "Site not specified"}</p>
                </div>
                <Icon name="arrow" />
                <div className="card-meta">
                  <span>
                    {w.config.width} × {w.config.depth} m
                  </span>
                  <span>{generateLayout(w.config).capacity} locations</span>
                  <span>
                    {templates.find((t) => t.id === w.config.template)?.name}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {!!warehouses.length && (
        <button className="text-button" disabled={busy} onClick={createExample}>
          Add an example warehouse for exploration →
        </button>
      )}
      <DraftList />
      <ArchivedWarehouses onRestored={refresh} />
    </div>
  );
}
const numericFields: Record<
  number,
  {
    key: keyof WarehouseConfig;
    label: string;
    min: number;
    max: number;
    step?: number;
  }[]
> = {
  0: [
    { key: "width", label: "Building width (m)", min: 24, max: 140 },
    { key: "depth", label: "Building depth (m)", min: 24, max: 140 },
    { key: "inboundDoors", label: "Inbound dock doors", min: 1, max: 8 },
    { key: "stagingLanes", label: "Staging lanes", min: 1, max: 12 },
    {
      key: "qualityStations",
      label: "Quality inspection stations",
      min: 0,
      max: 4,
    },
    { key: "returnsLanes", label: "Returns lanes", min: 0, max: 4 },
    {
      key: "ceilingHeight",
      label: "Clear ceiling height (m)",
      min: 6,
      max: 18,
      step: 0.1,
    },
    { key: "yardDepth", label: "Truck yard depth (m)", min: 10, max: 30 },
  ],
  1: [
    { key: "aisles", label: "Aisles", min: 1, max: 12 },
    { key: "bays", label: "Bays per rack", min: 1, max: 20 },
    { key: "levels", label: "Levels per bay", min: 1, max: 6 },
    { key: "bins", label: "Bins per level", min: 1, max: 4 },
    {
      key: "aisleWidth",
      label: "Clear aisle width (m)",
      min: 2.4,
      max: 6,
      step: 0.1,
    },
  ],
  2: [
    { key: "packStations", label: "Packing stations", min: 1, max: 12 },
    { key: "outboundDoors", label: "Outbound dock doors", min: 1, max: 8 },
  ],
};
function NumberField({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setText(String(value));
  }
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (
          e.target.value !== "" &&
          n >= min &&
          n <= max &&
          (step !== 1 || Number.isInteger(n))
        )
          onChange(n);
      }}
      onBlur={() => {
        const n = Math.max(min, Math.min(max, Number(text) || value));
        const result = step === 1 ? Math.round(n) : Math.round(n * 10) / 10;
        setText(String(result));
        onChange(result);
      }}
    />
  );
}
function Builder() {
  const [draftParams, setDraftParams] = useSearchParams();
  const draftQuery = draftParams.get("draft");
  const draftMounted = useRef(true);
  useEffect(() => {
    draftMounted.current = true;
    return () => {
      draftMounted.current = false;
    };
  }, []);
  const draftRef = useRef<DesignDraft | null>(null),
    draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [draftContext, setDraftContext] = useState<DraftInput["context"]>(),
    [draftStatus, setDraftStatus] = useState("");

  const [designOpen, setDesignOpen] = useState(false);
  const [builderMode, setBuilderMode] = useState<ViewMode>("orbit");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const { id } = useParams(),
    navigate = useNavigate(),
    refresh = useSession((s) => s.refresh);
  const [config, setConfig] = useState<WarehouseConfig>({ ...defaultConfig }),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [existing, setExisting] = useState<Warehouse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (id) {
          const r = await api<{ warehouse: Warehouse }>("/warehouses/" + id);
          if (cancelled) return;
          setExisting(r.warehouse);
          if (!draftQuery) setConfig(r.warehouse.config);
        }
        if (draftQuery && draftRef.current?.id !== draftQuery) {
          const r = await api<{ draft: DesignDraft }>("/drafts/" + draftQuery);
          if (cancelled) return;
          if ((r.draft.warehouseId || undefined) !== id)
            throw new Error("This draft belongs to another warehouse.");
          draftRef.current = r.draft;
          setConfig(r.draft.config);
          setDraftContext(r.draft.context);
          setDesignOpen(r.draft.context.mode === "studio");
          setDraftStatus("Draft restored");
        }
      } catch (e) {
        if (!cancelled) setError(errorText(e));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, draftQuery]);
  const saveDraft = useCallback(
    (
      next: WarehouseConfig,
      context: DraftInput["context"] = { mode: "template" },
    ) => {
      setDraftStatus("Saving draft…");
      const operation = draftQueue.current
        .catch(() => undefined)
        .then(async () => {
          const current = draftRef.current;
          const r = await api<{ draft: DesignDraft }>(
            "/drafts" + (current ? "/" + current.id : ""),
            current ? "PUT" : "POST",
            {
              config: next,
              warehouseId: id,
              context,
              version: current?.version,
            },
          );
          draftRef.current = r.draft;
          setDraftStatus(
            "Draft saved · " +
              new Date(r.draft.updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
          );
          if (!current)
            setDraftParams({ draft: r.draft.id }, { replace: true });
        });
      draftQueue.current = operation;
      return operation.catch((e) => {
        setDraftStatus("Draft not saved · " + errorText(e));
        throw e;
      });
    },
    [id, setDraftParams],
  );
  const layout = generateLayout(config);
  const update = (key: keyof WarehouseConfig, value: string | number) =>
    setConfig((c) => ({ ...c, [key]: value }));
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ warehouse: Warehouse }>(
        "/warehouses" + (id ? "/" + id : ""),
        id ? "PUT" : "POST",
        { config, version: existing?.version },
      );
      await draftQueue.current.catch(() => undefined);
      if (draftRef.current) {
        try {
          await api("/drafts/" + draftRef.current.id + "/complete", "POST", {
            version: draftRef.current.version,
          });
        } catch {
          /* The warehouse is saved; retaining a draft is safe. */
        }
      }
      await refresh();
      navigate("/app/warehouses/" + result.warehouse.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const steps = ["Receive & stage", "Storage", "Pack & dispatch", "Review"];
  if (designOpen)
    return (
      <DesignEditor
        config={config}
        records={existing?.records || []}
        draftStatus={draftStatus}
        draftContext={draftContext}
        onSaveDraft={saveDraft}
        onClose={(next) => {
          if (next) setConfig(next);
          setDesignOpen(false);
        }}
        onApply={(next) => {
          setConfig(next);
          setDesignOpen(false);
          setStep(3);
        }}
      />
    );
  if (config.design)
    return (
      <div className="builder-page">
        <Link className="back-link" to={id ? "/app/warehouses/" + id : "/app"}>
          ← Back
        </Link>
        <div className="builder-title">
          <div>
            <span className="eyebrow">CUSTOM WAREHOUSE DESIGN</span>
            <h1>{config.name}</h1>
            <p>
              {config.design.floors.length} floors ·{" "}
              {layout.capacity.toLocaleString()} storage bins ·{" "}
              {layout.locations.length.toLocaleString()} mapped addresses
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setDesignOpen(true)}
          >
            Edit in 2D studio
          </button>
        </div>
        <div className="actions">
          <button
            className="button secondary small"
            onClick={() => {
              void saveDraft(config, { mode: "studio" }).catch(() => undefined);
            }}
          >
            Save draft
          </button>
          <span className="subtle" role="status">
            {draftStatus}
          </span>
        </div>
        <div className="design-review-scene">
          <SceneView
            config={config}
            records={existing?.records || []}
            designPreview
            mode={builderMode}
            onModeChange={setBuilderMode}
          />
        </div>
        {layout.errors.map((e) => (
          <p className="error" key={e}>
            {e}
          </p>
        ))}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button
            className="button"
            disabled={busy || layout.errors.length > 0}
            onClick={save}
          >
            {busy
              ? "Saving…"
              : id
                ? "Save warehouse design"
                : "Create warehouse"}
          </button>
        </div>
        <p className="subtle">
          Saved designs keep equipment, floor geometry and address mappings
          together. Existing inventory is validated before changes are accepted.
        </p>
      </div>
    );

  return (
    <div className="builder-page">
      <div className="builder-header">
        <Link className="back-link" to={id ? "/app/warehouses/" + id : "/app"}>
          ← {id ? "Back to warehouse" : "All warehouses"}
        </Link>
        <div className="actions">
          <button
            className="button secondary small"
            onClick={() => {
              void saveDraft(config).catch(() => undefined);
            }}
          >
            Save draft
          </button>
          <span className="subtle" role="status">
            {draftStatus}
          </span>
          <button
            className="button secondary small"
            disabled={!!id && !existing}
            onClick={() => setDesignOpen(true)}
          >
            Open 2D design studio
          </button>
        </div>
      </div>
      <div className="builder-title">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>{id ? "Refine your space." : "Map a new warehouse."}</h1>
        </div>
        <span className="subtle">Step {step + 1} of 4</span>
      </div>
      <div className="builder-steps">
        {steps.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={i === step ? "active" : ""}
          >
            <span>{i < step ? "✓" : i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <div className="builder-layout">
        <section className="builder-controls">
          <span className="eyebrow">
            0{step + 1} / {steps[step].toUpperCase()}
          </span>
          <h2>
            {
              [
                "A good arrival.",
                "A place for everything.",
                "Ready for the next stop.",
                "Your operation, assembled.",
              ][step]
            }
          </h2>
          <p>
            {
              [
                "Define the building and the receiving side of your operation.",
                "Configure repeating rack modules. Each aisle has two rack faces.",
                "Give packing teams and departing loads their own space.",
                "Check the footprint, capacity, and flow before saving.",
              ][step]
            }
          </p>
          {step === 0 && (
            <>
              <label>
                Warehouse name
                <input
                  value={config.name}
                  onChange={(e) => update("name", e.target.value)}
                  maxLength={80}
                  placeholder="e.g. East Distribution Center"
                />
              </label>
              <label>
                Site / address
                <input
                  value={config.site}
                  onChange={(e) => update("site", e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Atlanta, GA"
                />
              </label>
              <span className="field-label">Layout template</span>
              <div className="template-options">
                {templates.map((t) => (
                  <button
                    className={config.template === t.id ? "selected" : ""}
                    onClick={() => update("template", t.id)}
                    key={t.id}
                  >
                    <strong>{t.name}</strong>
                    <small>{t.description}</small>
                    <span>{config.template === t.id ? "●" : "○"}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step < 3 && (
            <div className="field-grid">
              {numericFields[step].map((f) => (
                <label key={f.key}>
                  {f.label}
                  <NumberField
                    value={Number(
                      config[f.key] ??
                        (f.key === "ceilingHeight"
                          ? Math.max(7.5, config.levels * 1.25 + 2.4)
                          : f.key === "yardDepth"
                            ? 12
                            : 0),
                    )}
                    min={f.min}
                    max={f.max}
                    step={f.step || 1}
                    onChange={(value) => update(f.key, value)}
                  />
                </label>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="field-grid">
              <label>
                Rack finish
                <select
                  value={config.rackFinish || "blue"}
                  onChange={(e) => update("rackFinish", e.target.value)}
                >
                  <option value="blue">CSCS blue</option>
                  <option value="graphite">Graphite steel</option>
                  <option value="teal">Industrial teal</option>
                </select>
              </label>
              <label>
                Floor finish
                <select
                  value={config.floorFinish || "concrete"}
                  onChange={(e) => update("floorFinish", e.target.value)}
                >
                  <option value="concrete">Concrete</option>
                  <option value="polished">Polished concrete</option>
                  <option value="slate">Slate gray</option>
                </select>
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="info-box">
              <strong>
                {layout.capacity.toLocaleString()} addressable storage locations
              </strong>
              <p>
                {config.aisles} aisles × 2 faces × {config.bays} bays ×{" "}
                {config.levels} levels × {config.bins} bins
              </p>
              <code>A01-L-B01-L01-01</code>
            </div>
          )}
          {step === 3 && (
            <LayoutPlacement config={config} onChange={setConfig} />
          )}
          {step === 3 && (
            <dl className="review-list">
              <div>
                <dt>Warehouse</dt>
                <dd>{config.name || "Name required"}</dd>
              </div>
              <div>
                <dt>Flow</dt>
                <dd>{templates.find((t) => t.id === config.template)?.name}</dd>
              </div>
              <div>
                <dt>Footprint</dt>
                <dd>
                  {config.width} × {config.depth} m
                </dd>
              </div>
              <div>
                <dt>Storage locations</dt>
                <dd>{layout.capacity.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Dock doors</dt>
                <dd>
                  {config.inboundDoors} inbound / {config.outboundDoors}{" "}
                  outbound
                </dd>
              </div>
              <div>
                <dt>Work areas</dt>
                <dd>
                  {config.stagingLanes} staging / {config.packStations} packing
                </dd>
              </div>
            </dl>
          )}
          {layout.errors.length > 0 && (
            <Notice>
              {layout.errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
              <button
                className="text-button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    width: Math.min(
                      140,
                      Math.ceil(
                        Math.max(
                          c.width,
                          layout.requiredWidth,
                          c.inboundDoors * 4 + 8,
                          c.outboundDoors * 4 + 8,
                          c.packStations * 2.8 + 8,
                          c.stagingLanes * 2.2 + 8,
                        ),
                      ),
                    ),
                    depth: Math.min(
                      140,
                      Math.ceil(Math.max(c.depth, layout.requiredDepth)),
                    ),
                  }))
                }
              >
                Expand footprint to fit →
              </button>
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}
          <div className="builder-actions">
            {step > 0 && (
              <button
                className="button secondary"
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button className="button" onClick={() => setStep((s) => s + 1)}>
                Continue <Icon name="arrow" />
              </button>
            ) : (
              <button
                className="button"
                disabled={
                  busy ||
                  !!layout.errors.length ||
                  config.name.trim().length < 2 ||
                  (!!id && !existing)
                }
                onClick={save}
              >
                {busy ? "Saving…" : id ? "Save layout" : "Create warehouse"}
                <Icon name="arrow" />
              </button>
            )}
          </div>
        </section>
        <section
          className={
            "builder-preview " +
            (previewExpanded ? "builder-preview-expanded" : "")
          }
        >
          <div className="preview-top">
            <span>
              <i className="dot" /> LIVE LAYOUT PREVIEW
            </span>
            <button
              className="view-tool"
              onClick={() => setPreviewExpanded((v) => !v)}
            >
              {previewExpanded ? "Close preview" : "Expand preview ↗"}
            </button>
          </div>
          <div className="builder-view-controls segmented">
            {(["orbit", "plan", "walk"] as ViewMode[]).map((view) => (
              <button
                key={view}
                className={builderMode === view ? "active" : ""}
                onClick={() => setBuilderMode(view)}
              >
                {view === "orbit"
                  ? "3D layout"
                  : view === "plan"
                    ? "Floor plan"
                    : "Walk inside"}
              </button>
            ))}
          </div>
          <SceneView
            config={config}
            designPreview
            mode={builderMode}
            onModeChange={setBuilderMode}
            onSelect={(id) => {
              const loc = layout.locations.find((l) => l.id === id);
              if (loc)
                setStep(
                  loc.zone === "storage"
                    ? 1
                    : loc.zone === "packing" || loc.zone === "outbound"
                      ? 2
                      : 0,
                );
            }}
            focus={
              step === 0
                ? undefined
                : step === 1
                  ? "storage"
                  : step === 2
                    ? "packing"
                    : undefined
            }
          />
          <div className="preview-stats">
            <div>
              <strong>
                {(config.width * config.depth).toLocaleString()} m²
              </strong>
              <span>Building footprint</span>
            </div>
            <div>
              <strong>{layout.capacity}</strong>
              <span>Storage locations</span>
            </div>
            <div>
              <strong>{config.levels}</strong>
              <span>Rack levels</span>
            </div>
          </div>
          <p className="preview-hint">
            Illustrative stock & equipment · Click a module to configure its
            area
          </p>
        </section>
      </div>
    </div>
  );
}
function RecordEditor({
  warehouse,
  location,
  record,
  onClose,
  onSaved,
}: {
  warehouse: Warehouse;
  location: Location;
  record?: OperationalRecord;
  onClose: () => void;
  onSaved: (w: Warehouse) => void;
}) {
  const defaultKind =
    location.zone === "storage"
      ? "Inventory"
      : location.zone === "packing"
        ? "Packing task"
        : location.zone === "staging"
          ? "Handling unit"
          : "Truck";
  const [draft, setDraft] = useState<OperationalRecord>(
    record || {
      id: "",
      kind: defaultKind,
      label: "",
      status: allowedStatuses[defaultKind][0],
      locationId: location.id,
      sku: "",
      quantity: 0,
      reference: "",
      destination: "",
      scheduledAt: "",
      notes: "",
      source: "Manual",
    },
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    layout = generateLayout(warehouse.config);
  const update = (key: keyof OperationalRecord, value: string | number) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const permitted: Record<string, Zone[]> = {
    Inventory: ["storage"],
    Truck: ["inbound", "outbound"],
    "Handling unit": ["staging", "storage", "outbound"],
    "Packing task": ["packing"],
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ warehouse: Warehouse }>(
        "/warehouses/" +
          warehouse.id +
          "/records" +
          (record ? "/" + encodeURIComponent(record.id) : ""),
        record ? "PUT" : "POST",
        { version: warehouse.version, record: { ...draft, source: "Manual" } },
      );
      onSaved(result.warehouse);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={record ? "Edit record" : "Add a record"} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field-grid">
          <label>
            Record type
            <select
              value={draft.kind}
              disabled={!!record}
              onChange={(e) => {
                const kind = e.target.value as OperationalRecord["kind"];
                setDraft((d) => ({
                  ...d,
                  kind,
                  status: allowedStatuses[kind][0],
                  locationId: layout.locations.find((l) =>
                    permitted[kind].includes(l.zone),
                  )!.id,
                }));
              }}
            >
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            ID
            <input
              required
              maxLength={64}
              value={draft.id}
              disabled={!!record}
              onChange={(e) => update("id", e.target.value)}
              placeholder="Unique record ID"
            />
          </label>
        </div>
        <label>
          Label
          <input
            required
            maxLength={100}
            value={draft.label}
            onChange={(e) => update("label", e.target.value)}
          />
        </label>
        <div className="field-grid">
          <label>
            Status
            <select
              value={draft.status}
              onChange={(e) => update("status", e.target.value)}
            >
              {allowedStatuses[draft.kind].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Location
            <select
              value={draft.locationId}
              onChange={(e) => update("locationId", e.target.value)}
            >
              {layout.locations
                .filter((l) => permitted[draft.kind].includes(l.zone))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
            </select>
          </label>
          <label>
            SKU
            <input
              maxLength={64}
              value={draft.sku}
              onChange={(e) => update("sku", e.target.value)}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min={0}
              max={1000000}
              required
              value={draft.quantity}
              onChange={(e) => update("quantity", Number(e.target.value))}
            />
          </label>
          <label>
            Batch / lot
            <input
              maxLength={80}
              value={draft.batch || ""}
              onChange={(e) => update("batch", e.target.value)}
            />
          </label>
          <label>
            Unit of measure
            <input
              maxLength={20}
              value={draft.unit || ""}
              placeholder="units"
              onChange={(e) => update("unit", e.target.value)}
            />
          </label>
          <label>
            Reference / order / ASN (optional)
            <input
              maxLength={80}
              value={draft.reference}
              onChange={(e) => update("reference", e.target.value)}
            />
          </label>
          <label>
            Destination
            <input
              maxLength={120}
              value={draft.destination}
              onChange={(e) => update("destination", e.target.value)}
            />
          </label>
        </div>
        <label>
          Scheduled arrival / departure
          <input
            type="datetime-local"
            value={
              draft.scheduledAt
                ? new Date(
                    new Date(draft.scheduledAt).getTime() -
                      new Date(draft.scheduledAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : ""
            }
            onChange={(e) =>
              update(
                "scheduledAt",
                e.target.value ? new Date(e.target.value).toISOString() : "",
              )
            }
          />
        </label>
        <label>
          Notes
          <textarea
            maxLength={1000}
            rows={3}
            value={draft.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </label>
        {error && <Notice>{error}</Notice>}
        {draft.kind === "Truck" && (
          <div className="manifest-editor">
            <h3>Cargo manifest</h3>
            <p className="subtle">
              Individual cargo lines associated with this truck.
            </p>
            {(draft.cargo || []).map((item, index) => (
              <div className="manifest-line" key={index}>
                <input
                  aria-label={"Cargo ID " + (index + 1)}
                  placeholder="Cargo ID"
                  required
                  maxLength={64}
                  value={item.id}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      cargo: d.cargo!.map((c, i) =>
                        i === index ? { ...c, id: e.target.value } : c,
                      ),
                    }))
                  }
                />
                <input
                  aria-label={"Cargo SKU " + (index + 1)}
                  placeholder="SKU"
                  required
                  maxLength={64}
                  value={item.sku}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      cargo: d.cargo!.map((c, i) =>
                        i === index ? { ...c, sku: e.target.value } : c,
                      ),
                    }))
                  }
                />
                <input
                  aria-label={"Cargo quantity " + (index + 1)}
                  type="number"
                  min={1}
                  max={1000000}
                  required
                  value={item.quantity}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      cargo: d.cargo!.map((c, i) =>
                        i === index
                          ? { ...c, quantity: Number(e.target.value) }
                          : c,
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  aria-label={"Remove cargo line " + (index + 1)}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      cargo: d.cargo!.filter((_, i) => i !== index),
                    }))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={(draft.cargo?.length || 0) >= 100}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  cargo: [...(d.cargo || []), { id: "", sku: "", quantity: 1 }],
                }))
              }
            >
              + Add cargo line
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Saving…" : "Save record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function AddressJump({
  config,
  onSelect,
}: {
  config: WarehouseConfig;
  onSelect: (id: string) => void;
}) {
  const [address, setAddress] = useState({
    aisle: 1,
    side: "L",
    bay: 1,
    level: 1,
    bin: 1,
  });
  const fields = [
    ["aisle", "Aisle", config.aisles],
    ["bay", "Bay", config.bays],
    ["level", "Level", config.levels],
    ["bin", "Bin", config.bins],
  ] as const;
  return (
    <form
      className="address-jump"
      onSubmit={(e) => {
        e.preventDefault();
        const pad = (n: number) => String(n).padStart(2, "0");
        onSelect(
          "A" +
            pad(address.aisle) +
            "-" +
            address.side +
            "-B" +
            pad(address.bay) +
            "-L" +
            pad(address.level) +
            "-" +
            pad(address.bin),
        );
      }}
    >
      <div>
        <strong>Go to an exact bin</strong>
        <small>Choose its full storage address.</small>
      </div>
      {fields.map(([key, label, max]) => (
        <label key={key}>
          {label}
          <select
            value={address[key]}
            onChange={(e) =>
              setAddress((a) => ({ ...a, [key]: Number(e.target.value) }))
            }
          >
            {Array.from({ length: max }, (_, i) => (
              <option key={i} value={i + 1}>
                {String(i + 1).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Rack face
        <select
          value={address.side}
          onChange={(e) => setAddress((a) => ({ ...a, side: e.target.value }))}
        >
          <option value="L">Left</option>
          <option value="R">Right</option>
        </select>
      </label>
      <button className="button small">Inspect bin →</button>
    </form>
  );
}
function Twin({ preview = false }: { preview?: boolean }) {
  const [directoryPage, setDirectoryPage] = useState({ key: "", index: 0 });
  const [capacityLocation, setCapacityLocation] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<"import" | "mappings" | null>(null);
  const [operation, setOperation] = useState<{
    record: OperationalRecord;
    type: Operation["type"];
  } | null>(null);
  const modelExporter = useRef<(() => Promise<Blob>) | null>(null);
  const [expanded, setExpanded] = useState(false),
    [exporting, setExporting] = useState(false);
  const { id } = useParams(),
    [warehouse, setWarehouse] = useState<Warehouse | null>(() => {
      if (!preview) return null;
      const seed = exampleWarehouse();
      return {
        id: "preview",
        ...seed,
        version: 1,
        events: [],
        createdAt: "",
        updatedAt: "",
      };
    }),
    [error, setError] = useState("");
  const [zone, setZone] = useState<Zone | "all">("all"),
    [selected, setSelected] = useState(""),
    [mode, setMode] = useState<ViewMode>("orbit"),
    [query, setQuery] = useState(""),
    [editor, setEditor] = useState<{
      location: Location;
      record?: OperationalRecord;
    } | null>(null),
    [tab, setTab] = useState<"locations" | "records">("locations"),
    [tour, setTour] = useState(false),
    [deleting, setDeleting] = useState(false);
  const navigate = useNavigate(),
    refresh = useSession((s) => s.refresh);
  const load = useCallback(
    () =>
      api<{ warehouse: Warehouse }>("/warehouses/" + id)
        .then((r) => setWarehouse(r.warehouse))
        .catch((e) => setError(errorText(e))),
    [id],
  );
  useEffect(() => {
    if (!preview) void load();
  }, [load, preview]);
  if (!warehouse)
    return (
      <div className="page">
        {error ? (
          <Notice>
            {error} <Link to="/app">Return to warehouses</Link>
          </Notice>
        ) : (
          <div className="full-loading">Assembling warehouse…</div>
        )}
      </div>
    );
  const summary = operationalSummary(warehouse);
  const layout = generateLayout(warehouse.config),
    locationById = new Map(layout.locations.map((l) => [l.id, l])),
    occupiedLocations = new Set(
      warehouse.records
        .filter(
          (r) =>
            r.quantity > 0 &&
            r.kind !== "Truck" &&
            !["Expected", "Dispatched"].includes(r.status),
        )
        .map((r) => r.locationId),
    ),
    location = layout.locations.find((l) => l.id === selected),
    records = warehouse.records.filter((r) => r.locationId === selected);
  const visibleLocations = layout.locations.filter(
    (l) =>
      (zone === "all" || l.zone === zone) &&
      (l.code + " " + l.label).toLowerCase().includes(query.toLowerCase()),
  );
  const visibleRecords = warehouse.records.filter(
    (r) =>
      (zone === "all" || locationById.get(r.locationId)?.zone === zone) &&
      (
        r.id +
        " " +
        r.label +
        " " +
        r.sku +
        " " +
        r.reference +
        " " +
        r.batch +
        " " +
        r.status +
        " " +
        r.destination
      )
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const directoryKey = [warehouse.id, warehouse.version, zone, tab, query].join(
    "|",
  );
  const directoryCount =
    tab === "locations" ? visibleLocations.length : visibleRecords.length;
  const pageSize = tab === "locations" ? 200 : 100;
  const pageCount = Math.max(1, Math.ceil(directoryCount / pageSize));
  const pageIndex = Math.min(
    directoryPage.key === directoryKey ? directoryPage.index : 0,
    pageCount - 1,
  );
  function visit(next: Zone | "all") {
    setZone(next);
    setSelected("");
    setQuery("");
  }
  const tourZone =
    zone === "all" ? zones[0] : zones.find((z) => z.id === zone)!;
  async function remove(record: OperationalRecord) {
    if (
      !window.confirm(
        "Remove " + record.id + "? This will be recorded in activity.",
      )
    )
      return;
    try {
      const result = await api<{ warehouse: Warehouse }>(
        "/warehouses/" +
          warehouse!.id +
          "/records/" +
          encodeURIComponent(record.id),
        "DELETE",
        { version: warehouse!.version },
      );
      setWarehouse(result.warehouse);
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function deleteWarehouse() {
    if (
      !window.confirm(
        "Archive this warehouse and its records? You can restore it from the dashboard.",
      )
    )
      return;
    setDeleting(true);
    try {
      await api("/warehouses/" + warehouse!.id, "DELETE", {
        version: warehouse!.version,
      });
      await refresh();
      navigate("/app");
    } catch (e) {
      setError(errorText(e));
      setDeleting(false);
    }
  }
  return (
    <div className={"twin-page " + (preview ? "preview-page" : "")}>
      {preview && (
        <header className="preview-nav">
          <Brand />
          <Link className="button small" to="/auth?mode=register">
            Create your own workspace <Icon name="arrow" />
          </Link>
        </header>
      )}
      <header className="twin-header">
        <div>
          <Link className="back-link" to={preview ? "/" : "/app"}>
            ← {preview ? "Back to website" : "Warehouses"}
          </Link>
          <h1>{warehouse.config.name}</h1>
          <p>
            {warehouse.config.site} <span>·</span> {warehouse.config.width} ×{" "}
            {warehouse.config.depth} m <span>·</span> {layout.capacity} storage
            locations
          </p>
        </div>
        <div className="actions">
          {!preview && (
            <>
              <button
                className="button secondary small"
                onClick={() => setWorkflow("mappings")}
              >
                Map locations
              </button>
              <button
                className="button secondary small"
                onClick={() => setWorkflow("import")}
              >
                Import CSV
              </button>
            </>
          )}
          {!preview && (
            <Link
              className="button secondary small"
              to={"/app/warehouses/" + id + "/edit"}
            >
              Edit layout
            </Link>
          )}
          <button
            className="button small"
            onClick={() => {
              setTour((v) => !v);
              visit("inbound");
            }}
          >
            {tour ? "End guided tour" : "Take a guided tour"}{" "}
            <Icon name="arrow" />
          </button>
        </div>
      </header>
      {error && (
        <Notice>
          {error}
          <button
            className="text-button"
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Reload warehouse
          </button>
        </Notice>
      )}
      <nav className="zone-nav">
        <button
          className={zone === "all" ? "active" : ""}
          onClick={() => visit("all")}
        >
          <Icon name="grid" />
          Overview
        </button>
        {zones.map((z, i) => (
          <button
            key={z.id}
            className={zone === z.id ? "active" : ""}
            onClick={() => visit(z.id)}
          >
            <span className="zone-number">0{i + 1}</span>
            {z.name}
            <span className="zone-count">
              {
                warehouse.records.filter(
                  (r) =>
                    layout.locations.find((l) => l.id === r.locationId)
                      ?.zone === z.id,
                ).length
              }
            </span>
          </button>
        ))}
      </nav>
      {!preview && (
        <AutomationPanel warehouse={warehouse} onChange={setWarehouse} />
      )}
      <div className="twin-layout">
        <section
          className={"viewport " + (expanded ? "viewport-expanded" : "")}
        >
          <div className="viewport-controls">
            <div className="segmented">
              {(["orbit", "plan", "walk"] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  className={mode === m ? "active" : ""}
                  onClick={() => setMode(m)}
                >
                  {m === "orbit"
                    ? "3D view"
                    : m === "plan"
                      ? "Top view"
                      : "Walk"}
                </button>
              ))}
            </div>
            <div className="viewport-tools">
              <button
                className="view-tool"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Close expanded view" : "Expand view ↗"}
              </button>
              <span className="pill">
                {preview
                  ? "EXAMPLE WAREHOUSE"
                  : warehouse.records.some((r) => r.source === "Example")
                    ? "CONTAINS EXAMPLE DATA"
                    : warehouse.records.some((r) => r.source === "Imported")
                      ? "IMPORTED / MANUAL DATA"
                      : "MANUAL DATA"}
                <i className="dot" />
              </span>
            </div>
          </div>
          <SceneView
            config={warehouse.config}
            automation={warehouse.automation}
            records={warehouse.records}
            selected={selected}
            focus={zone === "all" ? undefined : zone}
            mode={mode}
            onSelect={setSelected}
            onModeChange={setMode}
            onModelReady={(exporter) => {
              modelExporter.current = exporter;
            }}
          />
          {tour && (
            <div className="tour-card">
              <span className="eyebrow">
                GUIDED TOUR / 0{zones.indexOf(tourZone) + 1}
              </span>
              <h2>{tourZone.name}</h2>
              <p>
                {tourZone.description}{" "}
                {
                  [
                    "Select a dock to inspect the assigned truck and its cargo notes.",
                    "Inspect a handling unit to see its status and next destination.",
                    "Choose a location by aisle, face, bay, level, and bin to inspect inventory.",
                    "Select a station to view its order, quantity, and shipping destination.",
                    "Inspect a departure dock to see the shipment reference and schedule.",
                  ][zones.indexOf(tourZone)]
                }
              </p>
              <div>
                <button
                  className="text-button"
                  onClick={() => {
                    const i = zones.indexOf(tourZone);
                    if (i > 0) visit(zones[i - 1].id);
                  }}
                  disabled={zones.indexOf(tourZone) === 0}
                >
                  ← Previous
                </button>
                <button
                  className="button small"
                  onClick={() => {
                    const i = zones.indexOf(tourZone);
                    if (i < 4) visit(zones[i + 1].id);
                    else {
                      setTour(false);
                      visit("all");
                    }
                  }}
                >
                  {zones.indexOf(tourZone) === 4 ? "Finish tour" : "Next area"}{" "}
                  →
                </button>
              </div>
            </div>
          )}
          <div className="viewport-footer">
            <span>
              {mode === "walk"
                ? "WASD / arrow keys to move · Drag to look · Switch view to select a bin"
                : mode === "plan"
                  ? "Drag to pan · Scroll to zoom · Click a location to inspect"
                  : "Drag to orbit · Scroll to zoom · Click a location to inspect"}
            </span>
            <span>{selected || "WAREHOUSE OVERVIEW"}</span>
          </div>
        </section>
        <aside className="inspector">
          <div className="inspector-heading">
            <span className="eyebrow">
              {location ? "LOCATION INSPECTOR" : "YOUR WAREHOUSE"}
            </span>
            <h2>{location?.code || "Every detail has a place."}</h2>
            <p>
              {location
                ? location.label
                : "Choose an area or select a location to see the operational records behind it."}
            </p>
          </div>
          {location ? (
            <>
              <div className="location-summary">
                <span className="pill">
                  {zones.find((z) => z.id === location.zone)?.name}
                </span>
                <span>
                  {records.length} record{records.length === 1 ? "" : "s"}
                </span>
              </div>
              {records.length ? (
                records.map((r) => (
                  <article className="record-card" key={r.id}>
                    <div>
                      <span
                        className={
                          "status " + (r.status === "On hold" ? "warning" : "")
                        }
                      >
                        {r.status}
                      </span>
                      <span className="source">{r.source}</span>
                    </div>
                    <h3>{r.label}</h3>
                    <code>{r.id}</code>
                    <dl>
                      <div>
                        <dt>Type</dt>
                        <dd>{r.kind}</dd>
                      </div>
                      <div>
                        <dt>Quantity</dt>
                        <dd>
                          {r.quantity} {r.unit || "units"}
                        </dd>
                      </div>
                      {r.sku && (
                        <div>
                          <dt>SKU</dt>
                          <dd>{r.sku}</dd>
                        </div>
                      )}
                      {r.reference && (
                        <div>
                          <dt>Reference</dt>
                          <dd>{r.reference}</dd>
                        </div>
                      )}
                      {r.destination && (
                        <div>
                          <dt>Destination</dt>
                          <dd>{r.destination}</dd>
                        </div>
                      )}
                      {r.scheduledAt && (
                        <div>
                          <dt>Scheduled</dt>
                          <dd>{new Date(r.scheduledAt).toLocaleString()}</dd>
                        </div>
                      )}
                    </dl>
                    {r.notes && <p>{r.notes}</p>}
                    {!!r.cargo?.length && (
                      <div className="cargo-list">
                        <h4>Cargo manifest</h4>
                        {r.cargo.map((c) => (
                          <div key={c.id}>
                            <code>{c.id}</code>
                            <span>{c.sku}</span>
                            <strong>{c.quantity} units</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {!preview && (
                      <div className="operation-buttons">
                        {availableOperations(r).map((type) => (
                          <button
                            className="button secondary small"
                            key={type}
                            onClick={() => setOperation({ record: r, type })}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                    {!preview && (
                      <div className="record-actions">
                        <button
                          className="text-button"
                          onClick={() => setEditor({ location, record: r })}
                        >
                          Edit record
                        </button>
                        <button
                          className="text-button danger"
                          onClick={() => void remove(r)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <div className="location-empty">
                  <Icon />
                  <h3>No records at this location.</h3>
                  <p>
                    {preview
                      ? "Explore the other example locations."
                      : "Add a record to bring operational context into this space."}
                  </p>
                </div>
              )}
              {!preview && (
                <button
                  className="button full"
                  onClick={() => setEditor({ location })}
                >
                  <Icon name="plus" />
                  Add record here
                </button>
              )}
              {!preview && !["inbound", "outbound"].includes(location.zone) && (
                <button
                  className="button secondary full"
                  onClick={() => setCapacityLocation(location.id)}
                >
                  Set location capacity
                </button>
              )}
              {summary.capacities
                .filter((r) => r.locationId === location.id)
                .map((r) => (
                  <p className="capacity-readout" key={r.locationId}>
                    Location capacity:{" "}
                    <strong>
                      {r.used} / {r.capacity} {r.unit}
                    </strong>
                  </p>
                ))}
              <button className="text-button" onClick={() => setSelected("")}>
                Clear selection
              </button>
            </>
          ) : (
            <>
              <div className="inspector-metrics">
                <div>
                  <strong>{layout.capacity}</strong>
                  <span>Storage locations</span>
                </div>
                <div>
                  <strong>{warehouse.records.length}</strong>
                  <span>Records</span>
                </div>
              </div>
              <div className="address-guide">
                <span className="eyebrow">A LOCATION YOU CAN READ</span>
                <code>A01-L-B01-L01-01</code>
                <p>Aisle · Rack face · Bay · Level · Bin</p>
                <small>
                  Use the directory below to find an exact address. All
                  locations are generated from your layout.
                </small>
              </div>
              <div className="data-note">
                <span className="dot" />{" "}
                {preview
                  ? "Clearly labeled example data"
                  : "Saved manual, imported, and labeled example records"}
                <p>
                  {preview
                    ? "This warehouse is for exploration. Create a workspace to save your own."
                    : "SCOTI is not connected. Movement is represented by saved locations and statuses."}
                </p>
              </div>
            </>
          )}
        </aside>
      </div>
      <OperationsOverview
        summary={summary}
        onSelect={(id) => {
          setSelected(id);
          setZone("all");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      <section className="directory">
        <div className="list-heading">
          <div className="segmented">
            <button
              className={tab === "locations" ? "active" : ""}
              onClick={() => setTab("locations")}
            >
              Location directory
            </button>
            <button
              className={tab === "records" ? "active" : ""}
              onClick={() => setTab("records")}
            >
              Operational records
            </button>
          </div>
          <input
            className="search"
            aria-label="Search locations or records"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "locations"
                ? "Find an address, e.g. A01-L-B01"
                : "Find an ID, SKU, or reference"
            }
          />
        </div>
        {tab === "locations" && (
          <AddressJump
            config={warehouse.config}
            onSelect={(id) => {
              setSelected(id);
              setZone("storage");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
        {tab === "locations" ? (
          <div className="location-grid">
            {visibleLocations
              .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
              .map((l) => (
                <button
                  key={l.id}
                  className={selected === l.id ? "selected" : ""}
                  onClick={() => {
                    setSelected(l.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <span
                    className="location-dot"
                    style={{
                      background: occupiedLocations.has(l.id)
                        ? "#367fe8"
                        : "#ced9e5",
                    }}
                  />
                  <strong>{l.code}</strong>
                  <small>
                    {l.zone === "storage" ? "Storage bin" : l.label}
                  </small>
                </button>
              ))}
            {!visibleLocations.length && <p>No matching locations.</p>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID / label</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Quantity</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords
                  .slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
                  .map((r) => (
                    <tr key={r.id} onClick={() => setSelected(r.locationId)}>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(r.locationId);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          {r.id}
                        </button>
                        <small>{r.label}</small>
                      </td>
                      <td>{r.kind}</td>
                      <td>
                        <code>{r.locationId}</code>
                      </td>
                      <td>
                        <span className="status">{r.status}</span>
                      </td>
                      <td>
                        {r.quantity} {r.unit || "units"}
                      </td>
                      <td>{r.source}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!visibleRecords.length && (
              <p className="subtle">No matching records.</p>
            )}
          </div>
        )}
        {pageCount > 1 && (
          <nav className="directory-pagination" aria-label="Directory pages">
            <button
              className="button secondary small"
              disabled={pageIndex === 0}
              onClick={() =>
                setDirectoryPage({ key: directoryKey, index: pageIndex - 1 })
              }
            >
              Previous page
            </button>
            <span aria-live="polite">
              Page {pageIndex + 1} of {pageCount} · {directoryCount} matches
            </span>
            <button
              className="button secondary small"
              disabled={pageIndex === pageCount - 1}
              onClick={() =>
                setDirectoryPage({ key: directoryKey, index: pageIndex + 1 })
              }
            >
              Next page
            </button>
          </nav>
        )}
        <div className="directory-footer">
          <button
            className="text-button"
            disabled={exporting}
            onClick={async () => {
              if (!modelExporter.current) {
                setError("The 3D model is not available yet.");
                return;
              }
              setExporting(true);
              try {
                const blob = await modelExporter.current();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = warehouse.config.name + ".glb";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Preparing model…" : "Export 3D model (.glb) ↓"}
          </button>
          <span>
            {tab === "locations"
              ? visibleLocations.length
              : visibleRecords.length}{" "}
            matching {tab}
            {directoryCount > pageSize
              ? " · Use the page controls to browse every match."
              : ""}
          </span>
          {!preview && (
            <div>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    warehouse.config.name + "-layout.json",
                    JSON.stringify(
                      { config: warehouse.config, locations: layout.locations },
                      null,
                      2,
                    ),
                    "application/json",
                  )
                }
              >
                Export layout ↓
              </button>
              <button
                className="text-button"
                onClick={() => {
                  download(
                    warehouse.config.name + "-records.csv",
                    exportCsv(warehouse.records),
                    "text/csv",
                  );
                }}
              >
                Export records ↓
              </button>
            </div>
          )}
        </div>
      </section>
      {!preview && (
        <details className="warehouse-management">
          <summary>Warehouse management & activity</summary>
          <div className="activity-list">
            {[...warehouse.events]
              .reverse()
              .slice(0, 10)
              .map((e) => (
                <div key={e.id}>
                  <span className="dot" />
                  <div>
                    <strong>{e.action}</strong>
                    <p>{e.message}</p>
                    <small>
                      {e.actor} · {new Date(e.at).toLocaleString()}
                    </small>
                  </div>
                </div>
              ))}
          </div>
          <button
            className="text-button danger"
            disabled={deleting}
            onClick={deleteWarehouse}
          >
            {deleting ? "Archiving…" : "Archive warehouse"}
          </button>
        </details>
      )}
      {capacityLocation && (
        <CapacityDialog
          warehouse={warehouse}
          locationId={capacityLocation}
          onClose={() => setCapacityLocation(null)}
          onSaved={setWarehouse}
        />
      )}
      {workflow === "import" && (
        <CsvImport
          warehouse={warehouse}
          onClose={() => setWorkflow(null)}
          onSaved={setWarehouse}
        />
      )}
      {workflow === "mappings" && (
        <LocationMappings
          warehouse={warehouse}
          onClose={() => setWorkflow(null)}
          onSaved={setWarehouse}
        />
      )}
      {operation && (
        <OperationDialog
          warehouse={warehouse}
          record={operation.record}
          type={operation.type}
          onClose={() => setOperation(null)}
          onSaved={setWarehouse}
        />
      )}
      {editor && (
        <RecordEditor
          warehouse={warehouse}
          location={editor.location}
          record={editor.record}
          onClose={() => setEditor(null)}
          onSaved={setWarehouse}
        />
      )}
    </div>
  );
}
function Activity() {
  const { warehouses, refresh } = useSession(),
    [error, setError] = useState("");
  useEffect(() => {
    refresh().catch((e) => setError(errorText(e)));
  }, [refresh]);
  const entries = warehouses
    .flatMap((w) =>
      w.events.map((e) => ({
        ...e,
        warehouse: w.config.name,
        warehouseId: w.id,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE HISTORY</span>
          <h1>Activity</h1>
          <p>A clear record of changes across your warehouses.</p>
        </div>
      </header>
      {error && <Notice>{error}</Notice>}
      <div className="activity-list">
        {entries.map((e) => (
          <div key={e.id}>
            <span className="dot" />
            <div>
              <strong>
                {e.action}{" "}
                <Link to={"/app/warehouses/" + e.warehouseId}>
                  {e.warehouse}
                </Link>
              </strong>
              <p>{e.message}</p>
              <small>
                {e.actor} · {new Date(e.at).toLocaleString()}
              </small>
            </div>
          </div>
        ))}
        {!entries.length && (
          <div className="empty-state">
            <h2>No activity yet.</h2>
            <p>Changes will appear after you create a warehouse.</p>
          </div>
        )}
      </div>
    </div>
  );
}
function Connections() {
  return (
    <div className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">OPERATIONAL CONTEXT</span>
          <h1>Connections</h1>
          <p>Bring your system of record into your spatial workspace.</p>
        </div>
      </header>
      <article className="connection-card">
        <div className="connection-logo">SCOTI™</div>
        <span className="pill">NOT CONNECTED</span>
        <h2>Your warehouse, with SCOTI context.</h2>
        <p>
          Inventory, receiving, packing, and shipment data can be mapped to
          stable warehouse locations once an approved SCOTI interface and field
          mapping are available.
        </p>
        <div className="info-box">
          <strong>Manual records are available now.</strong>
          <p>
            Add records directly to any location in your warehouse. A SCOTI
            connector has not been implemented or activated.
          </p>
        </div>
        <h3>What is needed to enable a connection</h3>
        <ol>
          <li>
            An approved API or export format from your SCOTI administrator.
          </li>
          <li>A mapping between SCOTI location IDs and warehouse addresses.</li>
          <li>
            Authentication, synchronization rules, and an agreed source of
            truth.
          </li>
        </ol>
        <Link className="button secondary" to="/app">
          Open your warehouses <Icon name="arrow" />
        </Link>
      </article>
    </div>
  );
}
export function App() {
  const initialize = useSession((s) => s.initialize);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/preview" element={<Twin preview />} />
        <Route path="/app" element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="new" element={<Builder />} />
          <Route path="warehouses/:id" element={<Twin />} />
          <Route path="warehouses/:id/edit" element={<Builder />} />
          <Route path="activity" element={<Activity />} />
          <Route path="connections" element={<Connections />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="empty-state">
              <h1>Page not found.</h1>
              <Link className="button" to="/">
                Return home
              </Link>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
