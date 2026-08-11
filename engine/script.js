/* ============================================================================
   THE STORY NIGHT — flipbook behaviour.
   Diagnostic first: surface any REAL JavaScript error on screen (a silent error
   would stop the click handlers from ever attaching). Image / video / network
   load failures are ignored — they have no .message and are handled per-element.
   ============================================================================ */
window.addEventListener("error", function (ev) {
  if (!ev || !ev.message) return;                 // ignore resource-load errors
  var b = document.getElementById("__jsErr");
  if (!b) {
    b = document.createElement("div");
    b.id = "__jsErr";
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:100000;" +
      "background:#b00020;color:#fff;font:13px/1.5 monospace;padding:10px;white-space:pre-wrap";
    (document.body || document.documentElement).appendChild(b);
  }
  b.textContent = "JavaScript error (this is likely why the book won't open):\n" +
    ev.message + "\n" + (ev.filename || "") + " : line " + ev.lineno;
});

// If you can read this line in the console, the script parsed with NO syntax
// error and you are running the CURRENT file (not a cached copy).
console.log("%c[flipbook] loaded — 3D book, full-bleed pages, speech bubbles.",
            "font-weight:bold;color:#7d5fd0;font-size:13px");

/* ============================================================================
   ██  THE STORY LIVES IN  story.js  —  edit THAT file, not this one  ██
   ----------------------------------------------------------------------------
   story.js sets  window.STORY = { cover, music, pages }.  Everything below is
   the reusable ENGINE — the book, the flip physics, the buttons, the
   dialogue/scene player. You should not need to touch it to make a new story.
   ============================================================================ */
const STORY = window.STORY || {};

// Cover art — themed from story.js so the whole book is configured in one place.
(function () {
  const ci = document.querySelector(".cover-img");
  if (ci && STORY.cover) ci.style.backgroundImage = "url('" + encodeURI(STORY.cover) + "')";
})();
const pages = STORY.pages || [];   // ← the story's pages (defined in story.js)

