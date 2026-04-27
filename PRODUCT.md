# Product

## Register

product

## Users

Primary users are elementary-school PE teachers and PE teaching groups preparing real classroom activities. They work under time pressure, often need to explain movement rules to young students, and must coordinate groups, safety, equipment, scoring, timing, and classroom flow while teaching.

The main MVP context is a third-grade basketball dribbling relay lesson for 40 students using half a basketball court, 20 basketballs, and 8 cones.

## Product Purpose

Yueke is an AI-assisted workspace for collaboratively creating PE lesson plans and classroom projection screens. It is not a generic lesson-plan generator, a sports PPT generator, or a free-form HTML generator.

The product helps teachers move from a natural-language lesson request to a validated structured lesson plan, then to a reusable interactive classroom screen with timing, scoring, routes, safety reminders, and versioned iteration.

Success means a teacher can generate a usable first draft, review it, apply local modifications through conversation, preview the classroom screen, export a single-file HTML projection screen, and use the result in a real PE class without losing control of safety-critical decisions.

## Brand Personality

Practical, energetic, and trustworthy.

The interface should feel like a calm teaching command center for an active gym class: clear enough for a tired teacher after school, vivid enough for PE, and restrained enough that safety and lesson structure remain authoritative.

## Anti-references

- Do not look like a generic SaaS dashboard with decorative cards and meaningless metrics.
- Do not become a universal AI content generator.
- Do not use uncontrolled AI-generated HTML as the source of truth.
- Do not bury safety, route, equipment, and class-size decisions behind decoration.
- Do not make classroom projection output feel like a static PPT slide.
- Do not treat PE values as slogan walls; fold teamwork, fairness, and safety into usable classroom actions.

## Design Principles

1. Structure before spectacle. Lesson flow, route, teams, timer, scoring, and safety rules must stay more important than visual flourish.
2. Teacher remains in control. AI proposes local changes; the teacher confirms, edits, restores, and exports.
3. Classroom visibility matters. Projection screens need large controls, strong contrast, simple hierarchy, and fast recognition from a distance.
4. One real case beats ten imaginary features. Optimize the MVP around the basketball relay classroom loop before expanding to more sports.
5. Every state must teach the next action. Empty, loading, error, streaming, ready, and version states should explain what the teacher can do now.

## Accessibility & Inclusion

Target WCAG AA for the web workspace. Preserve visible focus, semantic buttons, readable Chinese typography, keyboard access for primary controls, and sufficient contrast in light and dark themes.

Projection screens should support high contrast, large type, reduced cognitive load, and simple interaction for teachers operating under physical classroom conditions.
