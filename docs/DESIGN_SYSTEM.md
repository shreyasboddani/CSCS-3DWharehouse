# Design system

Supplied CSCS logo, white surfaces, cool blue undertones, navy text and restrained teal accents. This original product interface must not be described as production SCOTI UI.

Prioritize the builder and warehouse workspace: large scene, clearly named modes, area navigation, exact addresses, inspector, record sources and inline layout errors. CSV needs validation, preview, replacement counts and confirmation. Dialogs provide Escape and focus containment/restoration. Directory actions provide keyboard alternatives to canvas interaction.

Procedural PBR aesthetic: blue/teal/graphite steel racks, muted orange beams, textured cardboard, timber pallets, concrete slab, asphalt yards, clerestory details, navy fascia, trusses, roof panels, high-bay lighting. Trucks remain outside and aligned to real door openings, seals, loading threshold, bollards and parking lines. Yard elevation is below the warehouse slab.

Complete exterior includes roof/walls. Interior cutaway retains transparent near walls and labels that treatment. Top view and first-person mode serve distinct inspection tasks. Saved records drive occupancy; builder stock/equipment are labeled illustrative. Workers and forklifts are fixtures, not claimed live telemetry. Cartons indicate occupancy rather than exact physical carton counts.

Instance boxes/pallet parts, batch static geometry, share textures/materials, cap pixel ratio and main rendering at 30 FPS, dispose GPU resources, and use SVG thumbnails. WebGL failure must preserve directory/record controls and a floor plan.

## Public landing page

The landing uses a white surface, navy headings, cool blue accents, generous spacing, and a single lazily loaded interactive warehouse scene. Five area controls guide the canonical example, with orbit/plan/walk views. Scoped styles live in src/styles/landing.css. No invented testimonials or business outcome claims. Clearly distinguish illustrative records and pending SCOTI integration. Small screens stack panels and retain horizontally scrollable area controls. Keyboard focus, a skip link, native FAQ disclosures, and the floor-plan fallback remain available.

## Design studio

White/cool-blue measured SVG canvas with meter grid, five-meter major lines, vertex handles, perimeter lengths, selected dimensions, floor tabs and a compact equipment inspector. Source modules are color coded by catalog/zone. Native draggable palette, numeric position/specification fields and module directory provide alternatives to pointer placement. Shift-click selects multiple modules for spacing; undo/redo records the spatial model. SVG thumbnails render the custom ground-floor outline instead of a rectangular placeholder.

3D preview disables module editing to avoid full scene rebuilds on each input; return to 2D for changes. Floor isolation, solid exterior/cutaway views and equipment cards operate on saved design. Batched static geometry and instanced inventory/address hit targets reduce draw calls. Illustrative robots follow stored waypoint paths; the UI labels planning configuration and does not claim live operations. No proprietary vendor robot models or software UI are reproduced.

Draft controls show saving/saved/failure status and allow incomplete plans to remain separate from operational data. Resume cards use measured 2D thumbnails. Converted template designs retain the established detailed renderer; custom layouts use the same steel/orange palette, textured floor and cartons, braced racks, bay labels, traffic markings, perimeter cladding and high-bay lighting.

Automation lab is a collapsed white/blue workspace panel with an explicit local simulation badge, controlled clock, queue controls, robot position/status/battery cards and conveyor buffer/virtual-tote status. State updates move existing robot meshes without rebuilding the scene. Fixed-time advances display saved snapshots; they are not a live telemetry feed. Planning preview may show illustrative waypoint animation; operational warehouse views use saved simulation positions.
