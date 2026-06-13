# ADR 0002: Spatial RPG Layout & Rendering Architecture for OfficeCraft AI

- Status: Approved
- Date: 2026-06-13
- Deciders: Lead Architect, Frontend Lead
- Tags: frontend, 2d-rpg, physics, collision, prompt-to-light, rendering

## Context

For **OfficeCraft AI**, we must implement a 2D RPG digital twin office where players use the `W-A-S-D` keyboard keys to control a pixel sprite moving through a 25×25 map. The office requires collision with walls/objects, proximity prompts when near NPCs, and global overlay illumination transformations ("Prompt-to-Light") corresponding to task statuses.

Traditional 2D web-game implementations typically opt for canvas-based HTML5 engines like Phaser.js, Pixi.js, or Unity WebGL. However, adopting these in our lightweight technical educational sandbox poses several distinct challenges:
1. **Asset Size & LCP Performance**: Heavy engine runtimes add megabytes of javascript, severely damaging Core Web Vitals (Largest Contentful Paint, Interaction to Next Paint).
2. **State Sync Friction**: Synchronizing a Canvas render loop with Next.js React states (Zustand, Modals, Forms) creates complex bridge-binding patterns and dual-source-of-truth errors.
3. **Styling & Layout Flexibility**: Heavy canvas contexts make native CSS styling, modern HSL gradient backdrops, backdrop-filters, and glassmorphism difficult or impossible to apply cleanly.

## Decision

We decided to reject canvas game engines and implement a **Pure DOM-Grid absolute positioning rendering system** paired with a **Zustand collision detector** and **CSS Variable lighting filters**.

Specifically:
1. **Layout & rendering**: The office map is drawn as a standard container. Every entity (player sprite, NPCs, bookcases) is a React `div` positioned via hardware-accelerated `translate3d(x * 32px, y * 32px, 0)` with standard linear CSS transitions (`0.1s linear`) to guarantee 60fps movement.
2. **Collision Engine**: All grid cells are tracked in a 25x25 binary multidimensional array (collision matrix) stored in Zustand. Before any player movement coordinates are altered, the state engine intercepts the delta movement, checks if the target grid position is `0` (passable), and intercepts (`early return`) if it is `1` (blocked).
3. **Environment Lighting ("Prompt-to-Light")**: Implemented using a global CSS backdrop layer (`ambient-overlay`) covering the entire grid. We map state-level ambient themes (`quiet-blue`, `alert-red`, `celebrate-gold`) directly to custom CSS properties defining `box-shadow` values (`inset 0 0 80px rgba(...)`) and overlay background opacity. Pointer-events are locked to `none` to allow underlying clicking.
4. **Retro Sound Synchronization**: Native HTML5 `Audio` elements are triggered natively in the state store whenever actions occur (walking ticks, victory gold drops, or alert sirens), guaranteeing zero audio-visual lag.

## Consequences

### Positive
- **Extremely Lightweight**: Zero bundle-size overhead compared to importing massive Canvas game engines, retaining rapid page load speeds.
- **Flawless React/Zustand State Binding**: The player's position, dialogue triggers, and active NPC statuses remain natively bound to the Zustand store, automatically making UI modals (like standup meetings or desk workstations) perfectly responsive.
- **Easy Styling & Micro-animations**: Allows standard CSS hover transitions, filter glows, and Tailwind layouts to be applied to any 2D sprite or bookcase.
- **Robust Local Testability**: The collision matrix is a simple 2D array, enabling standard standard-library Python/TypeScript unit tests to evaluate and assert movement correctness easily.

### Negative / Trade-offs
- **Scale Constraint**: React DOM rendering scales gracefully for grids of $25 \times 25$ or $50 \times 50$, but is not suitable for massive open-world rendering with thousands of concurrent active sprites due to DOM node count limitations. Since OfficeCraft AI is designed around a single compact physical corporate office, this constraint is perfectly acceptable.
- **Sprite Animation Management**: Sprite-sheets must be handled using CSS steps animations (`animation: walk-steps 0.4s steps(4) infinite`) rather than canvas engine sprite-sheet runners, which requires careful CSS stylesheet mapping.

## Links

- Architecture Guide: [Architecture Framework (docs/specification/04-architecture-framework.md)](04-architecture-framework.md)
- Design Specifications: [System Design (docs/specification/02-system-design.md)](02-system-design.md)
- Frontend Store: `frontend_new/src/stores/useSpaceStore.ts`
