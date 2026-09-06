---
name: Infinite Canvas Agentic Workspace
colors:
  surface: '#13131b'
  surface-dim: '#13131b'
  surface-bright: '#393841'
  surface-container-lowest: '#0d0d15'
  surface-container-low: '#1b1b23'
  surface-container: '#1f1f27'
  surface-container-high: '#292932'
  surface-container-highest: '#34343d'
  on-surface: '#e4e1ed'
  on-surface-variant: '#bbc9cf'
  inverse-surface: '#e4e1ed'
  inverse-on-surface: '#303038'
  outline: '#859399'
  outline-variant: '#3c494e'
  surface-tint: '#47d6ff'
  primary: '#a5e7ff'
  on-primary: '#003543'
  primary-container: '#00d2ff'
  on-primary-container: '#00566a'
  inverse-primary: '#00677f'
  secondary: '#9fcaff'
  on-secondary: '#003259'
  secondary-container: '#0e9aff'
  on-secondary-container: '#003055'
  tertiary: '#69f6b9'
  on-tertiary: '#003824'
  tertiary-container: '#48d99e'
  on-tertiary-container: '#005b3d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b6ebff'
  primary-fixed-dim: '#47d6ff'
  on-primary-fixed: '#001f28'
  on-primary-fixed-variant: '#004e60'
  secondary-fixed: '#d2e4ff'
  secondary-fixed-dim: '#9fcaff'
  on-secondary-fixed: '#001d36'
  on-secondary-fixed-variant: '#00497e'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#13131b'
  on-background: '#e4e1ed'
  surface-variant: '#34343d'
typography:
  display-hero:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.025em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.015em
  body-default:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-dense:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: -0.005em
  code-default:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: -0.01em
  code-coords:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.06em
  badge-status:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  hud-dock-offset: 1.25rem
  inspector-width: 18rem
  command-palette-width: 36rem
  canvas-dot-spacing: 1.5rem
---

## Brand & Style

This design system targets modern software engineers, systems architects, and technical operators orchestrating mixed human-agent workflows. The interface conveys calculated hyper-precision, deterministic control, and absolute spatial clarity—blending the focused density of modern command interfaces (Linear, Raycast) with the unbounded freedom of infinite whiteboards.

The aesthetic philosophy balances **Developer-Tool Precision** with **Atmospheric Glassmorphism**:
- Ultra-dense, dark spatial canvas serving as an ambient playground for both real-time multiplayer cursors and autonomous AI agent operations.
- Zero ornamental clutter: UI elements exist purely as high-contrast HUD overlays floating gracefully above an infinite spatial field.
- Mechanical rhythm: Fine 1px perimeter borders, calibrated translucency, sub-pixel grid alignment, and razor-sharp monospace micro-typography provide an instrument-grade feel.

## Colors

The color palette centers on a deep, obsidian spatial matrix anchored by `#0A0A0F`. Canvas planes utilize subtle geometric dot grids (`#232332`) on a dark foundational undertone (`#16161F`).

Floating chrome, command bars, spatial panels, and inspectors leverage semi-translucent dark slate surfaces (`#12121A` to `#181824`) delineated by crisp 1px structural hairpins (`#262638`). 

Accent colors are deployed with strict functional intentionality:
- **Electric Cyan (`#00D2FF`) & Precision Blue (`#0099FF`)**: Indicate viewport bounds, selected canvas nodes, laser active tools, multi-cursor trails, and running agent synthesis states.
- **Emerald (`#10B981`)**: Dedicated exclusively to active, verified, and executing AI agent processes.
- **Amber (`#F59E0B`)**: Signals gated permissions, human-in-the-loop review nodes, and asynchronous approvals.
- **Text Hierarchies**: Crisp white (`#F3F4F6`) for high-legibility commands, neutral slate (`#8E8EA0`) for spatial labels/secondary properties, and deep helper (`#525266`) for structural hints and coordinate offsets.

## Typography

Typography unifies high-speed spatial navigation with developer-grade analytical inspection. 

- **Geist** serves as the primary interface voice across display headers, property inputs, command menus, and conversational agent prompts. It possesses neutral geometric grotesque anatomy with low-contrast strokes and tight aperture tracking suited for high-density HUD interfaces.
- **JetBrains Mono** governs all coordinate indices, agent memory registers, telemetry counters, keyboard shortcut combinations, and code generation envelopes. 

All display-level and headline weights utilize negative letter-spacing for tight horizontal efficiency. Monospace micro-copy enforces uppercase styling with expansive tracking (`0.06em`) for maximum scan-rate at zoom extremes.

## Layout & Spacing

The canvas architecture is built on a two-layer paradigm: **Infinite Matrix Layer** and **Heads-Up Display (HUD) Layer**.

1. **Infinite Matrix Layer**: 
   - Uses an absolute pixel coordinate system mapped to zoom levels from 10% to 1600%.
   - Features a primary dot grid anchored at `1.5rem` (24px) intervals, snapping objects to 8px sub-multiples.

