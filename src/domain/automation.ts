import { z } from "zod";
import { designWalkable, mobileRobots, robotClearance } from "./design";
import type { DesignModule, DesignPoint } from "./design";
import type { WarehouseConfig } from "./warehouse";

export type RobotState = {
  id: string;
  floorId: string;
  x: number;
  z: number;
  heading: number;
  battery: number;
  enabled: boolean;
  charging: boolean;
  status:
    | "Idle"
    | "Running"
    | "Paused"
    | "Traffic hold"
    | "Low battery"
    | "Charging"
    | "Blocked";
  reason: string;
};
export type RouteMission = {
  id: string;
  robotId: string;
  priority: number;
  status: "Queued" | "Running" | "Completed" | "Cancelled";
  path: DesignPoint[];
  segment: number;
  progress: number;
  createdAt: number;
  completedAt?: number;
};
export type AutomationState = {
  mode: "simulation";
  designKey: string;
  elapsed: number;
  paused: boolean;
  robots: RobotState[];
  missions: RouteMission[];
  equipment: { id: string; enabled: boolean; capacity: number }[];
  totes: {
    id: string;
    label: string;
    equipmentId: string;
    progress: number;
    status: "Moving" | "Waiting" | "Delivered";
    reason: string;
    visited: string[];
  }[];
};
export const conveyorKinds = ["belt", "roller", "sorter"];
export const automationCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reset") }),
  z.object({
    type: z.literal("step"),
    seconds: z.number().int().min(1).max(30),
  }),
  z.object({ type: z.literal("pause"), paused: z.boolean() }),
  z.object({
    type: z.literal("enqueue"),
    robotId: z.string().max(64),
    priority: z.number().int().min(1).max(5),
  }),
  z.object({
    type: z.literal("enable"),
    robotId: z.string().max(64),
    enabled: z.boolean(),
  }),
  z.object({ type: z.literal("charge"), robotId: z.string().max(64) }),
  z.object({ type: z.literal("cancel"), missionId: z.string().max(64) }),
  z.object({
    type: z.literal("equipment"),
    equipmentId: z.string().max(64),
    enabled: z.boolean(),
  }),
  z.object({
    type: z.literal("tote"),
    equipmentId: z.string().max(64),
    label: z.string().trim().min(1).max(80),
  }),
]);
export type AutomationCommand = z.infer<typeof automationCommandSchema>;
export function automationDesignKey(config: WarehouseConfig) {
  // Layout revisions invalidate simulation positions and missions rather than teleporting them.
  return JSON.stringify(config.design || null);
}
function robotModules(config: WarehouseConfig) {
  return (
    config.design?.floors.flatMap((f) =>
      f.modules
        .filter((m) =>
          mobileRobots.includes(m.kind as (typeof mobileRobots)[number]),
        )
        .map((m) => ({ module: m, floor: f })),
    ) || []
  );
}
export function createAutomation(config: WarehouseConfig): AutomationState {
  const modules = robotModules(config);
  const equipment =
    config.design?.floors.flatMap((f) =>
      f.modules
        .filter((m) => conveyorKinds.includes(m.kind))
        .map((m) => ({ id: m.id, enabled: true, capacity: 4 })),
    ) || [];
  if (!config.design || (!modules.length && !equipment.length))
    throw new Error("Add mobile robots or conveyors in the 2D studio first.");
  if (modules.length > 50)
    throw new Error("Route simulation supports at most 50 mobile robots.");
  return {
    mode: "simulation",
    designKey: automationDesignKey(config),
    elapsed: 0,
    paused: true,
    missions: [],
    equipment,
    totes: [],
    robots: modules.map(({ module: m, floor }) => ({
      id: m.id,
      floorId: floor.id,
      x: m.x,
      z: m.z,
      heading: (-m.rotation * Math.PI) / 180,
      battery: 100,
      enabled: true,
      charging: false,
      status: "Idle",
      reason: "",
    })),
  };
}
function pathFor(m: DesignModule) {
  if (m.route.length < 2)
    throw new Error(
      "Draw at least two route waypoints before queueing a mission.",
    );
  const path = m.route.map((p) => ({ ...p }));
  if (!path.some((p) => Math.hypot(p.x - path[0].x, p.z - path[0].z) > 0.01)) throw new Error("The route must include a destination away from its start.");
  // Every queued job is one circuit; open routes return along the same path.
  if (Math.hypot(path[0].x - path.at(-1)!.x, path[0].z - path.at(-1)!.z) > 0.01)
    path.push(
      ...m.route
        .slice(0, -1)
        .reverse()
        .map((p) => ({ ...p })),
    );
  return path;
}
const distance = (a: DesignPoint, b: DesignPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function applyAutomation(
  config: WarehouseConfig,
  previous: AutomationState | undefined,
  input: AutomationCommand,
  newId: () => string,
): AutomationState {
  const command = automationCommandSchema.parse(input);
  if (command.type === "reset") return createAutomation(config);
  const state = previous ? structuredClone(previous) : createAutomation(config);
  if (state.designKey !== automationDesignKey(config))
    throw new Error(
      "The design changed. Reset the simulation before continuing.",
    );
  const modules = robotModules(config),
    byId = new Map(modules.map((m) => [m.module.id, m]));
  const allModules = new Map(
    config.design!.floors.flatMap((f) =>
      f.modules.map((m) => [m.id, { module: m, floor: f }] as const),
    ),
  );
  if (command.type === "pause") {
    state.paused = command.paused;
    return state;
  }
  if (command.type === "equipment" || command.type === "tote") {
    const equipment = state.equipment.find((e) => e.id === command.equipmentId);
    if (!equipment) throw new Error("Choose a conveyor in this design.");
    if (command.type === "equipment") equipment.enabled = command.enabled;
    else {
      if (state.totes.filter((t) => t.status !== "Delivered").length >= 100)
        throw new Error("The simulation is limited to 100 active totes.");
      if (
        state.totes.filter(
          (t) => t.equipmentId === equipment.id && t.status !== "Delivered",
        ).length >= equipment.capacity
      )
        throw new Error("The conveyor buffer is full.");
      state.totes = state.totes
        .filter((t) => t.status !== "Delivered")
        .concat(
          state.totes.filter((t) => t.status === "Delivered").slice(-100),
        );
      state.totes.push({
        id: newId(),
        label: command.label,
        equipmentId: equipment.id,
        progress: 0,
        status: "Moving",
        reason: "",
        visited: [equipment.id],
      });
    }
    return state;
  }
  if (command.type === "cancel") {
    const mission = state.missions.find((m) => m.id === command.missionId);
    if (!mission || ["Completed", "Cancelled"].includes(mission.status))
      throw new Error("Choose an active mission.");
    mission.status = "Cancelled";
    const robot = state.robots.find((r) => r.id === mission.robotId)!;
    robot.status = "Idle";
    robot.reason =
      "Cancelled at current position. Reset before starting another circuit if away from the route start.";
    return state;
  }
  if (command.type !== "step") {
    const robot = state.robots.find((r) => r.id === command.robotId),
      spec = byId.get(command.robotId);
    if (!robot || !spec) throw new Error("Robot not found in this design.");
    if (command.type === "enable") {
      robot.enabled = command.enabled;
      robot.status = command.enabled ? "Idle" : "Paused";
      robot.reason = "";
    } else if (command.type === "charge") {
      if (
        state.missions.some(
          (m) => m.robotId === robot.id && m.status === "Running",
        )
      )
        throw new Error(
          "Cancel or finish the current circuit before charging.",
        );
      const charger = spec.floor.modules.find(
        (m) =>
          m.kind === "charger" &&
          distance(m, robot) <=
            robotClearance(spec.module) +
              Math.hypot(m.width, m.depth) / 2 +
              0.75,
      );
      if (!charger)
        throw new Error(
          "Charging requires the robot to be beside a charger on the same floor. Position its route start beside a charger in the editor.",
        );
      if (
        state.robots.some(
          (r) =>
            r.id !== robot.id &&
            r.charging &&
            r.floorId === robot.floorId &&
            distance(r, charger) <=
              robotClearance(byId.get(r.id)!.module) +
                Math.hypot(charger.width, charger.depth) / 2 +
                0.75,
        )
      )
        throw new Error("This charging area is already occupied.");
      robot.charging = true;
      robot.status = "Charging";
      robot.reason =
        "Simulation charge rate: 0.5 percentage points/second, stop at 95%.";
    } else {
      if (
        state.missions.filter(
          (m) => m.status === "Queued" || m.status === "Running",
        ).length >= 100
      )
        throw new Error("The active queue is limited to 100 missions.");
      // Another circuit may queue while the current one returns to its start.
      if (
        !state.missions.some(
          (m) => m.robotId === robot.id && m.status === "Running",
        ) &&
        distance(robot, spec.module) > 0.05
      )
        throw new Error(
          "Robot is away from its route start. Reset the simulation before queueing a new circuit.",
        );
      const path = pathFor(spec.module),
        radius = robotClearance(spec.module);
      for (let i = 1; i < path.length; i++) {
        const count = Math.max(
          1,
          Math.ceil(distance(path[i - 1], path[i]) / 0.1),
        );
        for (let j = 0; j <= count; j++)
          if (
            !designWalkable(
              {
                x: path[i - 1].x + ((path[i].x - path[i - 1].x) * j) / count,
                z: path[i - 1].z + ((path[i].z - path[i - 1].z) * j) / count,
              },
              spec.floor,
              robot.id,
              radius,
            )
          )
            throw new Error(
              "This route does not have clearance for the robot's full footprint.",
            );
      }
      state.missions = state.missions
        .filter((m) => !["Completed", "Cancelled"].includes(m.status))
        .concat(
          state.missions
            .filter((m) => ["Completed", "Cancelled"].includes(m.status))
            .slice(-100),
        );
      state.missions.push({
        id: newId(),
        robotId: robot.id,
        priority: command.priority,
        status: "Queued",
        path,
        segment: 0,
        progress: 0,
        createdAt: state.elapsed,
      });
    }
    return state;
  }
  if (state.paused)
    throw new Error("Resume the simulation before advancing time.");
  // Fixed 100 ms steps give deterministic, bounded movement and conservative traffic arbitration.
  for (let tick = 0; tick < command.seconds * 10; tick++) {
    state.elapsed = Math.round((state.elapsed + 0.1) * 10) / 10;
    const ordered = [...state.robots].sort((a, b) => {
      const priority = (id: string) =>
        Math.max(
          0,
          ...state.missions
            .filter(
              (m) =>
                m.robotId === id &&
                (m.status === "Queued" || m.status === "Running"),
            )
            .map((m) => m.priority),
        );
      return priority(b.id) - priority(a.id) || a.id.localeCompare(b.id);
    });
    for (const robot of ordered) {
      const spec = byId.get(robot.id)!;
      robot.reason = "";
      if (!robot.enabled) {
        robot.status = "Paused";
        continue;
      }
      if (robot.charging) {
        robot.battery = Math.min(100, robot.battery + 0.05);
        if (robot.battery >= 95) robot.charging = false;
        robot.status = robot.charging ? "Charging" : "Idle";
        continue;
      }
      let mission = state.missions.find(
        (m) => m.robotId === robot.id && m.status === "Running",
      );
      if (!mission) {
        mission = state.missions
          .filter((m) => m.robotId === robot.id && m.status === "Queued")
          .sort(
            (a, b) => b.priority - a.priority || a.createdAt - b.createdAt,
          )[0];
        if (!mission) {
          robot.status = "Idle";
          continue;
        }
        if (distance(robot, mission.path[0]) > 0.05) {
          robot.status = "Blocked";
          robot.reason =
            "Circuit start differs from current position. Reset required; no teleportation.";
          continue;
        }
      }
      if (robot.battery <= 15) {
        robot.status = "Low battery";
        robot.reason =
          "15% reserve reached. Cancel and recharge beside a charger, or reset this simulation.";
        continue;
      }
      mission.status = "Running";
      const a = mission.path[mission.segment],
        b = mission.path[mission.segment + 1],
        length = distance(a, b);
      if (length < 0.0001) {
        mission.segment++;
        mission.progress = 0;
      } else {
        const travel = Math.min(
            spec.module.speed * 0.1,
            length - mission.progress,
          ),
          t = (mission.progress + travel) / length;
        const candidate = {
            x: a.x + (b.x - a.x) * t,
            z: a.z + (b.z - a.z) * t,
          },
          radius = robotClearance(spec.module);
        if (!designWalkable(candidate, spec.floor, robot.id, radius)) {
          robot.status = "Blocked";
          robot.reason = "Route clearance failed.";
          continue;
        }
        const conflict = state.robots.find(
          (r) =>
            r.id !== robot.id &&
            r.floorId === robot.floorId &&
            distance(candidate, r) <
              radius + robotClearance(byId.get(r.id)!.module),
        );
        if (conflict) {
          robot.status = "Traffic hold";
          robot.reason = `Waiting for ${byId.get(conflict.id)!.module.label}. Deadlocks require route edits or reset.`;
          continue;
        }
        robot.x = candidate.x;
        robot.z = candidate.z;
        robot.heading = Math.atan2(b.x - a.x, b.z - a.z);
        robot.battery = Math.max(0, robot.battery - travel * 0.02);
        mission.progress += travel;
        robot.status = "Running";
        if (mission.progress >= length - 0.000001) {
          mission.segment++;
          mission.progress = 0;
        }
      }
      if (mission.segment >= mission.path.length - 1) {
        mission.status = "Completed";
        mission.completedAt = state.elapsed;
        robot.status = "Idle";
      }
    }
    // Logical buffer handoffs are one-hop per tick; physical belt geometry is not inferred.
    for (const tote of state.totes) {
      if (tote.status === "Delivered") continue;
      const current = allModules.get(tote.equipmentId)!,
        equipment = state.equipment.find((e) => e.id === tote.equipmentId)!;
      tote.reason = "";
      if (!equipment.enabled) {
        tote.status = "Waiting";
        tote.reason = "Conveyor paused.";
        continue;
      }
      const length = current.module.depth;
      tote.progress = Math.min(
        length,
        tote.progress + current.module.speed * 0.1,
      );
      tote.status = "Moving";
      if (tote.progress < length) continue;
      const destination = allModules.get(current.module.targetId || "");
      if (
        !destination ||
        destination.floor.id !== current.floor.id ||
        destination.module.kind === "area" ||
        mobileRobots.includes(
          destination.module.kind as (typeof mobileRobots)[number],
        )
      ) {
        tote.status = "Waiting";
        tote.reason =
          "Configure a destination fixture on this floor in the editor.";
        continue;
      }
      if (
        destination.module.sourceId &&
        destination.module.sourceId !== current.module.id
      ) {
        tote.status = "Waiting";
        tote.reason =
          "Destination source handshake does not match this conveyor.";
        continue;
      }
      const next = state.equipment.find((e) => e.id === destination.module.id);
      if (next) {
        if (
          !next.enabled ||
          state.totes.filter(
            (t) => t.status !== "Delivered" && t.equipmentId === next.id,
          ).length >= next.capacity
        ) {
          tote.status = "Waiting";
          tote.reason = next.enabled
            ? "Downstream buffer full."
            : "Downstream conveyor paused.";
          continue;
        }
        if (tote.visited.includes(next.id)) {
          tote.status = "Waiting";
          tote.reason =
            "Workflow cycle detected. Edit links or reset the simulation.";
          continue;
        }
        tote.equipmentId = next.id;
        tote.progress = 0;
        tote.visited.push(next.id);
      } else {
        tote.equipmentId = destination.module.id;
        tote.status = "Delivered";
        tote.reason = "Virtual tote delivered; physical inventory unchanged.";
      }
    }
  }
  return state;
}