/* ---- Build one page face's media (image OR video OR lbd poster) ---------- */
function makeMedia(page) {
  // An "lbd" page shows a STILL poster on the leaf (that is what you see while the
  // page turns). The live, interactive game is the separate body-level overlay
  // iframe — see the LBD GAME PAGES section below.
  if (page.type === "lbd") {
    const img = document.createElement("img");
    img.className = "page-media";
    img.draggable = false;
    img.addEventListener("dragstart", function (e) { e.preventDefault(); });
    img.decoding = "async";
    img.src = page.poster || "";
    img.alt = page.alt || "Game Zone activity";
    return img;
  }
  const media = page.type === "video"
    ? document.createElement("video")
    : document.createElement("img");
  media.className = "page-media";
  media.draggable = false;                           // never let the image "ghost-drag" out
  media.addEventListener("dragstart", function (e) { e.preventDefault(); });
  media.src = page.src;
  if (page.type === "video") {
    media.loop = false;
    media.playsInline = true;
    media.setAttribute("playsinline", "");            // iOS Safari inline playback
    media.setAttribute("webkit-playsinline", "");
    // FIRST-FRAME POSTER: the page surface (--paper) is deep night-blue, so a video
    // that hasn't painted a frame yet (still buffering, or autoplay was blocked) would
    // show as a BLANK dark-blue page. The poster is that clip's own frame 0, so the
    // scene shows INSTANTLY and — because it equals where playback starts — there's no
    // jump when the video then plays. Posters are tiny (~40KB) and live in assets/posters/.
    media.setAttribute("poster",
      page.src.replace(/^assets\//, "assets/posters/").replace(/\.(mp4|webm)$/i, ".webp"));
    // LAZY: do NOT eager-buffer. With 25 videos, preload="auto" made the browser
    // open + decode every clip on load (huge memory/CPU spike + open lag). We only
    // buffer the page you're on + the next one, on demand (see warmVideo()).
    media.preload = "none";
    // Tap the video to (re)start it WITH sound — a guaranteed user gesture, so
    // browsers that blocked the auto-start's audio will now allow it.
    media.addEventListener("click", function () {
      media.muted = false;
      try { if (media.ended) media.currentTime = 0; } catch (_) {}
      const p = media.play(); if (p && p.catch) p.catch(function () {});
    });
    // When THIS page's video FULLY finishes the page counts as READ. dialogueDone()
    // does everything from here: it reveals the forward arrow AND fires the nudge in
    // the same breath (see HINT_AFTER_DONE_MS = 0), so the arrow and the hand appear
    // together and keep going until the reader taps.
    media.addEventListener("ended", function () {
      if (!leaves[flipped] || !leaves[flipped].contains(media)) return;   // only the current page
      dialogueDone(flipped);
    });
    // SAFETY NET: NEXT now depends on "ended" firing. If a clip can't load or decode
    // it would never fire and the reader would be stranded with no way forward, so
    // treat a media error as "read" and release the arrow.
    media.addEventListener("error", function () {
      if (leaves[flipped] && leaves[flipped].contains(media)) dialogueDone(flipped);
    });
  } else {
    media.decoding = "async";
    media.alt = page.alt || "story page";
  }
  return media;
}

/* ---- Build one speech bubble (hidden until the page fully lands) ---------
   The bubble artwork + crop live in styles.css (.bubble.neel / .bubble.everywhere).
   Here we only apply the per-page geometry (position, width, flip) + the text. */
function makeBubble(bubble) {
  const wrap = document.createElement("div");
  wrap.className = "bubble" + (bubble.kind ? " " + bubble.kind : "");

  const box = bubble.box || {};
  ["top", "left", "right", "bottom"].forEach(function (k) {
    if (box[k] != null) wrap.style[k] = box[k];
  });
  if (box.w != null) wrap.style.setProperty("--w", box.w + "px");

  // FIT: the bubble art is a wide flat rectangle, so at its natural aspect a
  // 1-2 line text leaves big margins above/below. Squash the art vertically
  // (--sq, used by .bubble.speech CSS) to comfortably wrap the text block:
  //   needed  = lines × line-height (--dialogue-fs 21.33px × 1.2) + padding
  //   natural = the art's body height (above the tail) at this width
  // The text itself NEVER scales (32 Semi Bold rule) — only the bubble does.
  if (bubble.kind === "speech" && bubble.text && box.w) {
    const lines = String(bubble.text).split("\n").length;
    const needH = lines * (32 * 2 / 3) * 1.2 + 42;   // keep font in sync with --dialogue-fs
    const artH  = box.w * 0.4405;
    wrap.style.setProperty("--sq", Math.max(0.7, Math.min(1, needH / artH)).toFixed(3));
  }

  const bg = document.createElement("div");
  bg.className = "bubble-bg" + (bubble.flip ? " flip" : "");
  wrap.appendChild(bg);

  if (bubble.text) {
    const t = document.createElement("div");
    t.className = "bubble-text";
    t.textContent = bubble.text;
    t.dataset.full = bubble.text;              // kept so the typewriter can replay
    if (bubble.textLeft) t.style.left = bubble.textLeft;
    if (bubble.textTop)  t.style.top  = bubble.textTop;
    if (bubble.fontSize) t.style.fontSize = bubble.fontSize;
    wrap.appendChild(t);
  }
  if (bubble.typeSpeed) wrap.dataset.typeSpeed = bubble.typeSpeed;   // ms/char
  return wrap;
}

/* ---- Build one scene's ambient FX layer (fx: on a scene) -----------------
   Types: "scan" (pure CSS beam), "popcorn" (falling kernels), "sparkle"
   (gold twinkles), {type:"pulse", x, y} (breathing glow at a point),
   "shake" (whole-scene jitter — a class on the layer, no element).
   Particle positions/timings are randomized once at build; the loops are
   pure CSS so they cost nothing to run. */
function makeFx(fx, layer) {
  const cfg = typeof fx === "string" ? { type: fx } : fx;
  if (cfg.type === "shake") {                  // CSS on the layer's media
    layer.classList.add("fx-shake");
    return null;
  }
  const el = document.createElement("div");
  el.className = "fx fx-" + cfg.type;
  el.setAttribute("aria-hidden", "true");
  if (cfg.type === "popcorn") {
    for (let i = 0; i < 14; i++) {             // kernels spill from the machine
      const k = document.createElement("i");
      k.className = "fx-kernel";
      k.style.left = (24 + Math.random() * 46) + "%";
      k.style.top  = (26 + Math.random() * 10) + "%";
      k.style.animationDelay    = (Math.random() * 2.4).toFixed(2) + "s";
      k.style.animationDuration = (1.7 + Math.random() * 1.1).toFixed(2) + "s";
      k.style.setProperty("--kx", (Math.random() * 140 - 70).toFixed(0) + "px");
      k.style.setProperty("--kr", (Math.random() * 500 - 250).toFixed(0) + "deg");
      k.style.setProperty("--ks", (0.6 + Math.random() * 0.7).toFixed(2));
      el.appendChild(k);
    }
  } else if (cfg.type === "sparkle") {
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("i");
      s.className = "fx-spark";
      s.style.left = (8 + Math.random() * 84) + "%";
      s.style.top  = (8 + Math.random() * 72) + "%";
      s.style.animationDelay    = (Math.random() * 2.8).toFixed(2) + "s";
      s.style.animationDuration = (1.5 + Math.random() * 1.4).toFixed(2) + "s";
      el.appendChild(s);
    }
  } else if (cfg.type === "pulse") {
    const p = document.createElement("i");
    p.className = "fx-glow";
    p.style.left = cfg.x || "50%";
    p.style.top  = cfg.y || "50%";
    // Optional w/h (book-space px) shape the glow to what it sits on — a wide,
    // short cluster of objects wants an oval. Omitted → the default 170px disc.
    if (cfg.w != null) p.style.setProperty("--gw", cfg.w + "px");
    if (cfg.h != null) p.style.setProperty("--gh", cfg.h + "px");
    // bright: the glow ADDS light (screen blend) instead of washing over the art —
    // needed whenever the thing glowing is already lit (neon, screens, fire).
    if (cfg.bright) el.classList.add("fx-bright");
    el.appendChild(p);
  }
  // A {from,to} window means "only during this slice of the page video" — the
  // layer starts hidden and wireTimedFx fades it in/out (see below).
  if (cfg.from != null || cfg.to != null) el.classList.add("fx-timed");
  return el;
}

/* ---- Time-windowed fx on a single-media page -----------------------------
   An fx anchored to a POINT only stays on target while the shot holds still. A
   page video that cuts or wipes to new framing would leave the glow stranded
   over the wrong thing, so `fx: { …, from, to }` (seconds on that video's own
   timeline) limits it to the shot it belongs to.
   Driven by `timeupdate` (~4×/s) with a 420ms CSS fade, so the coarse tick is
   invisible. Also hidden while the video is paused/ended, and it re-syncs on
   seek — so flipping away and back, or replaying, behaves. */
function wireTimedFx(front, fxEl, fx) {
  const from = (fx.from == null) ? 0 : +fx.from;
  const to   = (fx.to   == null) ? Infinity : +fx.to;
  const v    = front.querySelector("video.page-media");
  if (!v) { fxEl.classList.add("fx-on"); return; }   // still image → just show it
  function sync() {
    const t = v.currentTime;
    fxEl.classList.toggle("fx-on", !v.paused && !v.ended && t >= from && t < to);
  }
  ["timeupdate", "play", "playing", "pause", "seeked", "ended", "emptied"]
    .forEach(function (ev) { v.addEventListener(ev, sync); });
  sync();
}

/* ---- Build the pages (one CSS 3D "leaf" per entry) ---------------------- */
const flipbookEl  = document.getElementById("flipbook");
const pageStackEl = flipbookEl ? flipbookEl.querySelector(".page-stack") : null;   // right-side page stack
const flipScaleEl = document.getElementById("flipScale");
const coverScene  = document.getElementById("coverScene");
// ONE full 16:9 page per view (single display). page 1 = entry 1. The themed
// book frame forms the left spine/cover edge (always visible when open); pages
// flip normally. No two-page spread.
const totalPages = pages.length;

// Each leaf is a full 16:9 page hinged on the LEFT spine:
//   • FRONT = the page's full-bleed image / video (+ its speech bubble, if any).
//   • BACK  = a BLANK parchment sheet (seen edge-on while the page turns).
const leaves = [];
pages.forEach(function (page, i) {
  const leaf = document.createElement("div");
  leaf.className = "leaf";

  const front = document.createElement("div");
  front.className = "face front";
  if (page.type === "end") {
    // THE END — a real final page in the BOOK's own night-and-gold look
    // (template-neutral: nothing story-specific, works for any story).
    front.classList.add("end-page");
    front.innerHTML =
      '<div class="end-page-inner">' +
        '<div class="end-rule" aria-hidden="true"><svg viewBox="0 0 24 24">' +
          '<path fill="currentColor" d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>' +
        '</svg></div>' +
        '<div class="end-title">The End</div>' +
        '<div class="end-rule" aria-hidden="true"><svg viewBox="0 0 24 24">' +
          '<path fill="currentColor" d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>' +
        '</svg></div>' +
        '<button class="replay-btn" id="replayBtn" type="button" aria-label="Read the story again">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>' +
          '</svg>' +
          '<span>Read again</span>' +
        '</button>' +
      '</div>';
  } else if (page.scenes) {
    // MULTI-SCENE page: the storyboard screens stack as full-bleed layers and
    // the scene player (playScenes) cross-dissolves through them. Scene 0
    // starts visible so the page has art on it while it turns. A scene whose
    // src is a video plays when its scene lands (see playScenes).
    page.scenes.forEach(function (sc, si) {
      const layer = document.createElement("div");
      layer.className = "page-scene" + (si === 0 ? " on" : "");
      const isVideo = /\.(mp4|webm)$/i.test(sc.src);
      layer.appendChild(makeMedia({ type: isVideo ? "video" : "image", src: sc.src, alt: sc.alt }));
      if (sc.fx) {
        const fxEl = makeFx(sc.fx, layer);     // ambient animation for this scene
        if (fxEl) layer.appendChild(fxEl);
      }
      if (sc.bubble) layer.appendChild(makeBubble(sc.bubble));
      front.appendChild(layer);
    });
  } else {
    front.appendChild(makeMedia(page));                       // full-bleed image / video
    // Ambient fx on a SINGLE-media page (previously only `scenes` honoured `fx`).
    if (page.fx) {
      const fxEl = makeFx(page.fx, front);
      if (fxEl) {
        front.appendChild(fxEl);
        if (fxEl.classList.contains("fx-timed")) wireTimedFx(front, fxEl, page.fx);
      }
    }
    if (page.bubble) front.appendChild(makeBubble(page.bubble));  // PNG speech bubble (revealed on land)
  }
  const curl = document.createElement("div");               // moving page-curl shading
  curl.className = "curl";
  front.appendChild(curl);

  const back = document.createElement("div");
  back.className = "face back";                             // blank reverse side (no content)
  const backCurl = document.createElement("div");           // sheen for the reverse side —
  backCurl.className = "curl";                              // the front curl is backface-hidden
  back.appendChild(backCurl);                               // past 90°, this shades the landing half

  leaf.appendChild(front);
  leaf.appendChild(back);
  flipbookEl.appendChild(leaf);
  leaves.push(leaf);
});

/* One shared, JS-driven shadow the TURNING sheet casts on the page beneath it —
   swept + faded per-frame from the live flip angle (see applyFlipFX). Hinged at
   the spine so scaleX(cos) mirrors it onto the landing side past 90°. Stacked
   above the resting pages (z250 in CSS), below the turning sheet (z300). */
const flipShadowEl = document.createElement("div");
flipShadowEl.className = "flip-shadow";
flipShadowEl.setAttribute("aria-hidden", "true");
flipbookEl.appendChild(flipShadowEl);

/* ---- State + element references ----------------------------------------- */
const bookStage  = document.getElementById("bookStage");
const book       = document.getElementById("book");
const bookPop    = document.getElementById("bookPop");
const bookFloat  = document.getElementById("bookFloat");
const cover      = document.getElementById("cover");
const hint       = document.getElementById("hint");
const prevBtn    = document.getElementById("prev");
const nextBtn    = document.getElementById("next");
const cornerPrev  = document.getElementById("cornerPrev");
const cornerNext  = document.getElementById("cornerNext");
const replayBtn   = document.getElementById("replayBtn");   // lives on the THE END page (built above)

/* ==========================================================================
   LBD GAME PAGES  —  an interactive activity embedded as a page of the book.
   A page declared  { type:"lbd", src:"Game-Zone-LBD1/index.html", poster:"…" }
   puts its poster on the leaf and, once that page is the current one, parks the
   body-level #lbdStage iframe exactly over the page rectangle and loads the game.
   Leaving the page unloads the iframe (about:blank), which stops the game's audio
   and means the next visit starts fresh at its own home screen.

   Supports ANY NUMBER of lbd pages: the iframe is reused and re-pointed, so only
   one game is ever in memory.

   NOTE on control flow: these games do not message the parent, so the book cannot
   know when one is finished. The overlay therefore never auto-expands or
   auto-advances — the reader uses the normal corner arrows to move on. (If a game
   ever posts {source:"lbd", type:"lbd-complete"}, wire it up here.)
   ========================================================================== */
const lbdStage = document.getElementById("lbdStage");
const lbdFrame = document.getElementById("lbdFrame");
let lbdLoadedSrc = null;                   // which game is currently in the iframe
let lbdReadyTimer = null;                  // fallback reveal if the iframe never fires 'load'
const lbdDone = new Set();                 // activity pages whose game has been finished

// The iframe finished loading → fade the live game in over its matching poster.
function onLbdFrameLoad() {
  lbdFrame.removeEventListener("load", onLbdFrameLoad);
  clearTimeout(lbdReadyTimer);
  if (lbdFrame.getAttribute("src") === "about:blank") return;   // the unload, not a game
  lbdStage.classList.add("ready");
}

/* The games tell the book when they are finished by posting
      { source: "lbd", type: "lbd-complete" }
   to the parent window (see the small block appended to each game's main.js).
   Until that arrives, BOTH corner arrows stay hidden on that page so the game has
   the screen to itself; on arrival they fade in so the reader can go on or back. */
window.addEventListener("message", function (e) {
  const d = e && e.data;
  if (!d || d.source !== "lbd") return;
  const page = pages[flipped];
  if (!page || page.type !== "lbd") return;
  if (d.type === "lbd-start") {
    setLbdFullscreen(true);                // reader tapped PLAY → give it the screen
  } else if (d.type === "lbd-complete") {
    const at = flipped;
    setLbdFullscreen(false);               // finished → shrink back into the book
    lbdDone.add(at);
    // Hand the POINTER back to the book. The overlay is a body-level fixed layer at
    // z600, so while it is live it sits above #flipbook (which owns the corner-drag
    // listeners) and swallows every press on the page — swipe/drag-to-turn was dead
    // on a finished activity, leaving the z700 corner arrows as the only way on even
    // though the nudge hand was miming a swipe. The game is over, so nothing inside
    // the iframe still needs the pointer. Reset on leaving / reloading (see
    // updateLbdOverlay) so replaying the activity is interactive again.
    lbdStage.classList.add("inert");
    // Retire the leaf's title-screen art so it does not turn away with the page.
    spendLbdLeaf(at);
    // The page is NOT turned for the reader. dialogueDone() reveals both arrows and
    // starts the nudge, so the game's "all levels done" screen stays up with the
    // arrow blinking and the hand swiping until the reader chooses to move on.
    dialogueDone(at);
    updateProgress();
  }
});

/* ---- The activity leaf's art, before vs. after the game is finished ---------
   An lbd leaf's poster HAS to be the game's title screen: it is what the reader sees
   while the page turns INTO the activity, and holding the overlay invisible until the
   iframe has painted then makes the handoff a straight swap of two identical pictures
   (see updateLbdOverlay). The moment the game reports FINISHED that same art becomes
   wrong — it would ride the turn AWAY as one last look at the title screen, right
   after the reader has just beaten the game.

   So the art is swapped only at that moment: to the story's `endPoster` for that page
   if one is supplied, otherwise the stale art is simply dropped and the page's own
   paper turns instead. Either way the swap happens underneath the still-opaque game
   overlay, so it is never seen happening.

   restoreSpentLbdLeaves() then puts the title poster back once a turn has settled and
   that page is no longer the current one, so turning back INTO the activity later
   still lines up with the game's own title screen. */
function spendLbdLeaf(idx) {
  const leaf = leaves[idx], page = pages[idx];
  if (!leaf || !page || page.type !== "lbd") return;
  const front = leaf.querySelector(".face.front");
  const img = front && front.querySelector("img.page-media");
  if (!front || !img) return;
  if (page.endPoster) img.src = page.endPoster;
  else front.classList.add("lbd-spent");     // CSS drops the art → bare page paper
}

function restoreSpentLbdLeaves(exceptIdx) {
  pages.forEach(function (page, i) {
    if (page.type !== "lbd" || i === exceptIdx) return;
    const leaf = leaves[i];
    const front = leaf && leaf.querySelector(".face.front");
    const img = front && front.querySelector("img.page-media");
    if (!front || !img) return;
    front.classList.remove("lbd-spent");
    if (page.endPoster && page.poster && img.getAttribute("src") !== page.poster) {
      img.src = page.poster;                 // back to the title screen for a re-entry
    }
  });
}

/* The overlay has TWO sizes:
     • page size  — parked exactly over the book's page rectangle. This is how the
       activity first appears, so its title screen reads as part of the book and
       the reader taps PLAY there.
     • full screen — once the game reports it has started, it takes the whole
       viewport so there is room to actually play; it shrinks back to page size
       when the game reports it has finished. */
let lbdFullscreen = false;

function positionLbdStage() {
  if (!lbdStage) return;
  if (lbdFullscreen) {
    // visualViewport for the same reason fitScale() uses it: on mobile,
    // innerHeight does not shrink for the URL bar and the game would overflow.
    const vv = window.visualViewport;
    lbdStage.style.left   = "0px";
    lbdStage.style.top    = "0px";
    lbdStage.style.width  = Math.round(vv ? vv.width  : window.innerWidth)  + "px";
    lbdStage.style.height = Math.round(vv ? vv.height : window.innerHeight) + "px";
  } else {
    if (!flipScaleEl) return;
    const r = flipScaleEl.getBoundingClientRect();     // the live, scaled page box
    lbdStage.style.left   = r.left   + "px";
    lbdStage.style.top    = r.top    + "px";
    lbdStage.style.width  = r.width  + "px";
    lbdStage.style.height = r.height + "px";
  }
}

/* Grow/shrink between the two sizes with a brief box morph. The transition is
   only switched on for the toggle itself — otherwise simply LANDING on the page
   would make the overlay slide in from wherever it was last. */
let lbdMorphTimer = null;
function setLbdFullscreen(on) {
  if (!lbdStage || lbdFullscreen === on) return;
  lbdFullscreen = on;
  lbdStage.classList.add("lbd-morph");
  positionLbdStage();
  lbdStage.classList.toggle("fullscreen", on);
  clearTimeout(lbdMorphTimer);
  lbdMorphTimer = setTimeout(function () { lbdStage.classList.remove("lbd-morph"); }, 460);
}

// Show + load the game ONLY once we have fully landed on its page; hide + unload
// the moment we leave. Loading late is deliberate: these games start their own
// music/voice-over as soon as they load, which would otherwise bleed onto the
// previous page while it is still being read.
let lbdWasOn = false;                      // so the arrow geometry is only re-laid out on change

function updateLbdOverlay() {
  if (!lbdStage || !lbdFrame) return;
  const page = pages[flipped];
  const onLbd = opened && ready && !animating && page && page.type === "lbd" && page.src;
  // Only once a turn has SETTLED: give every activity we are not currently on its
  // title poster back, ready for a later turn back into it. Guarded on !animating so
  // a finished activity's art is never restored mid-flight — that would put the title
  // screen back on the very sheet that is turning away.
  if (!animating) restoreSpentLbdLeaves(flipped);
  // Entering or leaving an activity swaps the arrows between the viewport's
  // corners (game full screen) and the book's corners — re-run the layout once.
  if (!!onLbd !== lbdWasOn) {
    lbdWasOn = !!onLbd;
    fitScale();
  }
  if (onLbd) {
    positionLbdStage();
    if (lbdLoadedSrc !== page.src) {        // load once per visit, not on every refresh
      lbdStage.classList.remove("ready");   // stay transparent until the game has painted
      lbdStage.classList.remove("inert");   // a freshly loaded game needs the pointer again
      clearTimeout(lbdReadyTimer);
      // The leaf's poster IS the game's title screen, so holding the overlay
      // invisible until 'load' makes the handoff a straight swap of identical
      // pictures instead of poster → dark backdrop → title again.
      lbdFrame.addEventListener("load", onLbdFrameLoad);
      // Safety net: if 'load' never fires (a stalled asset), show it anyway
      // rather than leaving the reader on a dead poster.
      lbdReadyTimer = setTimeout(function () { lbdStage.classList.add("ready"); }, 4000);
      lbdFrame.src = page.src;
      lbdLoadedSrc = page.src;
    }
    lbdStage.classList.add("visible");
    lbdStage.setAttribute("aria-hidden", "false");
  } else {
    lbdStage.classList.remove("visible", "ready", "fullscreen", "lbd-morph", "inert");
    lbdStage.setAttribute("aria-hidden", "true");
    lbdFullscreen = false;                  // next visit starts page-sized again
    clearTimeout(lbdReadyTimer);
    clearTimeout(lbdMorphTimer);
    if (lbdLoadedSrc !== null) {            // unload → game audio stops immediately
      lbdFrame.removeEventListener("load", onLbdFrameLoad);
      lbdFrame.src = "about:blank";
      lbdLoadedSrc = null;
    }
  }
}

let opened = false;      // has the cover been opened?
let ready  = false;      // has the cover FINISHED opening? (flips allowed only then)
let flipped = 0;         // how many leaves are currently turned to the left
let animating = false;   // guard so a new turn can't start mid-flip
const FLIP_MS = 1150;    // keep in sync with --flip-ms in styles.css
const COVER_OPEN_MS = 6000;  // keep in sync with the coverOpen animation in styles.css
const CLOSE_SETTLE_MS = 560;  // keep in sync with the bookSettle animation in styles.css
const COVER_CLOSE_MS  = 2000; // Home/Replay: cover swings shut (reverse open); sync with coverClose in styles.css
let _openTimer = null;   // pending "cover finished opening" timer
let _homeTimer = null;   // pending "cover finished closing → back to the cover" timer

/* ==========================================================================
   GSAP FLIP DRIVER  —  a physical, real-book page turn.
   When GSAP is available (gsap.min.js loads before this file) every turn is a
   multi-phase tween: the page LIFTS with effort (ease-in-out), FALLS under
   gravity (accelerating), touches down and gives a tiny landing BOUNCE. The
   curl shading is synced to the LIVE angle every frame, and a drag release
   falls from the exact angle you let go at, with a distance-scaled duration
   (the fixed-length CSS transition made short releases float unnaturally).
   If GSAP is missing, everything falls back to the original CSS flip.
   ========================================================================== */
// Reduced-motion users keep the CSS fallback: styles.css shortens those flips
// to 260ms, which the GSAP timelines would otherwise bypass.
const G = (window.gsap &&
           !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches))
          ? window.gsap : null;
