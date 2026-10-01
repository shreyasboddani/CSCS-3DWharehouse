# Warehouse design and fleet research

Research date: 2026-10-01. Product names supplied: KINEXON, SIGMATEK, Rocla, Addverb and BlueBotics. These combine fleet execution and integration capabilities; copying their full behavior is a separate development program. Our editor is an original warehouse design and visualization interface.

## Primary references and implications

| Reference | Observed capabilities | Product implication |
| --- | --- | --- |
| [KINEXON Fleet Manager](https://kinexon.com/products/kinexon-fleet-manager) | Heterogeneous robot fleets, transport orders and standardized integration | Persist equipment IDs, mission intent and adapter boundaries; do not claim interoperability without an adapter. |
| [SIGMATEK Traffic Control System](https://www.sigmatek-automation.com/en/products/software/agv-amr-automation/traffic-control-system/) | Graphical routes, restrictions/obstacles, job/fleet simulation and activity statistics | Route drawing belongs alongside the spatial layout; arbitration, restricted networks and performance analytics need a dedicated engine. |
| [Rocla FleetController](https://www.rocla-agv.com/agv-solution/fleetcontroller-next-generation-software-for-agvs/) | Transport order coordination, vehicle assignment and browser monitoring | Design-time equipment configuration is distinct from executing WMS missions or consuming vehicle telemetry. |
| [BlueBotics ANT server](https://bluebotics.com/autonomous-navigation-technology/ant-server-fleet-software) | Mission scheduling, traffic control, charging and external equipment/API integration | Future adapters need queues, charger policies and door/lift handshakes, beyond a route animation. |
| [Addverb fleet management](https://addverb.com/us/automated-warehouse-robots/software/fleet-management-system/) and [mobile robots](https://addverb.com/us/automated-warehouse-robots/mobile-robots/) | Central fleet software and several mobile material-handling robot categories | Offer a fixed generic catalog with meaningful task choices, rather than arbitrary user-invented robot capabilities. |
| [FlexSim conveyor concepts](https://docs.flexsim.com/en/24.0/ConnectingFlows/Conveyors/KeyConceptsConveyors/KeyConceptsConveyors.html) | Conveyor objects, sensors, stations, decision points and transfers | Conveyor geometry and workflow endpoints are a first step; throughput simulation needs event/transfer logic. |
| [Visual Components](https://www.visualcomponents.com/try-it-yourself/) | Layout libraries, production logic and simulation | Reusable modules should share layout coordinates with the generated scene. Simulation and virtual commissioning require separate behavior and verification. |

## Delivered in this pass

- Custom simple polygon shells; rectangle, L and T starting outlines; existing flow templates.
- Measured grid/snap/zoom, drag/drop/move, vertex editing, rectangular planning areas, auto-fill and even spacing.
- Individual rack bays, levels, bins, passage widths and bin capacity defaults.
- Four independently designed floors, stable floor-prefixed addresses and stacked/isolated 3D views.
- Twenty-four catalog modules covering operational stations, docks, office, columns, stairs/lift/exit, conveyors/sorter/ASRS, mobile robots, robot cell, forklift, charger, pallet buffer and processing station.
- Stored robot tasks/speed/routes/loop and workflow source/destination references. Obstacle checks and illustrative route playback.
- Shared API persistence, record/address/mapping protection, equipment inspection and precise bin selection.

## Required subsequent releases

These are not completed by a visual editor: fleet deadlock/traffic arbitration, priority/preemption, vehicle availability and battery state, charging dispatch, vendor capabilities/protocol adapters, live telemetry, map alignment/SLAM import, one-way/restricted route graph policies, runtime transport-order queues, conveyor sensors/transfers/diverters, event-driven throughput simulation, safety zoning/interlocks, door/lift handshakes, continuous inter-floor navigation, engineered slab/void/support design, CAD/DXF imports, formal safety/egress certification and SCOTI authentication/schema integration. AS/RS blocks currently represent equipment footprint, not every internal slot. Existing quality/returns records do not imply complete disposition workflows.

## Acceptance and operational notes

Use shared logical addresses to attach imported/manual records. Geometry animation never creates stock or changes lifecycle. Changing address-producing specifications is rejected when it would orphan records, mappings or rules. Device/browser performance still needs representative target-client profiling. This pass is an implemented design studio increment; it is not evidence of fleet-control or facility-engineering production certification.
