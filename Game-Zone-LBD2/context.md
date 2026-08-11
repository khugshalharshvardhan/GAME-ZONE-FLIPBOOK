# Project Context

This repository is a browser game built with plain HTML, CSS, and vanilla ES modules.

## What The Project Is

- `index.html` is the entry point.
- `js/main.js` bootstraps the app after `DOMContentLoaded`.
- The game is a drag-and-drop coin/note matching experience.
- Levels are currently handled in `js/dragDrop.js`.
- Success effects are handled in `js/ticketBurst.js`.

## Main Files

- [`index.html`](./index.html) - page structure and asset references.
- [`js/main.js`](./js/main.js) - app startup and play button flow.
- [`js/dragDrop.js`](./js/dragDrop.js) - drag/drop, touch support, levels, tutorial nudges, sounds, and success/failure logic.
- [`js/ticketBurst.js`](./js/ticketBurst.js) - ticket/confetti success animation.
- [`css/base.css`](./css/base.css) - reset and base page styles.
- [`css/layout.css`](./css/layout.css) - main cabinet layout and overlays.
- [`css/animation.css`](./css/animation.css) - motion effects, tutorial animation, and success burst animation.
- [`css/dropzone.css`](./css/dropzone.css) - dropzone, tray, and dropped item layout.
- [`css/tray.css`](./css/tray.css) - money tray styling.
- [`css/screen0.css`](./css/screen0.css) - start screen styling.
- [`css/responsive.css`](./css/responsive.css) - responsive adjustments.

## Asset Structure

- Images live in `assets/images/`.
- Money images are in `assets/images/Money/`.
- Confetti and ticket art are in `assets/images/Confetti/`.
- Sound effects are in `assets/sounds/`.

## Runtime Notes

- The app is designed to run directly in the browser.
- There is no build step visible in the repo.
- JavaScript is loaded as a module from `index.html`.
- The game container uses absolute positioning and viewport-based sizing, so layout changes should be tested at different window sizes.

## Important Behavior

- The start screen must be clicked before `initDragDrop()` runs.
- Dragging works for both mouse and touch.
- Dropping a coin/note into the dropzone updates the running total.
- Clicking the check button triggers success or error state.
- Success currently shows the ticket burst animation and then transitions levels.
- The first level also uses a tutorial ghost-coin animation and inactivity nudge.

## Recent Fixes To Preserve

- The tutorial ghost coin in `js/dragDrop.js` is intentionally guarded so the start-screen click does not cancel the Level 1 tutorial.
- The ghost coin animation is forced to restart cleanly by resetting its animation and forcing a reflow before replaying it.

## Working Rules For Future Changes

- Prefer small focused edits.
- Keep asset paths exact, including case and spaces.
- Do not rename files unless necessary.
- If adding new animations, check both CSS timing and the JS trigger.
- If a visual element is created dynamically, verify both its class name and its positioning context.

## Good Handoff Prompt For Another Agent

Use this repo context and then inspect the relevant file(s) before editing:

- "Read `context.md`, then inspect the relevant JS/CSS files and make the requested change."

## Current State

- `js/dragDrop.js` is currently modified in the workspace.
- That change is related to the ghost coin tutorial behavior.