const FLIP_S = FLIP_MS / 1000;                 // GSAP works in seconds

// Curl shading strength for a given turn angle (same curve the drag uses):
// ramps up to the edge-on point (90°), then back off as the page lies flat.
function curlFor(ang) {
  return (ang <= 90 ? ang / 90 : (180 - ang) / 90) * 0.9;
}

/* ---- Per-frame flip FX ------------------------------------------------------
   Everything that makes the turn read as a flexible SHEET OF PAPER instead of
   a rigid board, all derived from the live angle (0 = flat right, 180 = turned):
     • curl sheen on BOTH faces (front while lifting, back while landing)
     • the cast shadow sweeping across the page beneath the turning sheet
     • paper FLEX: the page media lags behind the board by an amount tied to
       the angular VELOCITY — so it bends on the lift, straightens edge-on and
       flutters on the landing bounce, like real paper
     • a gentle sag + lift of the whole sheet, strongest edge-on (returned to
       the caller: GSAP merges it into the tween; the drag composes it into
       its manual transform string)
   Shared by the GSAP turn, the drag-follow AND the ghost peek. */
let _fxBend = 0, _fxLastAng = null, _fxLastT = 0;
function applyFlipFX(leaf, ang) {
  const rad = ang * Math.PI / 180, s = Math.sin(rad);
  const co = curlFor(ang);
  leaf.querySelectorAll(".curl").forEach(function (c) { c.style.opacity = co; });
  // cast shadow: hinged at the spine; cos sweeps it right → left (mirroring
  // past 90°), sin fades it in and out around the edge-on point
  flipShadowEl.style.transform = "scaleX(" + Math.cos(rad).toFixed(4) + ")";
  flipShadowEl.style.opacity = (s * 0.45).toFixed(3);
  // paper flex: velocity-based lag, smoothed so it eases like real paper
  const now = performance.now();
  if (_fxLastAng != null) {
    const dt = now - _fxLastT;
    const vel = (dt > 0 && dt < 200) ? (ang - _fxLastAng) / dt * 1000 : 0;   // deg/s
    const target = Math.max(-4, Math.min(4, vel * 0.022));
    _fxBend += (target - _fxBend) * 0.28;
  }
  _fxLastAng = ang; _fxLastT = now;
  const media = leaf.querySelector(".page-media");
  if (media) {                                   // only while the front is visible (< 90°)
    media.style.transform = (ang < 95 && Math.abs(_fxBend) > 0.05)
      ? "perspective(1200px) rotateY(" + _fxBend.toFixed(2) + "deg)" +
        " scale(" + (1 + Math.abs(_fxBend) * 0.004).toFixed(4) + ")"
      : "";
  }
  return { sag: 2.2 * s, lift: 30 * s };
}
function clearFlipFX(leaf) {
  if (leaf) {
    leaf.querySelectorAll(".curl").forEach(function (c) { c.style.opacity = ""; });
    const media = leaf.querySelector(".page-media");
    if (media) media.style.transform = "";
  }
  flipShadowEl.style.opacity = "0";
  _fxBend = 0; _fxLastAng = null;
}

/* ==========================================================================
   PAGE-PEEL ENGINE  —  a real "corner peel" page turn (turn.js style).
   The sheet lifts from its bottom-right corner and peels across the page with
   a travelling fold:
     • the leaf's FRONT is clipped to the un-peeled region,
     • the folded-over part shows the sheet's blank tan BACK — the peeled
       region REFLECTED across the fold line — with a bright crease rolling
       into curved paper shading,
     • a shadow hugs the fold on the flat part and the lifted sheet casts a
       soft drop shadow past it.
   All geometry is exact 2D reflection math, computed per frame from P = where
   the page's bottom-right corner currently is (book coords). P rests at
   (PW,PH) and ends at (-PW,PH), fully folded over the left spine — which
   matches the .flipped pose (parked off-book left), so class semantics keep
   working. GSAP drives P; without GSAP the old CSS hinge flip runs instead.
   ========================================================================== */
const PW = 1280, PH = 720;                    // book-space page size
const PEEL_EMPTY = "inset(0 0 0 100%)";       // hide-the-whole-page clip (fully peeled)
let _peelTween = null;                        // the active corner tween (one at a time)
let peelFoldWrap = null, peelFold = null;     // shared folded-over sheet layers

function ensurePeelEls(leaf) {
  if (!peelFoldWrap) {
    peelFoldWrap = document.createElement("div");
    peelFoldWrap.className = "peel-foldwrap";
    peelFold = document.createElement("div");
    peelFold.className = "peel-fold";
    peelFoldWrap.appendChild(peelFold);
    flipbookEl.appendChild(peelFoldWrap);
  }
  if (!leaf._crease) {                        // fold-hugging shadow on the page front
    const c = document.createElement("div");
    c.className = "peel-crease";
    leaf.appendChild(c);
    leaf._crease = c;
  }
}

// Cut a convex polygon by the half-plane sideFn(p) >= 0 (Sutherland–Hodgman).
function clipHalf(poly, sideFn) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = sideFn(a), sb = sideFn(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const u = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    }
  }
  return out;
}
function polyCss(poly) {
  return "polygon(" + poly.map(function (p) {
    return p.x.toFixed(1) + "px " + p.y.toFixed(1) + "px";
  }).join(",") + ")";
}
function mixRGB(a, b, f) {                     // blend two [r,g,b] colours by f (0..1)
  return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," +
                  Math.round(a[1] + (b[1] - a[1]) * f) + "," +
                  Math.round(a[2] + (b[2] - a[2]) * f) + ")";
}

/* Render ONE frame of the peel for the given corner position P. */
function renderPeel(leaf, P) {
  ensurePeelEls(leaf);
  const crease = leaf._crease;
  const dx = PW - P.x, dy = PH - P.y;          // corner displacement (rest − current)
  const dl = Math.hypot(dx, dy);
  if (dl < 1.5) {                              // corner at rest → flat, unclipped page
    leaf.style.clipPath = "";
    crease.style.display = "none";
    peelFoldWrap.style.display = "none";
    return;
  }
  const nx = dx / dl, ny = dy / dl;            // fold normal (points to the peeled side)
  const mx = (PW + P.x) / 2, my = (PH + P.y) / 2;  // the fold passes through this midpoint
  function side(p) { return (p.x - mx) * nx + (p.y - my) * ny; }
  const rect = [{ x: 0, y: 0 }, { x: PW, y: 0 }, { x: PW, y: PH }, { x: 0, y: PH }];
  const front  = clipHalf(rect, function (p) { return -side(p); });   // still lying flat
  const peeled = clipHalf(rect, side);                                // lifted + folded over
  if (peeled.length < 3) {
    // Nothing (or a degenerate sliver) is lifted. A <3-point polygon() is
    // INVALID CSS — the fold layer would paint UNCLIPPED as a full-box tan
    // flash — so treat this as a flat page instead.
    leaf.style.clipPath = "";
    crease.style.display = "none";
    peelFoldWrap.style.display = "none";
    return;
  }
  leaf.style.clipPath = front.length > 2 ? polyCss(front) : PEEL_EMPTY;
  // Folded-over part = the peeled region reflected across the fold line.
  const back = peeled.map(function (p) {
    const s = side(p);
    return { x: p.x - 2 * s * nx, y: p.y - 2 * s * ny };
  });
  // SHADING STRENGTH: ramps in the moment the corner lifts, and MELTS AWAY over
  // the last stretch of the turn — so the landed sheet blends seamlessly into
  // the parked page on the left with no crease/shadow pop at the end.
  const p01 = Math.min(1, dl / (2 * PW));      // 0 = corner at rest … 1 = fully turned
  const kOut = p01 < 0.8 ? 1 : Math.max(0, (1 - p01) / 0.2);
  const k = Math.min(1, p01 * 10) * kOut;
  // The fold layer's box spans -PW..PW in book space (so the sheet stays
  // visible while it lands LEFT of the book): element x = book x + PW.
  peelFold.style.clipPath = "polygon(" + back.map(function (p) {
    return (p.x + PW).toFixed(1) + "px " + p.y.toFixed(1) + "px";
  }).join(",") + ")";
  // Both gradients run along -n (from the fold INTO the page). CSS measures
  // gradient stops from the gradient line's start (center − dir·L/2), so find
  // where the fold sits along that line (per element box) and hang stops off it.
  const gx = -nx, gy = -ny;
  const theta = Math.atan2(gx, -gy) * 180 / Math.PI;
  // shadow hugging the fold on the flat part (leaf box: PW × PH)
  const L1 = Math.abs(PW * gx) + Math.abs(PH * gy);
  const s1 = (mx - (PW / 2 - gx * L1 / 2)) * gx + (my - (PH / 2 - gy * L1 / 2)) * gy;
  crease.style.display = "block";
  crease.style.background = "linear-gradient(" + theta.toFixed(2) + "deg, rgba(15,10,34," +
    (0.34 * k).toFixed(3) + ") " + s1.toFixed(1) + "px, rgba(15,10,34," +
    (0.13 * k).toFixed(3) + ") " + (s1 + 46).toFixed(1) + "px, rgba(15,10,34,0) " +
    (s1 + 130).toFixed(1) + "px)";
  // the folded-over back (fold box: 2PW × PH): a bright crease rolling into warm
  // tan — every stop eased back to the resting paper tones as the sheet lands
  const FW = 2 * PW;
  const L2 = Math.abs(FW * gx) + Math.abs(PH * gy);
  const s2 = ((mx + PW) - (PW - gx * L2 / 2)) * gx + (my - (PH / 2 - gy * L2 / 2)) * gy;
  const BASE = [203, 157, 131], DEEP = [179, 128, 95];   // --page-back / --page-back-2
  peelFold.style.background = "linear-gradient(" + theta.toFixed(2) + "deg, " +
    mixRGB(BASE, [246, 227, 201], k) + " " + s2.toFixed(1) + "px, " +
    mixRGB(BASE, [220, 177, 144], k) + " " + (s2 + 26).toFixed(1) + "px, " +
    "rgb(203,157,131) " + (s2 + 70).toFixed(1) + "px, " +
    mixRGB(DEEP, [156, 108, 80], k) + " " + (s2 + 260).toFixed(1) + "px)";
  // soft shadow the lifted sheet casts past the fold — fades out as it lands
  peelFoldWrap.style.display = "block";
  peelFoldWrap.style.filter = "drop-shadow(" + (gx * 14).toFixed(1) + "px " +
    (gy * 14 + 5).toFixed(1) + "px 16px rgba(8,6,22," +
    (0.42 * (0.15 + 0.85 * kOut)).toFixed(3) + "))";
}

/* Canonical corner path for arrow/keyboard turns + the idle peek: a quadratic
   Bezier from the resting corner, LIFTING through mid-page, down to the
   fully-turned mirror corner past the spine. */
function peelPath(t) {
  const u = 1 - t;
  return {
    x: u * u * PW + 2 * u * t * (PW * 0.10) + t * t * (-PW),
    y: u * u * PH + 2 * u * t * (PH - 620) + t * t * PH
  };
}
/* Keep a dragged corner physical: paper can't stretch, so P stays within reach
   of the spine's two anchor points (bottom-left and top-left of the page). */
function clampPeelP(p) {
  let x = p.x, y = Math.min(p.y, PH);
  let vx = x, vy = y - PH, d = Math.hypot(vx, vy);       // anchor (0, PH), radius PW
  if (d > PW) { x = vx / d * PW; y = PH + vy / d * PW; }
  const R = Math.hypot(PW, PH);
  vx = x; vy = y; d = Math.hypot(vx, vy);                // anchor (0, 0), radius diagonal
  if (d > R) { x = vx / d * R; y = vy / d * R; }
  return { x: x, y: y };
}
/* Pointer event → book-space coordinates (the 1280×720 the geometry lives in). */
function bookPt(e) {
  const r = flipbookEl.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * PW, y: (e.clientY - r.top) / r.height * PH };
}

/* Finish a peel: clear the per-frame layers and hand the pose back to the
   .flipped class (transition suppressed so nothing re-animates). */
function peelEnd(leaf) {
  renderLeaves();                              // resting classes for the final state
  leaf.style.clipPath = "";
  if (leaf._crease) leaf._crease.style.display = "none";
  if (peelFoldWrap) peelFoldWrap.style.display = "none";
  leaf.style.transition = "none";
  leaf.style.transform = "";
  void leaf.offsetWidth;                       // commit with no transition
  leaf.style.transition = "";
  updateZ();
}

/* ---- CLOSE CASCADE — the "real book close" for Home / Replay ---------------
   Riffle every turned page back to the right, one after another: the top of
   the left pile (the most recently turned page) falls first, and each later
   sheet lands ON TOP of the one before, so the book visibly returns to page 1
   — then the caller swings the cover shut. Each fall gets a flip sound (a
   quick riffle). Without GSAP (or with no pages turned) it calls done()
   immediately and the old instant close runs. */
