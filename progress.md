# Progress — The Story Night Flipbook

Context document for the current state of this project: what it is, what has been
changed, how the new systems work, and where to tune things. Last updated: **2026-07-15**.

---

## What this project is

A zero-build, framework-free interactive 3D storybook that runs by opening
`index.html` directly in a browser (works on `file://`, no server needed).
A closed hardcover book sits on a starlit-night background; tapping the gold
Play orb swings the cover open (6s hinge animation), then the reader flips
through full-bleed 16:9 video/image pages, ending on a cream "THE END" page
with a Replay button.

### Files

| File | Role |
|---|---|
| `index.html` | Static skeleton: 3D cover assembly, empty `#flipbook` (JS fills it), fixed chrome (Home button, corner arrows), portrait-rotate overlay |
| `script.js` | All behaviour. **Content zone** at the top (`pages` array — the only thing to edit for story changes) + the engine below |
| `styles.css` | Theme tokens (night palette, fonts, animation timings), book layout, cover/close animations, peel layers |
| `sfx-data.js` | Auto-generated: two one-shot SFX as base64 data URIs (Web Audio works on `file://`) — do not hand-edit |
| `gsap.min.js` | **Vendored GSAP 3.13.0** (added this session) — powers the peel engine; local so offline/`file://` keeps working |
| `assets/` | Page videos/images + `posters/` (first-frame webp per video, auto-derived path) |
| `sfx/` | Page flip, cover flip, BG music (20% volume), title voice-over (.ogg — no Safari) |

### Core layout concept

The book is a fixed **1280×720** internal coordinate space ("book space"),
uniformly scaled to the viewport by `fitScale()` via a single CSS transform.
All geometry (pages, bubbles, the peel math) works in book-space px.
Turned pages rest at `rotateY(-180deg)` about the **left spine** — i.e. parked
off-book to the LEFT (the visible tan strip = "left panel").

---

## Work completed this session

### 1. GSAP integration (vendored)
- `gsap.min.js` downloaded locally, loaded in `index.html` before `sfx-data.js`.
- Everything GSAP-driven degrades gracefully: if GSAP fails to load **or the
  user prefers reduced motion**, the engine falls back to the original
  CSS-transition rigid hinge flip (`const G = ...` gate near `FLIP_S`).

### 2. Corner-peel page turn (the current flip) — user-chosen style
The user explicitly chose **turn.js-style corner peel** over a rigid 3D hinge
(and over two-page spread / soft fold). "Real book flip" to them = visible
sheet bending/peeling. **Preserve this style in future work.**

**PAGE-PEEL ENGINE** (`script.js`, search `PAGE-PEEL ENGINE`):
- Everything derives from `P` = current position of the page's bottom-right
  corner. Rest = `(PW, PH)` = (1280, 720); fully turned = `(-PW, PH)`.
