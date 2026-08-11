/* ============================================================================
   ██  YOUR STORY  —  this is the ONLY file you edit to make a new flipbook  ██
   ----------------------------------------------------------------------------
   Change the cover, the music, and the pages below. Put your scene images and
   videos in  assets/pages/  and your cover in  assets/  , your music in  sfx/ .
   You never need to touch anything in  engine/  ,  index.html  , or the CSS.

   HOW A PAGE WORKS
   ----------------------------------------------------------------------------
   • Each entry in `pages` is ONE page of the book, shown in order after the
     cover. A page is either a single image/video, or a list of `scenes` that
     cross-dissolve into each other (1.1s) on the same page.

   • A scene:  { src, hold, fx, bubble }
       src    : the image ("assets/pages/x.png") or video (".mp4"/".webm").
       hold   : ms to linger before dissolving to the next scene
                (default 1600; a video with no hold advances when it ends).
       fx     : optional ambient animation over the art —
                "popcorn" | "scan" | "sparkle" | "shake"
                | { type:"pulse", x:"48%", y:"62%" }  (a glow at a point)
       bubble : optional speech bubble (below).

   • A single-image page (no scenes):  { type:"image", src, bubble }
     A single-video page:              { type:"video", src, delay }

   • A speech bubble:  bubble: { kind:"speech", text, box, flip, typeSpeed }
       text     : the words. Use "\n" to choose where the line breaks.
       box      : { top / left / right / bottom, w } — position (CSS %) and
                  WIDTH in book-space px (the book is 1280 x 720).
       flip     : true → mirror the bubble so its tail points the other way.
                  Aim the tail tip at the speaking character's head.
       typeSpeed: ms per typed character (default 45) — lower = faster.

   • Last entry must be  { type: "end" }  — the closing "The End" page.
   ============================================================================ */
window.STORY = {
  // Cover art shown on the closed book (any image in assets/).
  cover: "assets/title-page.webp",

  // Looping background music (any file in sfx/). Left out on purpose: every page
  // video below carries its own narration, so music would talk over the story.
  // To add it later, drop a file in sfx/ and uncomment:
  // music: "sfx/BG Music.mp3",

  pages: [
    // ── 10 story pages + 3 embedded ACTIVITIES, in reading order ───────────
    // Video pages are full-bleed 1280x720 MP4 clips (H.264/AAC - plays everywhere) with their own voice-over: the
    // clip starts as the page lands and the forward arrow appears once it ends
    // (tap the video to replay it). Activity pages ("lbd") embed a playable game
    // — see the block after page 5.
    //
    // ►  ACTIVITY PAGES NEED A LOCAL SERVER. The games load js/main.js as an ES
    //    module, and browsers block module scripts over file:// (CORS, origin
    //    "null"). Opened by double-click the games show their title screen but
    //    LET'S PLAY does nothing. Serve the folder over http:// instead.
    { type: "video", src: "assets/pages/PAGE 1.mp4" },   // 10.0s
    { type: "video", src: "assets/pages/PAGE 2.mp4" },   //  6.5s
    { type: "video", src: "assets/pages/PAGE 3.mp4" },   // 32.9s
    { type: "video", src: "assets/pages/PAGE 4.mp4" },   // 16.4s
    { type: "video", src: "assets/pages/PAGE 5.mp4" },   // 16.6s

    // ── ACTIVITY (LBD 1) — after page 5 ────────────────────────────────────
    // An "lbd" page embeds a playable game as a page of the book. src is the
    // game's own index.html; poster is the still shown on the leaf while the page
    // turns (grabbed from the game's home screen). The live game runs in the
    // body-level overlay iframe and unloads when you flip away.
    //
    // endPoster (OPTIONAL): the still to show on the leaf once the game has been
    // FINISHED, used for the turn AWAY from the activity. Without it the reader
    // gets one last look at the game's title screen as the page turns, since
    // `poster` is that title screen — so with no endPoster the engine turns the
    // page as bare paper instead. Grab this one from the game's OWN end screen
    // ("All Levels Done." / the reward screen / the jackpot popup) at 1280x720:
    //   endPoster: "assets/posters/lbd/LBD1-end.webp",
    { type: "lbd", src: "Game-Zone-LBD1/index.html",
      poster: "assets/posters/lbd/LBD1.webp", alt: "Coin Quest activity" },

    { type: "video", src: "assets/pages/PAGE 6.mp4" },   // 26.0s
    { type: "video", src: "assets/pages/PAGE 7.mp4" },   // 20.3s

    // ── ACTIVITY (LBD 2) — after page 7 ────────────────────────────────────
    { type: "lbd", src: "Game-Zone-LBD2/index.html",
      poster: "assets/posters/lbd/LBD2.webp", alt: "Coin Quest activity" },

    { type: "video", src: "assets/pages/PAGE 8.mp4" },   // 18.0s

    // ── ACTIVITY (LBD 3) — after page 8 ────────────────────────────────────
    { type: "lbd", src: "Game-Zone-LBD3/index.html",
      poster: "assets/posters/lbd/LBD3.webp", alt: "Jackpot activity" },

    { type: "video", src: "assets/pages/PAGE 9.mp4" },   // 25.9s
    // PAGE 10 — a breathing glow over the GLOW BRACELETS on the prize shelf, for
    // the opening shot only. The shot holds still until it wipes to new framing at
    // ~4.4s, after which the bracelets move — so the window closes at 4.3s and the
    // glow fades out rather than sitting over the wrong part of the picture.
    { type: "video", src: "assets/pages/PAGE 10.mp4",     // 21.1s
      fx: { type: "pulse", x: "66%", y: "35%", w: 470, h: 210,
            bright: true, from: 0, to: 4.3 } },

    { type: "end" },   // ← keep this last: the closing "The End" page
  ]
};