function cascadeClose(done) {
  const n = flipped;
  if (!G || n <= 0) { done(); return; }
  if (_peelTween) { _peelTween.kill(); _peelTween = null; }
  const falling = leaves.slice(0, n);
  falling.forEach(function (l) { l.style.transition = "none"; });   // GSAP owns the motion
  const tl = G.timeline({
    onComplete: function () {
      flipped = 0;
      renderLeaves();                        // every leaf officially unflipped again
      falling.forEach(function (l) {
        G.set(l, { clearProps: "transform,transformOrigin" });
        l.style.zIndex = "";
        void l.offsetWidth;                  // commit while transitions are off
        l.style.transition = "";
      });
      updateZ();
      done();
    }
  });
  for (let k = 0; k < n; k++) {
    const leaf = leaves[n - 1 - k];          // most recently turned page falls first
    const at = k * 0.085;                    // riffle stagger
    tl.set(leaf, { zIndex: 320 + k }, at);   // later sheets land ON TOP → page 1 ends up top
    tl.fromTo(leaf, { rotationY: -180, transformOrigin: "left center" },
                    { rotationY: 0, duration: 0.38, ease: "power2.in" }, at);
    tl.call(playFlip, null, at + 0.2);       // flip sound as each sheet falls
  }
}

/* Full peel turn for the arrows / keyboard: drive the corner along peelPath. */
function peelTurn(leaf, forward, opts) {
  if (_peelTween) { _peelTween.kill(); _peelTween = null; }
  ensurePeelEls(leaf);
  const proxy = { t: forward ? 0 : 1 };
  leaf.style.transition = "none";
  leaf.style.transform = "none";               // flat — the travelling fold does the turning
  renderPeel(leaf, peelPath(proxy.t));
  renderLeaves();                              // final classes now (the inline flat overrides)
  leaf.style.zIndex = 300;                     // keep the peeling sheet on top
  _peelTween = G.to(proxy, {
    t: forward ? 1 : 0,
    duration: FLIP_S,
    ease: "power2.inOut",
    onUpdate: function () { renderPeel(leaf, peelPath(proxy.t)); },
    onComplete: function () {
      _peelTween = null;
      peelEnd(leaf);
      if (opts && opts.done) opts.done();
    }
  });
}

/* ---- Responsive: scale the FIXED 1280x720 book to fit the viewport --------
   ORIGINAL fit — 96% of width / 84% of height — so the book size and the arrows
   (which stay at the viewport's bottom corners, via CSS) look exactly as before.
   The ONLY addition is a safeguard on SHORT screens: never let the book grow so
   tall that it covers the bottom controls. That safeguard changes nothing on
   normal/large screens (there the 0.84 factor is the smaller of the two); it only
   shrinks the book a little on small screens so the arrows + progress stay visible.
   Only this CSS transform scale changes, so the paper curl is never distorted. */
/* Safe-area insets (notch / home bar), cached. getComputedStyle forces a style
   recalc, and fitScale() now runs on visualViewport scroll too — so read these
   once and refresh only when the orientation actually changes. */
let _safeArea = null;
function safeArea() {
  if (_safeArea) return _safeArea;
  const cs = getComputedStyle(document.documentElement);
  const px = function (n) { const v = parseFloat(cs.getPropertyValue(n)); return isFinite(v) ? v : 0; };
  _safeArea = { l: px("--sa-left"), r: px("--sa-right"), b: px("--sa-bottom"), t: px("--sa-top") };
  return _safeArea;
}

function fitScale() {
  // visualViewport is the truthful size on mobile: window.innerHeight does not
  // shrink when the URL bar / keyboard is showing, which left the book overflowing
  // on phones. Falls back to innerWidth/Height everywhere it is unavailable.
  const vv = window.visualViewport;
  const iw = Math.round(vv ? vv.width  : window.innerWidth);
  const ih = Math.round(vv ? vv.height : window.innerHeight);

  // Notch / home-bar insets (viewport-fit=cover puts them inside iw/ih).
  const sa = safeArea();
  const saL = sa.l, saR = sa.r, saB = sa.b;

  /* SHORT viewports — a phone in landscape is ~300px tall. The original layout
     reserved a fixed 64px band above AND below for the controls, which on a 295px
     screen consumed 43% of the height and shrank the book to a third of the
     display. There, use nearly the whole viewport and OVERLAY the arrows inside
     the book's lower corners instead of parking them beneath it.
     Roomier screens keep the original geometry exactly (see the else branch). */
  const SHORT = ih < 500;
  // Control band: still 64px on normal screens, proportional when height is tight.
  const CTRL = Math.min(64, ih * 0.11);
  const availW = (iw - saL - saR) * (SHORT ? 0.98 : 0.88);
  const availH = SHORT ? (ih - saB) * 0.96
                       : Math.min(ih * 0.80, ih - CTRL * 2);
  const s = Math.min(availW / 1280, availH / 720);
  flipScaleEl.style.setProperty("--book-scale", s.toFixed(4));

  const bookW = 1280 * s, bookH = 720 * s, edge = 18 * s;
  const rs = document.documentElement.style;

  /* NOTE: activity pages need no special arrow placement. The overlay is back to
     page size by the time the arrows appear (they stay hidden while the game is
     full screen), so the normal book-corner geometry below is correct. */
  if (SHORT) {
    // No strip below the book — tuck the arrows just inside its bottom corners,
    // clear of any notch. They keep their drop-shadow so they read over the art.
    const btn = Math.max(44, Math.min(78, Math.round(bookH * 0.26)));
    const inset = Math.round(btn * 0.12);
    const left   = (iw - bookW) / 2, right = (iw + bookW) / 2;
    const bottom = (ih + bookH) / 2;
    rs.setProperty("--arrow-size", btn + "px");
    rs.setProperty("--arrow-y", Math.round(bottom - btn - inset) + "px");
    rs.setProperty("--back-x",  Math.round(Math.max(left + inset, saL + 2)) + "px");
    rs.setProperty("--fwd-x",   Math.round(Math.min(right - btn - inset, iw - saR - btn - 2)) + "px");
  } else {
    // The nav arrows sit UNDER the book's bottom corners: BACK below the
    // bottom-LEFT corner, NEXT below the bottom-RIGHT — horizontally centred
    // on each corner, with the arrow art fully BELOW the book edge (never
    // touching it). The gold glyph fills the middle ~58% of the button box,
    // so the box is placed with that inset in mind; the button shrinks when
    // the strip under the book is tight.
    const cornerL = (iw - bookW) / 2 - edge;
    const cornerR = (iw + bookW) / 2 + edge;
    const cornerY = (ih + bookH) / 2 + edge;         // book bottom edge
    const room = ih - saB - cornerY - 6;             // strip below the book
    const btn = Math.max(56, Math.min(124, Math.round(120 * s), Math.floor(room / 0.58)));
    rs.setProperty("--arrow-size", btn + "px");
    rs.setProperty("--arrow-y", Math.round(cornerY + 2 - 0.21 * btn) + "px");
    rs.setProperty("--back-x",  Math.round(Math.max(cornerL - btn / 2, saL + 2)) + "px");
    rs.setProperty("--fwd-x",   Math.round(Math.min(cornerR - btn / 2, iw - saR - btn - 2)) + "px");
  }
  // keep the page-turn hint glued to the forward arrow when the viewport changes
  if (flipHint && flipHint.classList.contains("show")) positionFlipHint();
}

/* ---- Render / stacking for the CSS leaf flip ---------------------------- */
// A TURNED leaf sits to the left (rotateY -180deg, showing its blank back over
// the cover); an UN-turned leaf lies flat on top of the cover. z-index keeps the
// current (top un-turned) page in front, and stacks more-recently turned leaves
// above earlier ones on the left pile.
function updateZ() {
  leaves.forEach(function (leaf, i) {
    leaf.style.zIndex = (i < flipped) ? (200 + i) : (100 - i);
  });
}
function renderLeaves() {
  leaves.forEach(function (leaf, i) {
    if (i < flipped) leaf.classList.add("flipped");
    else             leaf.classList.remove("flipped");
  });
  updateZ();
}

/* ---- Per-page media -----------------------------------------------------
   Play the CURRENT page's video (pause every other), and pop the current page's
   speech bubble in ONCE, only after the page has fully settled. Called after
   each flip completes and once the cover has finished opening. */
let mediaDelayTimer = null;   // pending "start this video after N ms" timer
let mediaDelayIdx = -1;       // which page that pending timer belongs to
let lastMediaIdx = -1;        // last page refreshMedia handled (to arm the blink once)
let maxReached = 0;           // deepest page reached this read-through (pages before
                              // it are already watched → NEXT stays available there)

/* Last-resort sound recovery: if a page ever had to fall back to MUTED playback,
   unmute it on the reader's next tap / key press (a real user gesture, which every
   autoplay policy accepts). Without this a silenced page stayed silent for the whole
   read unless the reader happened to tap the video itself. */
let _unmuteArmed = false;
function armUnmuteOnGesture() {
  if (_unmuteArmed) return;
  _unmuteArmed = true;
  function recover() {
    _unmuteArmed = false;
    document.removeEventListener("pointerdown", recover, true);
    document.removeEventListener("keydown", recover, true);
    const v = currentVideo();
    if (!v) return;
    v.muted = false; v.volume = 1;
    const p = v.play(); if (p && p.catch) p.catch(function () {});
  }
  document.addEventListener("pointerdown", recover, true);
  document.addEventListener("keydown", recover, true);
}

function playVideoNow(v) {
  try {
    v.preload = "auto";                       // make sure it's buffering before we play
    if (v.ended) v.currentTime = 0;
    v.volume = 1;                             // a stale volume:0 also reads as "no sound"
    v.muted = false;                          // try WITH sound (primed in the Play gesture)
    const p = v.play();
    if (p && p.catch) p.catch(function (err) {
      // WHY the error name matters: a rejected play() does NOT mean autoplay was
      // blocked. The common case is AbortError — "interrupted by a call to pause()
      // / load()" — which the engine itself triggers (refreshMedia pauses every
      // non-current video; a tab blur pauses the current one; warmVideo calls
      // load()). Muting on THAT is what left pages playing silently: one
      // interrupted play() muted the element for good, and only tapping the video
      // (whose own handler unmutes) brought the voice-over back.
      if (err && err.name === "AbortError") return;      // our own interruption → leave sound ON
      v.muted = true;                                    // genuinely blocked → at least show it
      v.play().catch(function () {});
      armUnmuteOnGesture();                              // …and get the sound back on next tap
    });
  } catch (_) {}
}

/* Buffer ONE page's video on demand (only the current + next page are ever
   warmed, so we never spin up all 25 decoders at once). */
function warmVideo(i) {
  const leaf = leaves[i];
  if (!leaf) return;
  const v = leaf.querySelector("video.page-media");
  if (v && v.preload !== "auto") { v.preload = "auto"; try { v.load(); } catch (_) {} }
}

/* Unlock ONE page's video for instant, sound-enabled playback: a muted
   play()→pause() done INSIDE a user gesture. We prime only the page being shown
   and the next one — priming all 25 at once was the opening lag. */
function primeVideo(i) {
  const leaf = leaves[i];
  if (!leaf) return;
  const v = leaf.querySelector("video.page-media");
  if (!v || v.dataset.primed) return;
  v.dataset.primed = "1";
  try {
    v.muted = true; v.preload = "auto";
    const p = v.play();                       // start within the gesture → element is "activated"
    if (p && p.catch) p.catch(function () {});
    v.pause();                                // pause synchronously
    v.currentTime = 0;
  } catch (_) {}
}

/* ==========================================================================
   DIALOGUE + SCENE PLAYER  —  the LXD presentation rules, in code:
     • bubble reveal  = Pop (On Enter)  → the existing bubblePop CSS animation
     • text reveal    = Typewriter (On Enter), speed adjustable per bubble
     • scenes on a page cross-DISSOLVE (1.1s), each popping its own bubble
   Bubbles replay every time the reader lands on the page ("On Enter"): when a
   page is LEFT, its dialogue resets (delayed until the turn finishes so
   nothing blanks mid-flip).
   ========================================================================== */
const TYPE_MS       = 45;     // default typewriter speed (ms per character)
const TYPE_LAG_MS   = 260;    // typing starts as the pop settles
const DISSOLVE_MS   = 1100;   // scene cross-dissolve (sync with .page-scene CSS)
const SCENE_HOLD_MS = 1600;   // default linger after typing ends, before dissolving

/* ---- Pausable dialogue timers -------------------------------------------
   Every dialogue timer (scene holds, typewriter ticks, bubble reveals) runs
   through dlgWait so the whole playback can FREEZE and RESUME in place —
   each record knows its deadline, so pause stores the remaining time and
   resume re-arms it. (Used by the TEMP test button; also useful later for
   audio sync.) A timer created WHILE paused stays parked until resume. */
