---
name: Yueke
description: AI-assisted PE lesson planning and interactive classroom screen workspace.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.141 0.005 285.823)"
  card: "oklch(1 0 0)"
  muted: "oklch(0.967 0.001 286.375)"
  muted-foreground: "oklch(0.552 0.016 285.938)"
  border: "oklch(0.92 0.004 286.032)"
  primary: "oklch(0.21 0.006 285.885)"
  primary-foreground: "oklch(0.985 0.002 247.839)"
  brand: "oklch(0.527 0.154 157.571)"
  brand-foreground: "oklch(0.985 0.02 166.913)"
  basketball-orange: "#f97316"
  gym-lime: "#bef264"
  safety-red: "#ef4444"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  panel: "1rem"
  hero: "1.5rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-brand:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-foreground}"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  workspace-panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "1rem"
---

# Design System: Yueke

## 1. Overview

**Creative North Star: "Gym Command Desk"**

Yueke is a product workspace for a real teacher managing a noisy, physical class. The interface should feel organized, durable, and fast to understand. It can carry PE energy through emerald, court green, basketball orange, motion cues, and large projection controls, but the workspace itself should remain restrained.

The current system is a shadcn-style product shell with OKLCH semantic tokens, a light default theme, dark-mode support, and a separate high-impact classroom-screen visual language. The product UI already has a usable foundation, but it drifts between generic SaaS panels, code-editor darkness, glassy gradients, print-document styling, and projection-screen styling.

**Key Characteristics:**

- Product workspace first, brand surface second.
- Three core zones: AI conversation, structured lesson artifact, interactive screen preview.
- Safety, route, timing, scoring, and version control are first-class product information.
- Projection output may be vivid; teacher workspace should stay calm and operational.

## 2. Colors

The workspace palette is restrained neutral with a PE-green brand accent. Projection screens may use sport-specific palettes, but the authoring UI should not import every projection color into the chrome.

### Primary

- **Instruction Ink** (`oklch(0.21 0.006 285.885)`): default primary actions and high-emphasis text in the workspace.
- **PE Green** (`oklch(0.527 0.154 157.571)`): brand identity, successful progress, selected states, and AI generation cues.

### Secondary

- **Basketball Orange** (`#f97316`): sport-specific projection theme color, not a general workspace decoration color.
- **Gym Lime** (`#bef264`): projection accent for high-visibility controls and score actions.

### Neutral

- **Paper White** (`oklch(1 0 0)`): default workspace surface.
- **Quiet Zinc** (`oklch(0.967 0.001 286.375)`): muted panels and empty states.
- **Border Zinc** (`oklch(0.92 0.004 286.032)`): low-emphasis separators.

### Named Rules

**The Workspace Restraint Rule.** Use PE Green for selection, confirmation, and AI state. Do not sprinkle green and orange as decoration across every card.

**The Projection Exception Rule.** The classroom screen can be bold, high contrast, and sport-themed because it is read from distance. The authoring UI should not mimic that intensity.

## 3. Typography

**Display Font:** Inter with system fallbacks
**Body Font:** Inter with system fallbacks
**Document Font:** SimSun, Songti SC, Microsoft YaHei for formal lesson output

**Character:** The product UI uses a familiar sans-serif to reduce friction. Formal lesson preview intentionally switches to Chinese document fonts because it is a print artifact, not app chrome.

### Hierarchy

- **Display** (900, `3.75rem`, tight): landing and auth page hero headings only.
- **Title** (700, `1.25rem`, 1.25): panel titles, artifact headers, key empty-state titles.
- **Body** (400, `1rem`, 1.75): explanatory prose and onboarding copy.
- **Label** (600, `0.75rem`, 1.4): status labels, tool metadata, tabs, and compact UI text.

### Named Rules

**The Product Font Rule.** System-like sans typography is acceptable here. Do not introduce expressive display fonts into buttons, labels, data tables, or teacher workflow controls.

## 4. Elevation

