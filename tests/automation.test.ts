import test from "node:test";
import assert from "node:assert/strict";
import { applyAutomation, createAutomation } from "../src/domain/automation.ts";
import { createModule, outlineTemplate } from "../src/domain/design.ts";
import { defaultConfig, generateLayout } from "../src/domain/warehouse.ts";
import { createApplication } from "../server/index.ts";
function fixture() {
  const robot = createModule("amr", "robot-one", 1, -6, -6);
  robot.route = [
    { x: -6, z: -6 },
    { x: 2, z: -6 },
  ];
  robot.speed = 1;
  return {
    ...defaultConfig,
    name: "Automation test",
    design: {
      version: 1 as const,
      grid: 0.5,
      floors: [
        {
          id: "floor-1",
          name: "Ground",
          height: 8,
          outline: outlineTemplate(
            "rectangle",
            defaultConfig.width,
            defaultConfig.depth,
          ),
          modules: [robot],
        },
      ],
    },
  };
}
test("simulation is deterministic, returns home, queues circuits and does not mutate its input", () => {
  const c = fixture(),
    initial = createAutomation(c);
  let n = 0;
  const id = () => `mission-${++n}`;
  let state = applyAutomation(
    c,
    initial,
    { type: "enqueue", robotId: "robot-one", priority: 3 },
    id,
  );
  state = applyAutomation(
    c,
    state,
    { type: "enqueue", robotId: "robot-one", priority: 5 },
    id,
  );
  assert.deepEqual(initial.missions, []);
  assert.throws(
    () => applyAutomation(c, state, { type: "step", seconds: 1 }, id),
    /Resume/,
  );
  state = applyAutomation(c, state, { type: "pause", paused: false }, id);
  const result = applyAutomation(c, state, { type: "step", seconds: 30 }, id);
  assert.deepEqual(
    result,
    applyAutomation(c, state, { type: "step", seconds: 30 }, id),
  );
  assert.equal(result.missions[1].status, "Completed");
  assert.equal(result.missions[0].status, "Running");
  assert.ok(result.robots[0].battery < 100);
  const complete = applyAutomation(
    c,
    result,
    { type: "step", seconds: 10 },
    id,
  );
  assert.ok(complete.missions.every((m) => m.status === "Completed"));
  assert.ok(
    Math.hypot(complete.robots[0].x + 6, complete.robots[0].z + 6) < 0.00001,
  );
  assert.throws(
    () =>
      applyAutomation(
        { ...c, design: { ...c.design, grid: 1 } },
        complete,
        { type: "step", seconds: 1 },
        id,
      ),
    /design changed/,
  );
});
test("robot footprint, traffic holds, pause, cancellation and charge location are guarded", () => {
  const c = fixture(),
    other = createModule("agv", "robot-two", 2, -2, -6);
  c.design.floors[0].modules.push(other);
  let state = applyAutomation(
    c,
    undefined,
    { type: "enqueue", robotId: "robot-one", priority: 3 },
    () => "m1",
  );
  state = applyAutomation(
    c,
    state,
    { type: "pause", paused: false },
    () => "m2",
  );
  state = applyAutomation(c, state, { type: "step", seconds: 10 }, () => "m3");
  assert.equal(state.robots[0].status, "Traffic hold");
  assert.ok(state.robots[0].x < -3);
  const paused = applyAutomation(
    c,
    state,
    { type: "enable", robotId: "robot-one", enabled: false },
    () => "m4",
  );
  assert.equal(
    applyAutomation(c, paused, { type: "step", seconds: 1 }, () => "m5")
      .robots[0].x,
    paused.robots[0].x,
  );
  const cancelled = applyAutomation(
    c,
    state,
    { type: "cancel", missionId: "m1" },
    () => "m6",
  );
  assert.equal(cancelled.missions[0].status, "Cancelled");
  assert.throws(
    () =>
      applyAutomation(
        c,
        cancelled,
        { type: "enqueue", robotId: "robot-one", priority: 3 },
        () => "m7",
      ),
    /away/,
  );
  assert.throws(
    () =>
      applyAutomation(
        c,
        cancelled,
        { type: "charge", robotId: "robot-one" },
        () => "m8",
      ),
    /beside a charger/,
  );
  c.design.floors[0].modules[0].route[1] = {
    x: defaultConfig.width / 2 - 0.1,
    z: -6,
  };
  assert.throws(
    () =>
      applyAutomation(
        c,
        undefined,
        { type: "enqueue", robotId: "robot-one", priority: 3 },
        () => "m9",
      ),
    /footprint/,
  );
});
test("low battery holds a mission, charging only occurs beside a free charger", () => {
  const c = fixture();
  c.design.floors[0].modules.push(
    createModule("charger", "charger", 1, -6, -4),
  );
  let state = createAutomation(c);
  state.robots[0].battery = 14;
  state = applyAutomation(
    c,
    state,
    { type: "enqueue", robotId: "robot-one", priority: 1 },
    () => "m",
  );
  state = applyAutomation(
    c,
    state,
    { type: "pause", paused: false },
    () => "x",
  );
  state = applyAutomation(c, state, { type: "step", seconds: 1 }, () => "x");
  assert.equal(state.robots[0].status, "Low battery");
  assert.equal(state.robots[0].x, -6);
  state = applyAutomation(
    c,
    state,
    { type: "charge", robotId: "robot-one" },
    () => "x",
  );
  const result = applyAutomation(
    c,
    state,
    { type: "step", seconds: 10 },
    () => "x",
  );
  assert.ok(Math.abs(result.robots[0].battery - 19) < 0.0001);
  assert.equal(result.robots[0].x, -6);
});
test("virtual conveyor totes obey buffer capacity, downstream readiness and source handshakes", () => {
  const c = fixture();
  c.design.floors[0].modules = [];
  const belt = createModule("belt", "belt", 1, -6, 0),
    roller = createModule("roller", "roller", 1, 0, 0),
    pack = createModule("packing", "pack", 1, 6, 0);
  belt.targetId = "roller";
  roller.sourceId = "belt";
  roller.targetId = "pack";
  belt.speed = roller.speed = 3;
  c.design.floors[0].modules.push(belt, roller, pack);
  let state = createAutomation(c),
    n = 0;
  const id = () => `t${++n}`;
  for (let i = 0; i < 4; i++)
    state = applyAutomation(
      c,
      state,
      { type: "tote", equipmentId: "belt", label: "Virtual tote" },
      id,
    );
  assert.throws(
    () =>
      applyAutomation(
        c,
        state,
        { type: "tote", equipmentId: "belt", label: "Overflow" },
        id,
      ),
    /full/,
  );
  state = applyAutomation(
    c,
    state,
    { type: "equipment", equipmentId: "roller", enabled: false },
    id,
  );
  state = applyAutomation(c, state, { type: "pause", paused: false }, id);
  state = applyAutomation(c, state, { type: "step", seconds: 10 }, id);
  assert.ok(
    state.totes.every((t) => t.status === "Waiting" && /paused/.test(t.reason)),
  );
  state = applyAutomation(
    c,
    state,
    { type: "equipment", equipmentId: "roller", enabled: true },
    id,
  );
  state = applyAutomation(c, state, { type: "step", seconds: 10 }, id);
  assert.ok(
    state.totes.every(
      (t) => t.status === "Delivered" && t.equipmentId === "pack",
    ),
  );
  assert.deepEqual(generateLayout(c).errors, []);
});
test("automation API persists state, isolates workspaces, guards revisions and resets on design edits", async () => {
  const app = createApplication(":memory:");
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) => {
    const response = await fetch(origin + "/api/v1" + path, {
      method,
      headers: {
        origin,
        cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
  };
  try {
    const user = await request("/auth/register", "POST", {
      email: "automation@example.test",
      name: "Operator",
      workspace: "Simulation",
      password: "automation-test-password",
    });
    const other = await request("/auth/register", "POST", {
      email: "other-auto@example.test",
      name: "Other operator",
      workspace: "Other",
      password: "automation-test-password",
    });
    const created = await request(
      "/warehouses",
      "POST",
      { config: fixture() },
      user.cookie,
    );
    assert.equal(created.status, 201);
    const path = `/warehouses/${created.body.warehouse.id}`;
    assert.equal(
      (
        await request(path + "/automation", "POST", {
          version: 1,
          command: { type: "reset" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          path + "/automation",
          "POST",
          { version: 1, command: { type: "reset" } },
          other.cookie,
        )
      ).status,
      404,
    );
    const initialized = await request(
      path + "/automation",
      "POST",
      { version: 1, command: { type: "reset" } },
      user.cookie,
    );
    assert.equal(initialized.status, 200);
    assert.equal(initialized.body.warehouse.automation.robots.length, 1);
    assert.equal(
      (
        await request(
          path + "/automation",
          "POST",
          { version: 1, command: { type: "reset" } },
          user.cookie,
        )
      ).status,
      409,
    );
    assert.deepEqual(
      (await request(path, "GET", undefined, user.cookie)).body.warehouse
        .records,
      [],
    );
    const revised = await request(
      path,
      "PUT",
      { version: 2, config: fixture() },
      user.cookie,
    );
    assert.equal(revised.status, 200);
    assert.equal(revised.body.warehouse.automation, undefined);
  } finally {
    await new Promise<void>((r) => app.server.close(() => r()));
  }
});