let dlgPaused = false;
let dlgTimers = [];                          // live records: {fn, remaining, deadline, id}
function dlgDrop(rec) {
  const i = dlgTimers.indexOf(rec);
  if (i >= 0) dlgTimers.splice(i, 1);
}
function dlgWait(fn, ms) {
  const rec = { fn: fn, remaining: ms, deadline: 0, id: 0 };
  if (!dlgPaused) {
    rec.deadline = performance.now() + ms;
    rec.id = setTimeout(function () { dlgDrop(rec); fn(); }, ms);
  }
  dlgTimers.push(rec);
  return rec;
}
function dlgKill(rec) {                      // cancel one record (returns null)
  if (rec) { clearTimeout(rec.id); dlgDrop(rec); }
  return null;
}
function dlgPause() {
  if (dlgPaused) return;
  dlgPaused = true;
  const now = performance.now();
  dlgTimers.forEach(function (r) {
    clearTimeout(r.id); r.id = 0;
    r.remaining = Math.max(0, r.deadline - now);
  });
  // freeze any scene video mid-play (its 'ended' advance freezes with it)
  document.querySelectorAll(".page-scene video.page-media").forEach(function (v) {
    if (!v.paused && !v.ended) { v._dlgWasPlaying = true; try { v.pause(); } catch (_) {} }
  });
}
function dlgResume() {
  if (!dlgPaused) return;
  dlgPaused = false;
  dlgTimers.forEach(function (r) {
    r.deadline = performance.now() + r.remaining;
    r.id = setTimeout(function () { dlgDrop(r); r.fn(); }, r.remaining);
  });
  document.querySelectorAll(".page-scene video.page-media").forEach(function (v) {
    if (v._dlgWasPlaying) {
      v._dlgWasPlaying = false;
      const p = v.play(); if (p && p.catch) p.catch(function () {});
    }
  });
}

/* Lay the bubble's text out as INVISIBLE per-char spans: the final layout is
   built up-front (so the text never re-wraps mid-type) but no character shows
   until the typewriter reveals it. MUST run before the bubble pops in —
   otherwise the plain text flashes visible during the pop. */
function prepBubbleText(bub) {
  const t = bub.querySelector(".bubble-text");
  if (!t) return;
  const full = t.dataset.full != null ? t.dataset.full : t.textContent;
  t.dataset.full = full;
  t.textContent = "";
  Array.prototype.forEach.call(full, function (ch) {
    const s = document.createElement("span");
    s.textContent = ch;
    s.style.visibility = "hidden";
    t.appendChild(s);
  });
}

/* Typewriter: reveal the prepared invisible spans one by one. */
function typeBubbleText(bub) {
  const t = bub.querySelector(".bubble-text");
  if (!t) return;
  if (!t.querySelector("span")) prepBubbleText(bub);   // safety: not prepped yet
  const spans = t.querySelectorAll("span");
  const ms = +bub.dataset.typeSpeed || TYPE_MS;
  let i = 0;
  (function tick() {
    if (i >= spans.length) { bub._typeTimer = null; return; }
    spans[i++].style.visibility = "visible";
    bub._typeTimer = dlgWait(tick, ms);
  })();
}

/* Pop the bubble in NOW (empty — its text is hidden spans), then start
   typing as the pop settles. Runs once per page visit. */
function revealBubbleNow(bub) {
  if (!bub || bub.dataset.revealed) return;
  bub.dataset.revealed = "1";
  prepBubbleText(bub);                                         // hide text FIRST
  bub.classList.add("revealed");                               // Pop (On Enter)
  bub._typeStartTimer = dlgWait(function () {
    bub._typeStartTimer = null;                // cleared → "typing has begun"
    typeBubbleText(bub);
  }, TYPE_LAG_MS);
}

/* Put a bubble back to its hidden, un-typed state (for the next visit). */
function resetBubble(bub) {
  dlgKill(bub._revealTimer); dlgKill(bub._typeStartTimer); dlgKill(bub._typeTimer);
  bub._revealTimer = bub._typeStartTimer = bub._typeTimer = null;
  delete bub.dataset.revealed;
  delete bub.dataset.sched;
  bub.classList.remove("revealed");
  const t = bub.querySelector(".bubble-text");
  if (t && t.dataset.full != null) t.textContent = t.dataset.full;
}

/* ---- Scene player ---------------------------------------------------------
   Walks a page's `scenes`: reveal bubble → type → hold → 1.1s cross-dissolve
   to the next scene → its bubble pops as the dissolve lands → … The last
   scene simply stays. All timers are tracked so leaving the page stops them. */
let scenePlayPage = -1, sceneTimers = [], scenePlayRun = 0;
let sceneSeqDone = -1;                         // page whose scene sequence has PLAYED OUT
function sceneWait(fn, ms) { sceneTimers.push(dlgWait(fn, ms)); }
function stopScenes() {
  sceneTimers.forEach(dlgKill);
  sceneTimers = [];
  scenePlayPage = -1;
  sceneSeqDone = -1;
  scenePlayRun++;                              // invalidates pending video-ended advances
}
function resetScenes(leaf) {                   // back to scene 0, bubbles + videos fresh
  leaf.querySelectorAll(".page-scene").forEach(function (l, i) {
    l.classList.toggle("on", i === 0);
    const b = l.querySelector(".bubble");
    if (b) resetBubble(b);
    const v = l.querySelector("video.page-media");
    if (v) {
      if (v._sceneAdv) { v.removeEventListener("ended", v._sceneAdv); v._sceneAdv = null; }
      try { v.pause(); v.currentTime = 0; } catch (_) {}
    }
  });
}
function playScenes(idx, startDelay) {
  if (scenePlayPage === idx) return;           // already running on this page
  stopScenes();
  scenePlayPage = idx;
  const run = scenePlayRun;                    // this playback session's token
  const leaf = leaves[idx], scs = pages[idx].scenes;
  const layers = leaf.querySelectorAll(".page-scene");
  resetScenes(leaf);
  (function showScene(si, revealDelay) {
    const layer = layers[si];
    if (!layer) return;
    const sc  = scs[si];
    const bub = layer.querySelector(".bubble");
    const vid = layer.querySelector("video.page-media");
    let typedMs = 0;
    if (vid) sceneWait(function () { playVideoNow(vid); }, revealDelay);
    if (bub) {
      const t = bub.querySelector(".bubble-text");
      const full = (t && t.dataset.full) || "";
      typedMs = TYPE_LAG_MS + full.length * (+bub.dataset.typeSpeed || TYPE_MS);
      sceneWait(function () { revealBubbleNow(bub); }, revealDelay);
    }
    if (si + 1 < layers.length) {
      const goNextScene = function () {
        if (run !== scenePlayRun || scenePlayPage !== idx) return;   // stale
        layer.classList.remove("on");          // cross-dissolve: old fades out…
        layers[si + 1].classList.add("on");    // …new fades in (1.1s, CSS)
        showScene(si + 1, DISSOLVE_MS);        // next bubble pops as it lands
      };
      if (vid && (!sc || sc.hold == null)) {
        // video scene with no explicit hold → move on when the clip ends
        vid._sceneAdv = goNextScene;
        vid.addEventListener("ended", goNextScene, { once: true });
      } else {
        const hold = (sc && sc.hold != null) ? sc.hold : SCENE_HOLD_MS;
        sceneWait(goNextScene, revealDelay + typedMs + hold);
      }
    } else {
      // LAST scene of the page: signal once its dialogue has fully played out
      // (typing done / video ended / narrator hold over) → the page-turn nudge
      // may arm (it waits HINT_AFTER_DONE_MS more, see dialogueDone).
      const seqDone = function () {
        if (run !== scenePlayRun || scenePlayPage !== idx) return;   // stale
        sceneSeqDone = idx;                    // remember: this page has played out
        dialogueDone(idx);
      };
      if (vid && (!sc || sc.hold == null)) {
        vid._sceneAdv = seqDone;               // resetScenes cleans this up too
        vid.addEventListener("ended", seqDone, { once: true });
      } else if (bub) {
        sceneWait(seqDone, revealDelay + typedMs + 600);   // pop + typing settled
      } else {
        const hold = (sc && sc.hold != null) ? sc.hold : SCENE_HOLD_MS;
        sceneWait(seqDone, revealDelay + hold);
      }
    }
  })(0, startDelay || 0);
}

function refreshMedia() {
  const idx = flipped;                         // the front-most page right now
  // Deepest page reached this read-through. Anything BEFORE it has already been
  // watched, so revisiting it must not re-gate the NEXT arrow (see the dialogue
  // section below). Set before that check runs.
  if (idx > maxReached) maxReached = idx;
  if (idx !== lastMediaIdx) {
    lastMediaIdx = idx;
    hintDoneFor = -1;                          // fresh page → nudge waits for its scenes again
    // EVERY arrival replays the page from the top. Without this the clip only
    // rewound when it had ENDED (see playVideoNow), so leaving a page part-way
    // and coming back resumed mid-sentence. Rewinding here — and NOT in
    // playVideoNow — matters: refreshMedia runs again when the flip finishes, and
    // rewinding there too would restart the clip a second later.
    const arrivingVid = leaves[idx] && leaves[idx].querySelector("video.page-media");
    if (arrivingVid) {
      try { arrivingVid.pause(); arrivingVid.currentTime = 0; } catch (_) {}
    }
    // A multi-scene page goes back to scene 0 with its bubbles un-typed, so the
    // sequence plays out from the beginning rather than resuming mid-scene.
    if (leaves[idx]) {
      if (pages[idx] && pages[idx].scenes) resetScenes(leaves[idx]);
      // Un-pop the dialogue too: on a quick back-and-forth the delayed leave-reset
      // bails out (it sees the reader already returned), which used to leave the
      // bubble sitting there fully typed instead of replaying.
      leaves[idx].querySelectorAll(".bubble").forEach(resetBubble);
    }
  }
  // Left the page a delayed video was counting down on? Cancel that countdown.
  if (mediaDelayTimer && mediaDelayIdx !== idx) {
    clearTimeout(mediaDelayTimer); mediaDelayTimer = null; mediaDelayIdx = -1;
  }
  // Buffer + gesture-unlock ONLY this page and the next (so the upcoming flip is
  // instant and keeps sound) — never all 25 videos at once.
  warmVideo(idx); warmVideo(idx + 1); primeVideo(idx + 1);
  // Pause every video that is NOT the current page.
  leaves.forEach(function (leaf, i) {
    if (i === idx) return;
    const v = leaf.querySelector("video.page-media");
    if (v) { try { v.pause(); } catch (_) {} }
  });
  // Start (or schedule) the current page's video. (A video INSIDE a .page-scene
  // belongs to the scene player — playScenes starts it when its scene lands.)
  const cur = leaves[idx];
  const v = cur && !(pages[idx] && pages[idx].scenes) && cur.querySelector("video.page-media");
  if (v) {
    const delayMs = (pages[idx] && pages[idx].delay) ? pages[idx].delay : 0;
    if (delayMs > 0) {
      // Already playing this page, or already counting down for it → leave it alone
      // (so the flip-start + flip-end calls don't restart the 3s countdown).
      if (mediaDelayIdx === idx && (mediaDelayTimer || !v.paused)) { /* keep going */ }
      else {
        try { v.pause(); v.currentTime = 0; } catch (_) {}   // hold on the first frame
        mediaDelayIdx = idx;
        mediaDelayTimer = setTimeout(function () {
          mediaDelayTimer = null;
          if (flipped === idx) playVideoNow(v);               // only if still on this page
        }, delayMs);
      }
    } else {
      playVideoNow(v);                          // no delay → instant
    }
  }
  // Reset dialogue on every page we've LEFT — delayed until the turn finishes
  // so nothing blanks mid-flip. Bubbles then replay on the next visit.
  leaves.forEach(function (leaf, i) {
    if (i === idx || leaf.dataset.resetPend) return;
    const touched = leaf.querySelector(".bubble[data-revealed], .bubble[data-sched]");
    if (!touched && scenePlayPage !== i) return;              // nothing to reset
    leaf.dataset.resetPend = "1";
    setTimeout(function () {
      delete leaf.dataset.resetPend;
      if (flipped === i) return;               // reader came straight back — keep it
      if (scenePlayPage === i) stopScenes();
      leaf.querySelectorAll(".bubble").forEach(resetBubble);
      if (pages[i] && pages[i].scenes) resetScenes(leaf);
    }, FLIP_MS + 80);
  });
  // Start this page's dialogue: the scene sequence, or the single bubble —
  // Pop + Typewriter, timed so it lands as the page finishes turning.
  // (Scenes only run while the book is OPEN — never behind a closing cover.)
  if (cur && pages[idx] && pages[idx].scenes) {
    if (opened) {
      playScenes(idx, animating ? 700 : 150);
      // Returned to a page whose sequence already played out before its
      // reset kicked in (quick back-and-forth): it's still "done".
      if (scenePlayPage === idx && sceneSeqDone === idx) dialogueDone(idx);
    }
  } else {
    const bub = cur && cur.querySelector(".bubble");
    if (bub && !bub.dataset.revealed && !bub.dataset.sched) {
      bub.dataset.sched = "1";
      bub._revealTimer = dlgWait(function () {
        delete bub.dataset.sched;
        if (flipped === idx) revealBubbleNow(bub);
      }, animating ? 700 : 150);
      // …and once the bubble has popped + typed out, the nudge may arm.
      const bt = bub.querySelector(".bubble-text");
      const btFull = (bt && (bt.dataset.full || bt.textContent)) || "";
      dlgWait(function () { dialogueDone(idx); },
              (animating ? 700 : 150) + TYPE_LAG_MS +
              btFull.length * (+bub.dataset.typeSpeed || TYPE_MS) + 600);
    } else if (bub && bub.dataset.revealed && !bub._typeTimer && !bub._typeStartTimer) {
      dialogueDone(idx);                       // already popped + typed (quick return)
    } else if (!bub && cur) {
      // No speech bubble on this page. A VIDEO page counts as "read" only once its
      // clip has FINISHED — that is what keeps the NEXT arrow hidden while the
      // voice-over plays (the video's own "ended" handler calls dialogueDone).
      // Two exceptions are marked read immediately:
      //   • a page the reader has already been past (idx < maxReached) — going BACK
      //     must show both arrows, not force a re-watch;
      //   • a page with no video at all (THE END).
      const vv = cur.querySelector("video.page-media");
      if (!vv || idx < maxReached) dialogueDone(idx);
    }
  }
  updateLbdOverlay();                           // show/hide the embedded game
  // Right-side page stack shrinks toward the end: 3 sheets → … → 0 on the last page.
  if (pageStackEl) pageStackEl.dataset.count = String(Math.max(0, Math.min(3, totalPages - 1 - flipped)));
  // Restart the idle → page-turn-hint countdown for the page we've just landed on
  // (uses the NEW `flipped`, so the delay is right: 5s on page 1, 10s afterwards).
  if (typeof resetIdleHint === "function") resetIdleHint();
}

