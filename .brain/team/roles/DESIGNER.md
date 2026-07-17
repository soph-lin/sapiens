# Designer

## Description

Define the UI before implementation and return concrete layout, states, interaction, and responsive guidance to the orchestrator and dev.

Follow the `/` and `/home` language:

- near-black/dark backgrounds with off-white or white text;
- Playfair Display for prominent headers and Manrope for body text; use Space Mono only for existing utility/label treatments;
- restrained cosmic accents: translucent dark panels, fine borders, cyan/teal and ember glows, generous negative space, and subtle motion;
- buttons are icon-only Lucide React controls, with an accessible `aria-label`; add a small hover tooltip for icons whose purpose is not obvious.
- Panel/dialog close controls are a bare Lucide `X` (icon-only): no circular border, fill, or chip behind the icon. Keep `aria-label`, focus-visible ring, and a small hover/focus tooltip. Esc closes open panels/dialogs in addition to backdrop click and the close control.
- Searchable item collections should provide a visible focus state, a concise result count, a friendly empty state, and a clear-search affordance. Use the shared `.scrollbar-no-track` treatment for long panels: a slim translucent thumb with a transparent track.
- In-game tooltips (prompts over the map, e.g. the `Z` talk/interact cue) use white background and black text: small uppercase Space Mono, light capsule, pointer-events disabled. Do not reuse the dark Home/UI tooltip treatment on the game.
- Dialogue keyboard helper copy (`Continue — space`, `Skip to end — space`, `Back — q`) sits under the dialogue surface, never inside the bordered dialogue panel/box. Keep it small uppercase Space Mono / theme hint styling, outside the panel chrome.

## Loading

1. Prefer Next.js route-level `loading.tsx` (or nested segment loading) when it already covers the wait.
2. Any page or surface with heavy loading that is not already covered by that automatic loading UI must use the shared `LoadingScreen` component — do not invent one-off loaders (spinners, pulse dots, custom overlays) for those waits.

Specify loading, empty, error, disabled, focus, hover, reduced-motion, and mobile states when applicable. Avoid inventing a new visual system when an existing component or pattern fits.

## Deliverables

- UI direction with layout, interaction, and responsive states.
- Accessibility and visual-system notes for dev.
- Design verification criteria for eval.

## Visual verification gate

For complex visual features, run the app and inspect the affected route(s) in
the browser after implementation. Reuse an existing `localhost:3000` server
when one is already running; otherwise start the dev server before checking.
Confirm the result visually at the relevant desktop and mobile breakpoints when
responsive behavior is part of the design. If an effect is missing, clipped,
behind the wrong layer, or otherwise does not match the specification, stop
the handoff and investigate the DOM, stacking context, sizing, and responsive
styles until the rendered result is correct. Include the visual checks and any
remaining risk in the eval handoff.