2. **Heads-Up Display (HUD) Layer**:
   - Anchors pinned floating panels to viewport boundaries with a standard `1.25rem` (20px) offset.
   - The primary command toolbar floats centered at the bottom viewport boundary.
   - Spatial inspector and agent collaboration sidebars maintain a compact `18rem` (288px) width, collapsing to toolbars on constrained viewports.
   - Central quick-action palettes float centered along the upper third at `36rem` (576px).

Dense UI components utilize an uncompromising 4px base rhythm (`0.25rem`), prioritizing dense interaction capacity over open whitespace.

## Elevation & Depth

Depth is established strictly through **Glassmorphic Tonal Stratification** paired with razor-thin luminescence rather than heavy drop shadows:

- **Level 0 (Canvas Base)**: Pure `#0A0A0F` spatial substrate containing dot lattices, infinite wireframes, agent trajectories, and spatial cards.
- **Level 1 (In-Canvas Active Entities)**: Visual cards and agent execution blocks float directly within canvas coordinates, delineated by 1px borders of `#262638` with backdrops rendered at `rgba(18, 18, 26, 0.72)`.
- **Level 2 (HUD & Overlays)**: Persistent docks, toolbars, and contextual inspectors float over the canvas with `backdrop-filter: blur(16px)`, `background: rgba(18, 18, 26, 0.75)`, and an interior top-edge specular highlight (`inset 0 1px 0 rgba(255, 255, 255, 0.08)`).
- **Level 3 (Modal Palettes & Command Hubs)**: Raycast-style command prompts and contextual menus leverage `backdrop-filter: blur(24px)`, `background: rgba(24, 24, 36, 0.90)`, bordered by `rgba(0, 210, 255, 0.3)` with an ambient soft-cyan luminescence (`0 8px 32px -4px rgba(0, 210, 255, 0.12)`).
- **Level 4 (Agent Presence & Active Cursors)**: Real-time multiplayer cursors, agent selection halos, and laser bounds emit direct glow layers (`box-shadow: 0 0 12px rgba(0, 210, 255, 0.45)`).

## Shapes

The design system employs a **Soft (Level 1)** geometric silhouette framework tailored for technical interfaces:

- **HUD Panels, Toolbars, and Modals**: Styled with `rounded-md` (6px) or `rounded-lg` (8px), maintaining strict geometric posture without appearing completely sharp.
- **Micro-Elements (Buttons, Chips, Badges, Dropdowns)**: Standardized at `rounded` (4px) to maximize internal screen real estate within dense layout configurations.
- **Canvas Nodes & Cards**: Feature uniform 8px radii, preserving clean spatial grouping at high zoom-out ratios.
- **Selection Outlines & Node Connectors**: Utilize crisp 90-degree orthogonal paths or precise 4px fillet corners for programmatic logic visualization.

## Components

### Buttons & Tool Selectors
- **Action Buttons**: Rendered at 28px height (compact) or 32px height (standard). Backgrounds use translucent dark slate (`#181824`) with a 1px border (`#262638`). On hover, the border shifts to `#00D2FF` with text brightening to `#F3F4F6`.
- **Active Canvas Tools**: Tool icons feature an electric cyan indicator (`#00D2FF`) with a background tint of `rgba(0, 210, 255, 0.12)` and inner border highlight. Monospaced numeric hotkeys (`1`, `V`, `T`) are displayed in the bottom-right corner at `10px`.

### Command Palette & Inputs
- **Global Command Bar**: Centered floating input, 44px height, with integrated JetBrains Mono prefix tags (e.g., `> agent:run`). 
- **Inspector Inputs**: Dense 24px-tall numerical/text fields displaying explicit coordinate units (`X`, `Y`, `W`, `H`) in monospace `#525266` prefixes. Background is flat `#12121A` with a 1px `#1C1C28` border, sharpening to `#00D2FF` on focus.

### Agent Status Badges & Chips
- **Connected Agent Chip**: Capsule containing an outer 1px border of `#10B981`, a pulsing live-beacon dot (6px) with an emerald drop-shadow, and agent taxonomy text in `JetBrains Mono` at `11px`.
- **Review / Approval Gates**: High-visibility amber bounding boxes (`#F59E0B`) with action triggers (`Approve`, `Diff`, `Reject`) inset directly into the spatial block.

### Canvas Node Cards
- Containerized blocks featuring an ultra-slim header bar, displaying node icon, semantic title (`Geist 13px`), and runtime latency or model label (`JetBrains Mono 10px`).
- Connective port handles (input/output dots) measure 8px by 8px, snapping magnetically with cyan radial halos when cursor proximity is within 16px.

### Selection Bounds & Cursor Indicators
- Single and multi-entity selection handles are rendered with crisp 1px solid `#00D2FF` stroke bounds, accompanied by 6px squared control handles.
- Human user cursors project a subtle neon name tag, while Autonomous Agent cursors display an explicit pill label showing current execution state (e.g., `AGENT: Synthesizing architecture...`).