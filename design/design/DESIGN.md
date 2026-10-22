---
name: SENTRY Zenith Security Console
colors:
  page: '#F7F7F7'
  surface: '#FFFFFF'
  border: '#EDEDED'
  divider: '#E5E7EB'
  ink: '#1B1B1B'
  text: '#212529'
  text-muted: '#868786'
  zenith-red: '#E3000F'
  zenith-red-hover: '#C8000D'
  zenith-red-active: '#A6000B'
  zenith-red-tint: '#FCE5E7'
  level-normal: '#868786'
  level-normal-tint: '#F7F7F7'
  level-normal-border: '#E5E7EB'
  level-watch: '#2563EB'
  level-watch-tint: '#DBEAFE'
  level-watch-border: '#BFDBFE'
  level-verify: '#0891B2'
  level-verify-tint: '#CFFAFE'
  level-verify-border: '#A5F3FC'
  level-hold: '#D97706'
  level-hold-tint: '#FEF3C7'
  level-hold-border: '#FDE68A'
  level-contain: '#E3000F'
  level-contain-tint: '#FCE5E7'
  level-contain-border: '#FCA5A5'
  ok: '#15803D'
  ok-tint: '#DCFCE7'
  ok-border: '#BBF7D0'
typography:
  display-score:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 52px
    letterSpacing: -0.03em
  headline-page:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-section:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-card:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-default:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-medium:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-compact:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-compact-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  action-pill:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  badge-chip:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  meta-numeric:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
rounded:
  card: 12px
  modal: 12px
  checkbox: 4px
  pill: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-projector: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system drives mission-critical insider-threat operational monitoring for tier-1 financial infrastructure. The target audience comprises fraud response analysts, security operations center (SOC) directors, and executive risk auditors operating both at dedicated analyst workstations and in multi-stakeholder incident command rooms. 

The aesthetic philosophy centers on absolute clarity, structured restraint, and high-visibility contrast optimized for large projector views (1440×900) under varied ambient lighting. Drawing from institutional minimalism and operational high-contrast data visualization, the interface maintains an orderly, clinical calm. Chromatic alerts are strictly functional: the signature red is never applied as an ambient decorative accent, ensuring instant cognitive recognition when irreversible, high-severity operational interventions are required.

## Colors

The palette establishes strict semantic discipline designed to prevent warning fatigue while ensuring uncompromised readability across projector projections.

- **Canvas & Structural Surfaces:**
  - Page Background: `#F7F7F7`
  - Card & Module Surfaces: `#FFFFFF`
  - Structural Card Border: `#EDEDED` (1px solid)
  - Navigation Top Bar: `#1B1B1B` with pure white `#FFFFFF` text and icons.

- **Typography & Neutrals:**
  - Base Body Text: `#212529`
  - Secondary/Muted Meta Text: `#868786`
  - Dividers & Sub-hairlines: `#E5E7EB`

- **Reserved Institutional Red (`#E3000F`):**
  - Restricted strictly to three critical surfaces: the primary brand shield insignia, the **Contain** risk tier, and hard stop-money authorization actions (e.g., `Approve Hold`, `Approve Suspension`). Soft container tint: `#FCE5E7`.

- **Operational Risk Classification Spectrum:**
  - **Normal (Score 0–14):** Text `#868786` on Background `#F7F7F7`, Border `#E5E7EB`
  - **Watch (Score 15–29):** Text `#2563EB` on Background `#DBEAFE`, Border `#BFDBFE`
  - **Verify (Score 30–59):** Text `#0891B2` on Background `#CFFAFE`, Border `#A5F3FC`
  - **Hold (Score 60–79):** Text `#D97706` on Background `#FEF3C7`, Border `#FDE68A`
  - **Contain (Score 80–100):** Text `#E3000F` on Background `#FCE5E7`, Border `#FCA5A5`

- **System Positive / Resolution:**
  - **Success / Matched Status:** Text `#15803D` on Background `#DCFCE7`, Border `#BBF7D0`

## Typography

Typography enforces a strict functional split:

1. **Plus Jakarta Sans** is the operational anchor font used exclusively for primary metrics, scores, section structures, tabular figures, badges, and actionable buttons. The high x-height and confident geometry preserve character separation across low-fidelity projector bulbs.
2. **Inter** powers all informational reading zones, log timelines, tabular listings, user narratives, and data definitions. It provides neutral, fatigue-reducing horizontal flow.

**Operational Rules:**
- The absolute minimum allowed font size across the entire console is 14px (`body-compact` / `badge-chip`). Micro-type is forbidden to guarantee legible command-room projection.
- Risk scores must render using `display-score` in tabular figures (`font-variant-numeric: tabular-nums`) to avoid layout jitter during real-time telemetry updates.

## Layout & Spacing

The console is anchored to an uncompromising 8pt baseline rhythm (all measurements increment by 8px / 0.5rem, with a 4px / 0.25rem sub-step for tight badges and micro-alignments).

- **Grid Architecture:** 
  - Standard Canvas: 12-column responsive fluid grid pinned to an optimal native baseline of `1440px × 900px`.
  - Column Gutters: Fixed 16px (`gutter`) for data density, expandable to 24px (`gutter-lg`) between major split-screen modules (e.g., Live Threat Stream vs. Detail Inspector).
  - Canvas Edge Margin: 24px (`margin`) on standard desktop views, padded to 32px (`margin-projector`) when projecting live feeds to accommodate bezel overscan.