/* ---- Navigation (drives the CSS leaf flip) ------------------------------ */
function turnLeaf(leaf) {                 // shared flip visuals + timing
  if (G) {
    // PEEL path — a real corner-peel turn (see the PAGE-PEEL ENGINE above):
    // the corner travels its canonical arc while the fold sweeps the page.
    const toFlipped = leaves.indexOf(leaf) < flipped;   // turning left, or back right?
    peelTurn(leaf, toFlipped, {
      done: function () {
        animating = false; updateProgress();
        refreshMedia();                  // re-assert once settled (idempotent safety net)
      }
    });
  } else {
    // Fallback — the original CSS-transition flip.
    leaf.style.zIndex = 300;             // lift the turning sheet above everything
    leaf.classList.add("flipping");      // enables the moving curl shading
    renderLeaves();
    setTimeout(function () {
      leaf.classList.remove("flipping");
      animating = false; updateZ(); updateProgress();
      refreshMedia();                    // re-assert once settled (idempotent safety net)
    }, FLIP_MS + 40);
  }
  refreshMedia();                        // START now → the target video plays INSTANTLY
                                          // (as the page is revealed, not after the flip)
  playFlip();
  updateProgress();
}
function goNext() {
  if (!opened || !ready || animating) return;   // wait until the cover has fully opened
  if (hintDoneFor !== flipped) return;           // scenes/dialogue still playing → no turning
  if (flipped >= totalPages - 1) return;         // already on the LAST page (THE END)
  animating = true;
  const leaf = leaves[flipped];                  // the page to turn
  flipped++;
  turnLeaf(leaf);
}
function goPrev() {
  if (!opened || !ready || animating) return;   // wait until the cover has fully opened
  if (flipped <= 0) return;               // already on the first page
  // (going BACK is allowed even while a scene is playing — only forward waits)
  animating = true;
  flipped--;
  turnLeaf(leaves[flipped]);
}

/* ---- Nav state (the "Page X / N" counter has been removed) --------------- */
function updateProgress() {
  prevBtn.disabled = flipped <= 0;
  nextBtn.disabled = flipped >= totalPages - 1;
  // Corner arrows:
  //   BACK  — from page 2 onward. Hidden on page 1: there is nothing behind it.
  //   NEXT  — hidden until the page has been READ: its video has played to the end,
  //           or its scenes/dialogue have finished, or the reader has been past this
  //           page before (dialogueDone() re-runs this, then it fades in).
  //   On an ACTIVITY page both arrows stay hidden while the game is being played,
  //   so the game owns the screen; they appear together once it reports finished
  //   (or immediately if the reader has already been past it).
  const dlgDone = hintDoneFor === flipped;
  const onLbdPage = pages[flipped] && pages[flipped].type === "lbd";
  const lbdFinished = !onLbdPage || lbdDone.has(flipped) || flipped < maxReached;
  const showPrev = opened && ready && flipped > 0 && lbdFinished;
  const showNext = opened && ready && dlgDone && lbdFinished && flipped < totalPages - 1;
  if (cornerPrev) {
    cornerPrev.classList.toggle("hide", !showPrev);
    cornerPrev.disabled = !showPrev;
  }
  if (cornerNext) {
    cornerNext.classList.toggle("hide", !showNext);
    cornerNext.disabled = !showNext;
  }
}

/* ---- Fullscreen: go FULLSCREEN when the book opens (the Play tap is the user
   gesture the Fullscreen API requires) and LEAVE fullscreen when back at the
   cover (Home / Replay). Applies on every screen; silently no-ops where the
   browser blocks it (e.g. iPhone Safari can't fullscreen arbitrary elements). */
function enterFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
    if (req) { var p = req.call(el); if (p && p.catch) p.catch(function () {}); }
  } catch (_) {}
}
function exitFullscreen() {
  try {
    if (!(document.fullscreenElement || document.webkitFullscreenElement)) return;
    var ex = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
    if (ex) { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); }
  } catch (_) {}
}

/* ---- Open the 3D cover, then hand off to the page-turning book ----------
   Shared by the first open (openBook) AND Replay (replayBook), so the dramatic
   hinge-open + post-open setup are identical both times. */
function runOpenSequence() {
  ready = false;
  document.body.classList.remove("is-closing");
  document.body.classList.add("is-open");
  // The whole open motion IS the cover's own hinge — NO zoom / camera move.
  book.classList.remove("closing");
  book.classList.add("open");          // cover hinges open on the LEFT spine
  bookFloat.classList.add("rest");     // stop the idle bob
  coverScene.classList.remove("parked");
  flipbookEl.style.zIndex = "";        // cover ABOVE the pages while it swings open
  // Reveal the REAL page right away (it sits beneath the cover, masked by it).
  flipbookEl.classList.add("show");
  // A user gesture drives every open, so start audio here.
  soundOn();
  resumeAudio();
  playCoverFlip();
  playBgMusic();                        // start the looping background music
  primeVideo(0); primeVideo(1);         // unlock page 1 + 2 inside the gesture
  refreshMedia();                       // start the page-1 video right away
  // Once the cover has FULLY opened, park it, lift the pages above it, hand over
  // pointer events, and mark the book READY.
  clearTimeout(_openTimer);
  _openTimer = setTimeout(function () {
    coverScene.classList.add("parked");
    flipbookEl.style.zIndex = "5";        // pages now sit ABOVE the parked cover (z3)
    tapCatcher.style.pointerEvents = "none";
    flipbookEl.style.pointerEvents = "auto";
    ready = true;
    updateProgress();
    refreshMedia();
    resetIdleHint();
  }, COVER_OPEN_MS + 50);
  updateProgress();
}
function openBook() {
  console.log("[The Story Night] openBook() called — opened was:", opened);
  if (opened) return;
  opened = true;
  playPlayClick();            // PLAY press blip — fires first so it leads the cover swing
  enterFullscreen();          // Play tap is a user gesture → allowed to go fullscreen
  runOpenSequence();
}

/* ---- Reset the whole book to the START SCREEN: the CLOSED FRONT COVER + Play
   button, exactly like a fresh load (so tapping Play reads from the top). Shared
   by Replay and Home (called once the closing swing has finished). --------- */
function resetToStart() {
  exitFullscreen();           // back at the cover → leave fullscreen
  ready = false; opened = false; flipped = 0;
  animating = false;          // never carry a stuck flip-lock into the next read
  maxReached = 0;             // a fresh read re-gates NEXT on every page's video
  lbdDone.clear();            // …and the activities must be played again
  restoreSpentLbdLeaves(-1);  // every activity leaf shows its title screen again
  updateLbdOverlay();         // back at the cover → hide + unload any running game
  renderLeaves();
  clearFlipFX(null);                           // kill any lingering cast shadow / flex
  if (peelFoldWrap) peelFoldWrap.style.display = "none";   // hide a lingering fold-back
  leaves.forEach(function (leaf) {
    var vv = leaf.querySelector("video.page-media");
    if (vv) { try { vv.pause(); vv.currentTime = 0; } catch (_) {} }
  });
  // Fresh dialogue for the next read-through: stop the scene player and put
  // every bubble / scene sequence back to its start.
  hintDoneFor = -1;                            // nudge re-gates on the next read
  stopScenes();
  leaves.forEach(function (leaf, i) {
    leaf.querySelectorAll(".bubble").forEach(resetBubble);
    if (pages[i] && pages[i].scenes) resetScenes(leaf);
  });
  lastMediaIdx = -1;
  document.body.classList.remove("is-open", "is-closing");
  book.classList.remove("open", "closing");
  coverScene.classList.remove("parked");
  cover.style.transform = "";                 // cover CLOSED → front cover + Play button showing
  flipbookEl.classList.remove("show");         // pages hidden behind the closed cover
  flipbookEl.style.zIndex = "";
  flipbookEl.style.pointerEvents = "none";
  bookFloat.classList.remove("rest");          // resume the idle bob
  tapCatcher.style.pointerEvents = "auto";     // Play is tappable again
  hideFlipHint(); clearTimeout(idleHintTimer); clearTimeout(nudgeHideTimer);
  try { bgMusic.pause(); bgMusic.currentTime = 0; } catch (_) {}   // stop music; restarts on Play
  updateProgress();                            // re-sync nav state (arrows greyed)
}

/* ---- CLOSE THE BOOK: the cover swings SHUT — the exact REVERSE of the opening
   hinge (cover −180 → 0) — and the book lands on the front cover. Used by
   REPLAY (from THE END page). `afterReset` runs once we're back on the cover. */
function closeBookToCover(afterReset) {
  ready = false;                               // block flips during the close
  clearTimeout(_openTimer);
  clearTimeout(_homeTimer);
  hideFlipHint(); cancelPeek(); clearTimeout(idleHintTimer); clearTimeout(nudgeHideTimer);
  if (cornerNext) cornerNext.classList.remove("blink");
  var v = currentVideo(); if (v) { try { v.pause(); } catch (_) {} }
  flipbookEl.style.pointerEvents = "none";
  tapCatcher.style.pointerEvents = "none";
  // REAL-BOOK CLOSE, in two beats:
  //   1) every turned page riffles back to the right (cascadeClose) — the pages
  //      stay ABOVE the parked cover for this, so the riffle is fully visible;
  //   2) then the cover swings shut over page 1 (the original closing hinge).
  cascadeClose(function () {
    // pages back UNDER the cover, so the closing cover sweeps over them
    flipbookEl.style.zIndex = "";
    coverScene.classList.remove("parked");
    // CLOSE — reverse of the opening hinge (cover swings from -180 back to 0).
    // is-closing keeps the current page bright (hides the dark thickness block) and
    // hides any stray turned page, so the cover folds cleanly.
    document.body.classList.add("is-closing");
    book.classList.remove("open");
    book.classList.add("closing");
    playCoverFlip();
    _homeTimer = setTimeout(function () {
      resetToStart();
      if (typeof afterReset === "function") afterReset();
    }, COVER_CLOSE_MS + 60);
  });
}

/* ---- REPLAY (button on THE END page): close the book with the reverse-of-open
   swing and land on the front cover, ready for another read. */
function replayBook() {
  if (!opened || animating) return;
  closeBookToCover();
}

/* ==========================================================================
   INPUT  —  tap PLAY to OPEN the cover; once open, drag + corner arrows +
   keyboard drive the page flip.
   ========================================================================== */
const tapCatcher = document.getElementById("tapCatcher");

// The book opens ONLY from the play button. The tap-catcher still sits on top to
// block page gestures before opening, but it opens the book only when the tap
// lands inside the play button's (breathing) hit-circle — taps elsewhere on the
// cover do nothing.
function tapHitsPlay(e) {
  const r = hint.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const rad = Math.max(r.width, r.height) / 2;
  return Math.hypot(e.clientX - cx, e.clientY - cy) <= rad;
}
if (tapCatcher) tapCatcher.addEventListener("click", function (e) { if (!opened && tapHitsPlay(e)) openBook(); });
// Show the hand (pointer) cursor ONLY when hovering the play button — the sole CTA
// on the cover. Everywhere else on the tap surface stays a normal cursor.
if (tapCatcher) tapCatcher.addEventListener("mousemove", function (e) {
  tapCatcher.style.cursor = (!opened && tapHitsPlay(e)) ? "pointer" : "default";
});

// The play button itself (also covers keyboard: Enter/Space on the focused button).
hint.addEventListener("click", function (e) { e.stopPropagation(); if (!opened) openBook(); });

prevBtn.addEventListener("click", function (e) { e.stopPropagation(); goPrev(); });
nextBtn.addEventListener("click", function (e) { e.stopPropagation(); goNext(); });

// Bottom-corner flip arrows (outside the book): back = left, forward = right.
cornerPrev.addEventListener("click", function (e) { e.stopPropagation(); goPrev(); this.blur(); });
cornerNext.addEventListener("click", function (e) { e.stopPropagation(); goNext(); this.blur(); });
if (replayBtn) replayBtn.addEventListener("click", function (e) { e.stopPropagation(); replayBook(); this.blur(); });