The workspace should use low elevation: borders, tonal panels, and small shadows. Heavy shadows belong only to transient overlays or projection-preview framing. The current code uses several custom shadows and radial backgrounds; consolidate them into a few panel treatments.

### Shadow Vocabulary

- **Panel Rest** (`shadow-xs` or none): default cards and workspace panels.
- **Overlay** (`shadow-lg`): dialogs, sheets, and floating mobile controls.
- **Projection Frame** (`shadow-lg` with dark surface): only for the screen preview area.

### Named Rules

**The State-Over-Decoration Rule.** Elevation should explain layering, focus, or modality. Do not use glassmorphism or large ambient glow as a default surface style.

## 5. Components

### Buttons

- **Shape:** medium radius (`0.5rem` to `0.875rem`) for product controls; larger pill shapes only for landing input and projection controls.
- **Primary:** dark neutral for standard product confirmation.
- **Brand:** PE Green for generation, confirmation, selected, and success actions.
- **Hover / Focus:** tokenized color shift plus visible focus ring. Avoid layout-changing animation.

### Cards / Containers

- **Corner Style:** product panels should use `rounded-2xl`; marketing and empty states may use `rounded-3xl`.
- **Background:** semantic tokens (`bg-card`, `bg-background`, `bg-muted`) should dominate.
- **Shadow Strategy:** default to border plus subtle shadow. Avoid nested cards unless one layer is clearly modal or preview content.
- **Internal Padding:** dense workspace panels use `p-3` to `p-5`; landing/auth containers can use `p-6` to `p-8`.

### Workspace Panels

- **Left Panel:** AI conversation and prompt input. It owns natural-language generation and local modification requests.
- **Right Panel:** Artifact workspace. It owns formal lesson preview, interactive screen preview, export, version inspection, and the desktop "confirm and generate screen" action.

The workspace has two primary task columns: conversation and artifact. Do not add a persistent Project State column; structured teaching decisions belong inside the artifact workspace where the teacher reviews and confirms the generated output.

### State Surfaces

- **Empty State:** use `StateNotice` from `web/src/components/ui/state-surface.tsx`. Do not hand-write dashed empty boxes in workspace, auth, or artifact surfaces.
- **Loading State:** use `StateLoading` for account, project-directory, artifact, and similar waits.
- **Selectable Item:** use `SelectableSurface` for project, version, source, or future template list rows when the row represents a recoverable object.
- **State Container:** use `StateSurface` when the copy or layout is custom but the surface semantics are still empty, pending, or instructional.
- **Escalation Rule:** keep workspace-specific panel chrome in `components/workspace`, but keep cross-domain state surfaces in `components/ui`.

### Inputs / Fields

- **Style:** tokenized border, transparent or card background, clear placeholder, no hidden labels.
- **Focus:** brand-tinted ring and border shift.
- **Error / Disabled:** use semantic destructive/disabled tokens and keep copy actionable.

### Navigation

- **Workspace rail:** compact icon rail with tooltips is valid on desktop, but mobile needs a visible route into the chat and project drawer.
- **Tabs:** lesson, canvas, and versions are the core artifact navigation. Keep labels short and stable.

### Projection Screen

- **Canvas:** 1920x1080, 16:9, high contrast.
- **Controls:** large, touch-friendly, readable from distance.
- **Theme:** sport-specific palettes are allowed, but each module must preserve legibility and safety reminders.

## 6. Do's and Don'ts

### Do

- Keep teacher next action visible in every state.
- Tie visual emphasis to generation, confirmation, safety, timing, scoring, or version control.
- Use semantic tokens for app chrome.
- Keep projection output visually stronger than the workspace.
- Preserve large readable Chinese text in formal lesson and classroom screen outputs.

### Don't

- Do not use pure black or pure white as decorative surfaces when a tokenized tinted neutral exists.
- Do not use side-stripe borders for blockquotes or cards.
- Do not mix Tailwind raw color families into core workspace components without a good reason.
- Do not make every empty state a centered card with the same icon-heading-paragraph pattern.
- Do not hide safety-critical operations behind decorative motion or low-contrast text.