- **Reflow and Stacking Rules:**
  - Main top bar stays sticky at `height: 64px`, spanning full viewport width with 0px margin.
  - Console: 60% live feed / 40% side panel (decision card, highest risk, counters). Case view: 62% evidence column / 38% decisions and case note. Both stack vertically below 1024px.

## Elevation & Depth

This system intentionally rejects heavy drop shadows, dynamic z-depth elevations, and skeuomorphic casting. Overhead projection washes out dark, subtle gradients, turning complex box-shadows into muddy visual noise.

- **Plane Separation:** Achieved strictly via 1px architectural borders (`#EDEDED`) bounding crisp `#FFFFFF` cards against the `#F7F7F7` page plane.
- **Header Docking:** The `#1B1B1B` dark top bar establishes absolute grounding and contextual boundaries through clean tonal contrast rather than cast elevation.
- **Interactive Focus & Modals:**
  - Standard cards utilize `box-shadow: none`.
  - Floating confirmation modals and critical containment dialogs employ a precise, low-spread ambient shadow: `0 4px 16px rgba(0, 0, 0, 0.06)`, framed by a crisp `#E5E7EB` 1px border.
  - Interactive elements rely on state-driven hairline color changes (e.g., card border transitioning to `#212529` on focus) rather than vertical translation.

## Shapes

The interface balances sharp, utilitarian data framing with smooth, identifiable interactive touchpoints.

- **Structural Containers & Cards:** Strictly specified at `12px` border radius (`rounded.card`). This softens the dashboard grid while maintaining dense table geometry and clean perimeter bounds.
- **Controls & Semantics (Pill Language):** All actionable buttons, risk indicators, status chips, search input fields, and pill selectors utilize `rounded-full` (pill shape). This high visual differentiation prevents analysts from mistaking static data cells or module borders for interactive controls.
- **Internal Micro-Elements:** Progress meters, risk gauge tracks, and status indicator dots utilize fully rounded geometric caps.

## Components

### Buttons
- **Shape:** Pill-shaped (`border-radius: 9999px`).
- **Typography:** `Plus Jakarta Sans`, 14px, weight 600.
- **Critical Action Button (Stop-Money / Containment):**
  - Reserved strictly for irreversible holds: `Approve hold`, `Approve suspension`.
  - Background `#E3000F`, text `#FFFFFF`, zero border. On hover, background deepens to `#C8000D`. Active state: `#A6000B`.
- **Secondary / Standard Primary Button:**
  - Background `#1B1B1B`, text `#FFFFFF`, zero border. Hover: `#333333`.
- **Outline / Dismissal Button:**
  - Background `#FFFFFF`, text `#212529`, border `1px solid #EDEDED`. Hover: background `#F7F7F7`, border `#D1D5DB`.

### Risk & Status Chips
- **Geometry:** Pill-shaped, height 28px, horizontal padding 12px, vertical padding 4px.
- **Typography:** `Plus Jakarta Sans`, 14px, weight 600.
- **Variants:**
  - *Normal:* Background `#F7F7F7`, text `#868786`, border `1px solid #E5E7EB`
  - *Watch:* Background `#DBEAFE`, text `#2563EB`, border `1px solid #BFDBFE`
  - *Verify:* Background `#CFFAFE`, text `#0891B2`, border `1px solid #A5F3FC`
  - *Hold:* Background `#FEF3C7`, text `#D97706`, border `1px solid #FDE68A`
  - *Contain:* Background `#FCE5E7`, text `#E3000F`, border `1px solid #FCA5A5`
  - *Success / Matched:* Background `#DCFCE7`, text `#15803D`, border `1px solid #BBF7D0`

### Cards & Panels
- **Container:** Pure `#FFFFFF` surface, `12px` border radius, `1px solid #EDEDED` border.
- **Internal Padding:** 24px (`space-lg`) on standard panels; 16px (`space-md`) on dense audit stream feeds.
- **Header Alignment:** Card titles use `Plus Jakarta Sans` 16px or 20px, baseline-aligned with trailing action controls or count chips.

### Form Inputs & Search Fields
- **Container:** Pill-shaped (`border-radius: 9999px`), height 44px, background `#FFFFFF`, border `1px solid #EDEDED`.
- **Typography & Icons:** Text `Inter` 14px `#212529`; placeholder `#868786`. Lucide search icon sized at 18px stroke colored `#868786`.
- **State:** Focus produces a solid 1px halo in `#1B1B1B` with no color shift.

### Tables & Data Grids
- **Header:** Background `#F7F7F7`, text `#868786`, `Plus Jakarta Sans` 14px weight 600, uppercase letter-spacing 0.04em, height 40px.
- **Row Specs:** Clean white `#FFFFFF`, height 56px, horizontal cell padding 16px, bottom border `1px solid #EDEDED`.
- **Font:** Primary row identifiers and labels in `Inter` 16px weight 500 (`#212529`); secondary meta in `Inter` 14px (`#868786`).

### Checkboxes & Radios
- **Checkboxes:** 20px × 20px, `4px` border radius, `1.5px solid #868786`. Checked state: background `#1B1B1B`, border `#1B1B1B`, white checkmark.
- **Selection Rule:** Red is strictly prohibited for selection boxes; all standard selections are neutral ink.

### Iconography
- Clean, open line style (Lucide standard), stroke width `1.75px` or `2px`. Bounded strictly to 18px or 20px boxes. Icon color follows text parent (`#FFFFFF` in top bar, `#868786` for informational controls, `#E3000F` strictly within active Contain elements).