// Page interaction — DRAG TO TURN: grab the page and it follows your cursor,
// rotating about the spine, then SNAPS to the nearest state when you let go.
//   • drag LEFT  → turn the current page forward (it comes to rest on the cover)
//   • drag RIGHT → turn the previous page back
// A plain tap does nothing; the corner arrows + keyboard still work.
(function () {
  let startX = 0, startY = 0, pw = 1;
  let leaf = null, dir = 0, decided = false, dragging = false;
  let pC0 = null, pS = null, pP = null;               // peel drag: corner start, grab point, corner now
  let lastX = 0, lastT = 0, vx = 0;                   // for flick (velocity) detection
  const DECIDE = 6;                                   // px before we commit to a drag
  const FLICK = 0.45;                                 // px/ms — a quick flick completes the turn
  const FINISH_DEG = 45;                              // turned this far (deg) → completes on release

  // how many degrees the drag has turned the page (0..180)
  function degFromDx(dx) { return Math.max(0, Math.min(180, Math.abs(dx) / pw * 180)); }
  // the live angle for the active leaf, given the raw horizontal travel
  function liveAngle(dx) {
    return (dir === 1) ? degFromDx(Math.min(0, dx))          // forward: leftward turns 0→180
                       : 180 - degFromDx(Math.max(0, dx));   // back: starts at 180, rightward → 0
  }

  flipbookEl.addEventListener("pointerdown", function (e) {
    if (!opened || !ready || animating) return;
    startX = e.clientX; startY = e.clientY;
    lastX = e.clientX; lastT = e.timeStamp || performance.now(); vx = 0;
    decided = false; dragging = true; leaf = null; dir = 0;
    pC0 = pS = pP = null;
    pw = flipbookEl.getBoundingClientRect().width || 1;
  });

  flipbookEl.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    const now = e.timeStamp || performance.now();
    const dt = now - lastT;
    if (dt > 0) vx = (e.clientX - lastX) / dt;         // running horizontal velocity
    lastX = e.clientX; lastT = now;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) < DECIDE || Math.abs(dx) <= Math.abs(dy)) return;   // wait for a clear horizontal drag
      if (dx < 0 && flipped < totalPages - 1 &&
          hintDoneFor === flipped)            { dir = 1;  leaf = leaves[flipped]; }     // forward only AFTER the scenes finish
      else if (dx > 0 && flipped > 0)         { dir = -1; leaf = leaves[flipped - 1]; } // turn back (always allowed)
      else { dragging = false; return; }                  // nothing to turn that way
      decided = true;
      leaf.style.transition = "none";                     // follow the finger exactly
      leaf.style.zIndex = 300;
      if (G) {                                            // PEEL drag: the page corner follows
        pC0 = (dir === 1) ? { x: PW, y: PH } : { x: -PW, y: PH };   // where the corner rests now
        pS  = bookPt(e);                                  // grab point (keeps the grab offset)
        pP  = { x: pC0.x, y: pC0.y };
        leaf.style.transform = "none";                    // flat — the travelling fold turns it
        renderPeel(leaf, pP);
      }
      try { flipbookEl.setPointerCapture(e.pointerId); } catch (_) {}
    }
    if (G) {
      // Corner = its resting spot + how far the finger has travelled, kept
      // physical (paper can't stretch past the spine anchors).
      const bp = bookPt(e);
      pP = clampPeelP({ x: pC0.x + (bp.x - pS.x), y: pC0.y + (bp.y - pS.y) });
      renderPeel(leaf, pP);
      return;
    }
    const ang = Math.max(0, Math.min(180, liveAngle(dx)));
    // Fallback (no GSAP) rigid drag: curls, cast shadow, media flex — and the
    // sheet's sag + lift composed into the follow-the-finger transform.
    const fx = applyFlipFX(leaf, ang);
    leaf.style.transform = "rotateY(" + (-ang) + "deg) rotateX(" + fx.sag.toFixed(2) +
                           "deg) translateZ(" + fx.lift.toFixed(1) + "px)";
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    const L = leaf, D = dir;
    leaf = null;
    if (!decided || !L) return;                           // a plain tap → nothing

    const flick = (D === 1) ? (vx < -FLICK) : (vx > FLICK);

    if (G) {
      // PEEL release: the fold keeps going from wherever the finger let go —
      // completing over the spine or settling back down — with a duration
      // scaled to the remaining distance, like releasing a real page mid-peel.
      const P0 = pP || { x: (D === 1 ? PW : -PW), y: PH };
      const prog = (PW - P0.x) / (2 * PW);              // 0 = flat right … 1 = fully turned
      const complete = (D === 1) ? (prog > 0.15 || flick) : (prog < 0.85 || flick);
      const endFlipped = (D === 1) ? complete : !complete;
      animating = true;
      if (complete) { playFlip(); flipped += (D === 1) ? 1 : -1; }
      renderLeaves();                                   // final classes now (inline overrides)
      refreshMedia();                                   // START the target video INSTANTLY
      L.style.zIndex = 300;                             // keep the peeling sheet on top
      const target = endFlipped ? { x: -PW, y: PH } : { x: PW, y: PH };
      const proxy = { x: P0.x, y: P0.y };
      const dist = Math.min(1, Math.hypot(target.x - P0.x, target.y - P0.y) / (2 * PW));
      if (_peelTween) _peelTween.kill();
      _peelTween = G.to(proxy, {
        x: target.x, y: target.y,
        duration: Math.max(0.3, FLIP_S * dist),
        ease: flick ? "power2.out" : "power2.inOut",
        onUpdate: function () { renderPeel(L, proxy); },
        onComplete: function () {
          _peelTween = null;
          peelEnd(L);
          animating = false; updateProgress();
          refreshMedia();                               // re-assert once settled
        }
      });
      updateProgress();
      return;
    }

    const ang = Math.max(0, Math.min(180, liveAngle(e.clientX - startX)));
    // Complete the turn if it's been dragged far enough OR flicked quickly in
    // the turn's direction — no need to drag all the way past halfway.
    const complete   = (D === 1) ? (ang > FINISH_DEG || flick)
                                 : (ang < 180 - FINISH_DEG || flick);
    const endFlipped = (D === 1) ? complete   : !complete;    // does this leaf end up turned?

    animating = true;
    if (complete) { playFlip(); flipped += (D === 1) ? 1 : -1; }

    clearFlipFX(L);         // drop the inline FX; the .flipping keyframe takes over
    // Lock in the resting classes + z-index NOW (so nothing pops in later), then
    // animate the inline transform from the dragged angle to the target. The
    // .flipped class already holds the same final angle underneath.
    L.style.transition = "";                              // restore the CSS flip transition
    void L.offsetWidth;                                   // reflow so it animates FROM the dragged angle
    L.classList.add("flipping");                          // curl shading during the snap
    renderLeaves();                                       // apply .flipped + z-index immediately
    refreshMedia();                                       // START the target video INSTANTLY
    L.style.transform = endFlipped ? "rotateY(-180deg)" : "rotateY(0deg)";
    updateProgress();

    setTimeout(function () {
      L.classList.remove("flipping");
      // Drop the inline transform WITHOUT re-animating: the .flipped class already
      // holds the final angle, so disabling the transition for this swap prevents
      // the leaf from briefly swinging back (the "page reappears on the left" glitch).
      L.style.transition = "none";
      L.style.transform = "";
      void L.offsetWidth;                                 // commit with no transition
      L.style.transition = "";                            // restore for the next turn
      animating = false; updateProgress();
      refreshMedia();                                     // re-assert once settled (idempotent safety net)
    }, FLIP_MS + 40);
  }
  flipbookEl.addEventListener("pointerup", endDrag);
  flipbookEl.addEventListener("pointercancel", endDrag);
})();

window.addEventListener("keydown", function (e) {
  if (e.key === "ArrowRight") { e.preventDefault(); opened ? goNext() : openBook(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
  else if ((e.key === " " || e.key === "Enter") && !opened) { e.preventDefault(); openBook(); }
});

// Keep the canvas scaled to fit on resize / rotate.
let _resizeSettle = null;
function onViewportChange() {
  // Suppress the page-turn transitions while the viewport is actively changing, so
  // a rapid resize / resolution change can't make the book LOOK like it's auto-
  // flipping (the leaves re-render during the scale change). Restored once settled.
  document.body.classList.add("is-resizing");
  clearTimeout(_resizeSettle);
  _resizeSettle = setTimeout(function () { document.body.classList.remove("is-resizing"); }, 220);
  fitScale();
  // Re-park the game overlay over the freshly re-scaled page.
  if (lbdStage && lbdStage.classList.contains("visible")) positionLbdStage();
}
window.addEventListener("resize", onViewportChange);
// Rotating swaps which edges carry the notch, so drop the cached insets first.
window.addEventListener("orientationchange", function () { _safeArea = null; onViewportChange(); });
// Mobile browsers grow/shrink the visible area as the URL bar hides and returns,
// WITHOUT firing a window resize — so listen to the visual viewport too, or the
// book stays sized for the old height and overflows.
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewportChange);
  window.visualViewport.addEventListener("scroll", onViewportChange);
}

/* ---- Block ALL zoom (pinch, double-tap, ctrl+wheel, ctrl +/-) ------------
   The book is fixed-layout, so zoom would only break it. */
(function () {
  // Never let anything (esp. page images) start a native HTML5 drag — that was
  // showing a "ghost" of the image following the cursor during a page-flip drag.
  document.addEventListener("dragstart", function (e) { e.preventDefault(); });
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (t) {   // iOS pinch
    document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
  });
  window.addEventListener("wheel", function (e) {                          // desktop ctrl+wheel
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });
  window.addEventListener("keydown", function (e) {                        // ctrl/⌘ +/-/0
    if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].indexOf(e.key) !== -1) e.preventDefault();
    // Block "Save page" (Ctrl/⌘+S) — a casual way to grab the media.
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) e.preventDefault();
  });
  document.addEventListener("touchmove", function (e) {                    // 2-finger pinch
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // NOTE: the right-click / context menu is intentionally LEFT ENABLED (so "Inspect"
  // and dev tools work). Casual image protection still stands via CSS — no drag,
  // no text-selection, no iOS long-press "Save Image" callout — plus Ctrl+S is blocked.
})();

/* ==========================================================================
   SOUND  —  page-flip + cover-flip SFX live in sfx/ (engine). The looping
   BACKGROUND MUSIC is your story's — set its path as STORY.music in story.js
   (leave it out for a silent book). All muted until the book is opened (a
   user gesture the browser needs before it will play audio).
   ========================================================================== */
let muted = true;

// Looping BACKGROUND MUSIC (from story.js) at 20% volume. Started on open (a
// user gesture) so the browser allows it to play with sound.
// The src is attached ONLY if the story sets one: `new Audio("")` resolves the
// empty src against the document, so the browser would try to decode index.html
// as audio on every load — a wasted request plus a console media error.
const bgMusic = new Audio();
bgMusic.loop = true;
bgMusic.volume = 0.20;
if (STORY.music) {
  bgMusic.src = encodeURI(STORY.music);
  bgMusic.preload = "auto";
}
function playBgMusic() {
  if (!STORY.music) return;                   // no music set → silent book
  try {
    const p = bgMusic.play();
    if (p && p.catch) p.catch(function () {});   // ignore autoplay rejections
  } catch (_) {}
}

/* ---- Pause ALL audio when the tab / window goes to the background -----------
   Background music AND the current page's video (its voice-over) must stop the
   moment the reader switches tab or app, and resume when they come back — they
   were continuing to play in the background. Covers visibilitychange (tab switch),
   blur (other window), and pagehide (mobile app switch / bfcache). */
let _bgWasPlaying = false;
function currentVideo() {
  const leaf = leaves[flipped];
  return leaf ? leaf.querySelector("video.page-media") : null;
}
function pauseAllAudioFB() {
  if (!bgMusic.paused) { _bgWasPlaying = true; try { bgMusic.pause(); } catch (_) {} }
  const v = currentVideo();
  if (v && !v.paused) { v.dataset.wasPlaying = "1"; try { v.pause(); } catch (_) {} }
  if (audioCtx && audioCtx.state === "running") { try { audioCtx.suspend(); } catch (_) {} }
  // …and freeze the DIALOGUE too: the scene holds, typewriter ticks and scene
  // videos would otherwise keep running while the tab is hidden, so a page could
  // silently play itself out in the background. dlgWait() already honours the
  // paused flag — this is what finally sets it.
  dlgPause();
}
function resumeAllAudioFB() {
  if (document.hidden || !document.hasFocus()) return;   // only when truly back in front
  if (!opened) return;                                   // nothing plays before the book opens
  if (audioCtx && audioCtx.state === "suspended") { try { audioCtx.resume(); } catch (_) {} }
  if (_bgWasPlaying) { _bgWasPlaying = false; playBgMusic(); }
  const v = currentVideo();
  if (v && v.dataset.wasPlaying && !v.ended) { delete v.dataset.wasPlaying; const p = v.play(); if (p && p.catch) p.catch(function () {}); }
  dlgResume();                                           // pick the dialogue back up
}
document.addEventListener("visibilitychange", function () {
  if (document.hidden) pauseAllAudioFB(); else resumeAllAudioFB();
});
window.addEventListener("blur", pauseAllAudioFB);
window.addEventListener("focus", resumeAllAudioFB);
window.addEventListener("pagehide", pauseAllAudioFB);

/* ---- One-shot SFX via Web Audio (glitch-free, zero-latency) --------------
   An <audio> element pays a real first-play init cost and can stutter on short
   one-shots — that was the cover-flip "lag/glitch". Instead we decode each SFX
   ONCE into an AudioBuffer and play it through a BufferSource: sample-accurate,
   no start latency. Any leading silence baked into the mp3 is auto-skipped (we
   start on the first audible sample). Buffers come from base64 data URIs
   (window.SFX_DATA in sfx-data.js) so they decode even on file://, where fetch()
   of a plain path is blocked. If Web Audio is unavailable we fall back to plain
   <audio> elements (the old behaviour). */
let audioCtx = null;
const sfxBuf = {};                          // name -> { buffer, offset (seconds) }