- The **fold line** is the perpendicular bisector of corner-rest ↔ `P`.
  - Leaf front gets `clip-path` = page ∩ un-peeled half-plane (Sutherland–Hodgman, `clipHalf`).
  - The folded-over part = peeled region **reflected** across the fold, drawn as
    the sheet's blank tan back (`.peel-fold`, dynamic clip + crease gradient).
  - Shadows: a fold-hugging gradient on the flat part (`.peel-crease`, child of
    the leaf so the leaf's clip crops it) + a drop-shadow on `.peel-foldwrap`.
- A full forward peel ends folded over the spine — geometrically identical to
  the `.flipped` class pose, so all existing class semantics still work.
- Drivers:
  - **Arrows/keyboard**: corner travels a lifting Bézier (`peelPath`), tweened
    `FLIP_S` (1.15s) with `power2.inOut` → `peelTurn()`.
  - **Drag**: corner follows the finger 1:1 anywhere (`bookPt` + grab offset),
    clamped so paper can't stretch (`clampPeelP`, spine-anchor radii). Release
    completes/settles with distance-scaled duration. Thresholds `0.15/0.85`
    progress, or a flick (`FLICK` px/ms).
  - **Idle hint**: ghost peek = corner lift to `t=0.12` and back (in `peekFlip`).
- Cleanup contract: `peelEnd()` clears clip/layers, re-applies resting classes
  with transitions suppressed. `cancelPeek()` / `resetToStart()` also clear.

### 3. Left-panel landing continuity fix
Problem: the turned page vanished near the end of the turn, then popped into
the left panel after completion — because `.peel-foldwrap` only covered the
book box and CSS crops backgrounds at the element box.
- Fix: `.peel-foldwrap` spans **one page-width left** of the book
  (`left: -100%`); fold clip x-coords are shifted `+PW` into the wider box;
  gradient-line math uses the 2560-wide box (`FW`, `L2`, `s2` in `renderPeel`).
- Plus a **landing blend**: shading strength `k` ramps in as the corner lifts
  and melts away over the last 20% of the turn (`p01`, `kOut` in `renderPeel`),
  with crease/roll colors eased back to resting paper tones (`mixRGB`) and the
  drop shadow fading — so the swap to the parked page is invisible.

### 4. UI cleanup + hardening pass
- **Page counter removed**: the `#progress` "Page X / N" chip, its `.toolbar`
  markup and CSS are gone. `updateProgress()` remains but now only manages nav
  state (Home visibility + arrow disabled states).
- **Corner arrows enlarged**: `clamp(68px, 8vw, 94px)` (was 52–70px).
- Bug fixes:
  - `renderPeel` guards degenerate (<3-point) peel polygons — an invalid
    `polygon()` would have rendered the fold layer UNCLIPPED (full-box tan flash).
  - `resetToStart()` now clears `animating` — a stuck flag would have silently
    blocked every flip after reopening.
  - Sound header comment corrected (BG music is 20%, not 40%).

### 5. Page-1 video → WebM (2026-07-15)
- The user re-authored `assets/1 page.mp4` (25.3s, 1080p30). Converted to
  **`assets/1 page.webm`** (VP9 CRF 32 + Opus 112k): 5.0 MB vs 12.8 MB — much
  lighter to buffer. `pages[0].src` now points at the .webm; the mp4 remains on
  disk as the edit source but is never loaded by the book.
- Regenerated `assets/posters/1 page.webp` from the new video's frame 0
  (posters must match frame 0 so playback starts without a visual jump).
- **Poster derivation now handles .webm** (`makeMedia`): the regex was
  `.mp4→.webp` only; a .webm page would have requested a nonexistent poster.
- No ffmpeg on this machine: a full build was downloaded to the session
  scratchpad (gyan.dev release-essentials) — re-download if needed again;
  Playwright's bundled ffmpeg can't decode H.264/AAC.

### 6. Closed book = flat "real book" front view (was a bare frame)
The user rejected a 3/4 3D tilt (tried first) and supplied reference art:
straight-on FLAT view whose book-ness comes from ANATOMY, not rotation:
- **Spine band** — `.cover .front::before`: a 38px darker band down the left
  edge with gold double-bands at head + tail. 38px wide on purpose: it ends
  before the gold cover-frame SVG's left rule (x=40) so they don't collide.
  Masked by `.back-fill` as soon as the cover starts opening.
- **Page stack + back-cover lip** — `.pb-pages` / `.pb-back-lip` (markup inside
  `.pageblock` in index.html): parchment page edges peek out UNDER the front
  cover, resting on a purple back-cover lip that pokes out further right +
  below. They live in `.pageblock` so they fade out automatically as the book
  opens, and `translateZ` keeps them behind the cover board (z ≈ +30).
- `.book-inner` closed transform is `none` (flat) — no leveling step needed;
  Play calls `runOpenSequence()` directly. The 3D edge faces keep their
  parchment stripe recolour + `--thick` 56px (edge-on/invisible when closed,
  harmless). Headless tests still wait 7000ms after Play (extra margin only).

### 7. Real-book close (Home / Replay)
`closeBookToCover()` now closes in two beats:
1. **`cascadeClose()`** — every turned page riffles back right, one after
   another: most recently turned falls first, each later sheet lands ON TOP
   (so page 1 ends on top). 380ms fall, `power2.in`, 85ms stagger, a flip
   sound per sheet. Pages stay above the parked cover for this phase.
2. Then the original cover hinge swing (`coverClose`, 2s) + `resetToStart()`.
- `is-closing` (which hides the flipped pile) is applied only in beat 2.
- No GSAP / nothing turned → beat 1 is skipped (old instant close).

---

## Key constants & tuning knobs

| What | Where |
|---|---|
| Flip duration | `FLIP_MS` (script.js) **must equal** `--flip-ms` (styles.css) — 1150ms; flip sound synced |
| Cover open/close durations | `COVER_OPEN_MS` 6000 / `COVER_CLOSE_MS` 2000 — must match the CSS keyframes |
| Peel arc height | Bézier control in `peelPath` (the `620`) |
| Peel crease/roll shading | gradient stops + colors in `renderPeel` |
| Landing blend window | the `0.8` / `0.2` pair (`kOut`) in `renderPeel` |
| Drag completion | `0.15` / `0.85` progress thresholds in `endDrag`'s peel branch; `FLICK = 0.45` |
| Riffle feel | `cascadeClose`: `0.085` stagger, `0.38` fall, `power2.in` |
| Page content | the `pages` array at the top of script.js |

---

## Verification setup (headless)

No test framework in-repo; changes were verified by driving the real app:
- `npm i playwright-core` in a scratch dir + cached Chromium at
  `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1223\chrome-headless-shell-win64\chrome-headless-shell.exe`
  (verify the versioned folder still exists before reuse).
- Flow: open `index.html` via `file:///`, click `#hint`, wait ~6.3s for the
  cover, then drive `#cornerNext` / `#homeBtn` / mouse drags; assert on
  clip-paths, classes, inline styles; screenshot mid-animation.
- Expected console noise: exactly one `ERR_FILE_NOT_FOUND` for
  `assets/hand-nudge.png` (intentional — emoji 👆 fallback is by design).

---

## Known quirks / pre-existing issues (not introduced this session)

- **Dead LBD game code**: ~100 lines of "Stairway Shuffle" overlay logic in
  script.js + `.lbd-stage` CSS reference elements that no longer exist
  (`#lbdStage`/`#lbdFrame` are null; all calls no-op safely). Safe to strip.
- **Orphaned CSS**: `#leaves`, `.page-base`, `.bookplate`, `.end-note`,
  `.cover-photo`, `.arrow` style elements not present in the markup.
- Title voice-over is `.ogg` → silent on Safari/iOS (needs an .m4a/.mp3 twin).
- BG music comment says 40% in one header; code truth is `volume = 0.20`.
- Timing constants are intentionally duplicated between JS and CSS — edit both.

## Possible next steps

- Strip the dead LBD + orphaned CSS for a leaner file.
- Add an .m4a fallback for the title VO (Safari).
- Optional: speech bubbles per page (the `bubble` config in `pages` is wired
  up but unused by the current content).