// Fallback <audio> elements — used ONLY if Web Audio fails to init or decode.
// preload="none" on purpose: all three sounds are ALREADY inlined as base64 in
// sfx-data.js, so preloading them here downloaded every one a SECOND time
// (~107 KB per visit) for a path that almost never runs. On the rare browser that
// does fall back, the fetch happens on first play instead.
const flipSound = new Audio("sfx/Page%20flip.mp3");
flipSound.preload = "none";
const coverFlipSound = new Audio("sfx/cover%20page%20flip.mp3");
coverFlipSound.preload = "none";
coverFlipSound.volume = 0.35;
const playClickSound = new Audio("sfx/play%20click.mp3");
playClickSound.preload = "none";
playClickSound.volume = 0.5;

(function initSfx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const DATA = window.SFX_DATA || {};
  if (!AC || !DATA.cover) return;           // no Web Audio / no inlined data → fallback
  try { audioCtx = new AC(); } catch (_) { audioCtx = null; return; }
  function decode(name, uri) {
    fetch(uri).then(function (r) { return r.arrayBuffer(); })
      .then(function (a) { return audioCtx.decodeAudioData(a); })
      .then(function (buf) {
        // Skip any leading silence so playback starts right on the transient.
        const ch = buf.getChannelData(0), sr = buf.sampleRate, thr = 0.008;
        let first = 0;
        for (let i = 0; i < ch.length; i++) { if (Math.abs(ch[i]) > thr) { first = i; break; } }
        sfxBuf[name] = { buffer: buf, offset: Math.max(0, first / sr - 0.004) };
      })
      .catch(function () {});               // leave name unset → falls back to <audio>
  }
  decode("cover", DATA.cover);
  decode("flip", DATA.flip);
  decode("click", DATA.click);               // PLAY-button press blip
})();

// The audio context starts suspended until a user gesture. Resume it on the first
// pointer press (fires just BEFORE the open click) so the cover-flip sound, played
// a moment later, is instant. Capture phase, not once (cheap + always safe).
function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") { try { audioCtx.resume(); } catch (_) {} }
}
document.addEventListener("pointerdown", resumeAudio, { capture: true });

// Play a decoded SFX buffer; returns false if Web Audio isn't ready (→ caller
// falls back to the <audio> element).
function playSfx(name, vol, rate) {
  const entry = sfxBuf[name];
  if (!audioCtx || !entry) return false;
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = entry.buffer;
    if (rate) src.playbackRate.value = rate;
    const g = audioCtx.createGain();
    g.gain.value = (vol == null ? 1 : vol);
    src.connect(g).connect(audioCtx.destination);
    src.start(0, entry.offset || 0);        // start on the first audible sample
    return true;
  } catch (_) { return false; }
}

// Page-flip sound — snappy 1.5× on every ordinary flip.
function playFlip() {
  if (muted) return;                        // sound turns on when the book opens
  if (playSfx("flip", 1.0, 1.5)) return;    // Web Audio path
  try {                                     // fallback
    flipSound.currentTime = 0; flipSound.playbackRate = 1.5;
    const p = flipSound.play(); if (p && p.catch) p.catch(function () {});
  } catch (_) {}
}
// COVER-page flip sound — played ONLY when the cover opens (never on page flips).
function playCoverFlip() {
  if (muted) return;
  if (playSfx("cover", 0.35)) return;       // Web Audio path
  try {                                     // fallback
    coverFlipSound.currentTime = 0;
    const p = coverFlipSound.play(); if (p && p.catch) p.catch(function () {});
  } catch (_) {}
}
/* PLAY-BUTTON press sound ("sfx/play click.mp3", inlined as SFX_DATA.click) —
   plays on the press and leads the cover swing.
   NOTE: deliberately NOT gated on `muted`. Every other SFX waits for the book to
   be open, but this one IS the opening gesture — the press that unlocks audio in
   the first place — so it plays before soundOn() has run. */
function playPlayClick() {
  resumeAudio();                            // the press itself unlocks the context
  if (playSfx("click", 0.5)) return;        // Web Audio path
  try {                                     // fallback
    playClickSound.currentTime = 0;
    const p = playClickSound.play(); if (p && p.catch) p.catch(function () {});
  } catch (_) {}
}
// Turn sound ON when the book is opened (a clear user gesture). Safe to call
// repeatedly.
function soundOn() {
  muted = false;                     // opening the book turns sound on
}


/* ==========================================================================
   PAGE-TURN HINT  —  guidance for readers who don't know how to turn the page.
   When idle, two cues fire together: a hand taps the forward arrow AND the page
   itself does a "ghost" half-flip (lifts toward the next page, then falls back).
   Timing: PAGE 1 after 5s, every later page after 10s of no interaction; repeats
   while idle and is cancelled by any tap / key / flip. Never on the last page.
   ========================================================================== */
// The nudge is a HAND on the RIGHT side of the book. Optional engine art at
// engine/hand-nudge.png is used if present; until it exists, an emoji hand
// stands in (the <img> error handler swaps to it).
let flipHint = document.createElement("img");
flipHint.className = "flip-hint";
flipHint.setAttribute("aria-hidden", "true");
flipHint.alt = "";
flipHint.decoding = "async";
flipHint.src = "engine/hand-nudge.png";
flipHint.addEventListener("error", function () {
  const el = document.createElement("div");
  el.className = "flip-hint flip-hint--svg";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffffff" ' +
    'd="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 ' +
    '2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 ' +
    '4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6C13 6.67 12.33 6 11.5 6S10 ' +
    '6.67 10 7.5v10.74l-3.44-.72c-.37-.08-.76.04-1.02.31l-1.04 1.05 5.19 ' +
    '5.19c.28.28.66.44 1.06.44h6.78c.75 0 1.38-.55 1.49-1.29l.77-5.44c.1-.72-.29-1.42-.95-1.71z"/></svg>';
  if (flipHint.parentNode) flipHint.parentNode.replaceChild(el, flipHint);
  flipHint = el;                 // later show/position calls use the swapped-in element
}, { once: true });
document.body.appendChild(flipHint);

// Guidance timing: the nudge NEVER interrupts a scene — it appears only after
// the page's dialogue/scene sequence has fully finished (dialogueDone below),
// waits HINT_AFTER_DONE_MS more, then plays. It repeats every NUDGE_GAP_MS
// until the reader turns the page; any interaction resets it.
const HINT_AFTER_DONE_MS = 0;     // 0 = the hand appears WITH the arrow, the instant
                                  // the page's video ends (no waiting period)
const PEEK_REPEAT_MS = 3600;      // the ghost page-flip is a finite animation, so
                                  // replay it on this cadence while the nudge is up
const HINT_RESUME_MS = 2500;      // if a tap did NOT turn the page, bring the nudge
                                  // back after this long (not instantly, or it flickers)
const NUDGE_GAP_MS  = 9000;    // retry gap while the nudge is not allowed to show yet
let idleHintTimer = null;
let nudgeHideTimer = null;
let hintDoneFor = -1;          // page index whose dialogue has fully played out
let peeking = false;
let peekTimers = [];

/* The current page's dialogue/scenes have finished — the nudge may now arm.
   Called by the scene player (last scene done) and the single-bubble path. */
function dialogueDone(idx) {
  if (idx !== flipped) return;               // stale — we've left that page
  hintDoneFor = idx;
  updateProgress();                          // un-grey the corner arrows
  clearTimeout(idleHintTimer);
  clearTimeout(nudgeHideTimer);
  idleHintTimer = setTimeout(triggerHint, HINT_AFTER_DONE_MS);
}

function canShowHint() {
  // On an ACTIVITY page the nudge is suppressed WHILE the game is being played (it
  // owns the screen, and the arrows are hidden anyway) — but once the game reports
  // it is finished, the nudge runs on its "all levels done" screen to point the
  // reader onward.
  const onLbdPage = pages[flipped] && pages[flipped].type === "lbd";
  if (onLbdPage && !lbdDone.has(flipped) && flipped >= maxReached) return false;
  return opened && ready && !animating &&
         hintDoneFor === flipped &&          // never before the scene completes
         flipped < totalPages - 1 && !document.hidden;
}
function positionFlipHint() {
  if (!flipScaleEl) return;
  const r = flipScaleEl.getBoundingClientRect();            // the book's on-screen rect
  // Size the hand relative to the BOOK (not the viewport) so it always suits
  // the page, and sit it ON the bottom-right page corner — the exact corner
  // the ghost peel lifts.
  const hw = Math.max(40, Math.round(r.width * 0.085));
  flipHint.style.width = hw + "px";              // img and SVG fallback both size by width
  const w = flipHint.offsetWidth || hw, h = flipHint.offsetHeight || hw;
  flipHint.style.left = Math.round(r.right - w - r.width * 0.035) + "px";
  flipHint.style.top  = Math.round(r.bottom - h - r.height * 0.07) + "px";
}
function showFlipHint() {
  if (!canShowHint()) return;
  positionFlipHint();
  flipHint.classList.add("show");
}
function hideFlipHint() {
  flipHint.classList.remove("show");
}

/* ---- GHOST PAGE-FLIP -------------------------------------------------------
   Lift the current page about halfway toward the next one, then let it fall back
   — a live demo that the page turns. Purely visual; cancelled the instant the
   reader interacts, so a real drag/flip takes over cleanly. */
function cancelPeek() {
  peekTimers.forEach(clearTimeout);
  peekTimers = [];
  if (!peeking) return;
  peeking = false;
  const leaf = leaves[flipped];
  if (leaf) {
    if (G) {
      if (leaf._peekTl) { leaf._peekTl.kill(); leaf._peekTl = null; }
      peelEnd(leaf);                         // clears the clip + fold-back layers
    }
    leaf.style.transition = ""; leaf.style.transform = ""; leaf.style.zIndex = "";
    clearFlipFX(leaf);                       // fallback FX (curls, cast shadow, flex)
  }
  updateZ();
}
function peekFlip() {
  if (peeking || !canShowHint()) return;
  const leaf = leaves[flipped];
  if (!leaf) return;
  peeking = true;
  const curl = leaf.querySelector(".curl");
  leaf.style.zIndex = 300;                               // lift above the rest while peeking
  if (G) {
    // PEEL peek: lift the bottom-right corner a little — a live "you can peel
    // me" invitation — hold for a beat, then lay it back down flat.
    ensurePeelEls(leaf);
    leaf.style.transition = "none";
    leaf.style.transform = "none";
    const proxy = { t: 0 };
    const tl = G.timeline({
      onUpdate: function () { renderPeel(leaf, peelPath(proxy.t)); },
      onComplete: function () {
        leaf._peekTl = null;
        peelEnd(leaf);
        leaf.style.zIndex = "";
        peeking = false; updateZ();
      }
    });
    leaf._peekTl = tl;
    tl.to(proxy, { t: 0.12, duration: 0.7, ease: "power2.inOut" })
      .to(proxy, { t: 0,    duration: 0.6, ease: "power2.inOut", delay: 0.15 });
    return;
  }
  leaf.style.transition = "transform 720ms cubic-bezier(0.33, 0, 0.2, 1)";
  void leaf.offsetWidth;                                 // commit so the lift animates from flat
  leaf.style.transform = "rotateY(-52deg)";              // turn toward the next page (~halfway)
  if (curl) curl.style.opacity = "0.85";                 // page-curl shading during the lift
  peekTimers.push(setTimeout(function () {               // ...then ease it back down
    leaf.style.transform = "rotateY(0deg)";
    if (curl) curl.style.opacity = "";
  }, 760));
  peekTimers.push(setTimeout(function () {               // clean up once settled
    leaf.style.transition = ""; leaf.style.transform = ""; leaf.style.zIndex = "";
    peeking = false; updateZ();
  }, 760 + 760));
}

/* Start the nudge and KEEP IT RUNNING until the reader taps: the hand swipes on the
   book's right, the forward arrow blinks gold, and the ghost page-flip replays on a
   cadence. Both the hand (.show) and the arrow (.blink) carry infinite CSS
   animations, so they simply stay up — nothing hides them but resetIdleHint(). */
function triggerHint() {
  if (!canShowHint()) { idleHintTimer = setTimeout(triggerHint, NUDGE_GAP_MS); return; }
  showFlipHint();
  // The ghost page-lift is skipped on an ACTIVITY page: the game's finished screen
  // is sitting on top of that leaf, so peeling it would read as the book turning
  // the page by itself. The hand + blinking arrow carry the cue there instead.
  if (!(pages[flipped] && pages[flipped].type === "lbd")) peekFlip();
  if (cornerNext) cornerNext.classList.add("blink");
  // Only the ghost peel needs re-triggering; it is a one-shot tween, unlike the
  // hand and arrow which loop on their own.
  clearTimeout(nudgeHideTimer);
  nudgeHideTimer = setTimeout(triggerHint, PEEK_REPEAT_MS);
}
function resetIdleHint() {
  hideFlipHint();
  cancelPeek();
  if (cornerNext) cornerNext.classList.remove("blink");
  clearTimeout(idleHintTimer);
  clearTimeout(nudgeHideTimer);
  // Re-arm ONLY if this page's dialogue has already finished — otherwise the
  // nudge stays quiet until dialogueDone() fires for the page. The short delay
  // means a tap that did NOT turn the page brings the nudge back smoothly rather
  // than re-showing it in the same frame it was hidden.
  if (hintDoneFor === flipped) {
    idleHintTimer = setTimeout(triggerHint, HINT_RESUME_MS);
  }
}
// Any interaction cancels the nudge + restarts the idle countdown.
["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (evt) {
  document.addEventListener(evt, resetIdleHint, { passive: true, capture: true });
});

/* ---- Boot ---------------------------------------------------------------- */
fitScale();                              // scale the fixed 1280x720 book to fit first
renderLeaves();                          // lay out the leaves (all on page 1 to start)
updateProgress();
