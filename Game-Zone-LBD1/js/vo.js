// Voice-over module — one clip per game event, preloaded up front.
// Only one VO ever plays at a time: starting a new clip stops the
// current one, so rapid events (error → success) never talk over
// each other. Sound effects (drop/error/success jingles) are separate
// and unaffected.

const VO_BASE = 'assets/vo/';

const VO_FILES = {
    level1:       'Use 2 Rupees coins to make 12 Rupees.ogg',
    level2:       'Use 5 Rupees coins to make 25 Rupees.ogg',
    // Level 3 accepts both ₹10 coins and notes, so its line is
    // type-neutral: "Use 10 Rupees to make 50 Rupees".
    level3:       'Use 10 Rupees to make 50 Rupees.ogg',
    level4:       'Use 50 Rupees notes to make 100 Rupees.ogg',
    tooFewCoins:  'Too few coins Add more.ogg',
    tooFewNotes:  'Too few notes Add more.ogg',
    tooManyCoins: 'Too many coins Remove some.ogg',
    tooManyNotes: 'Too many notes Remove some.ogg',
    // Type-neutral error lines for mixed-denomination levels (level 3).
    addMore:      'Add more.ogg',
    removeSome:   'remove some.ogg',
    success:      'Yay you have won the tickets.ogg',
    allDone:      'All levels done.ogg',
};

const clips = {};
for (const [key, file] of Object.entries(VO_FILES)) {
    const audio = new Audio(VO_BASE + encodeURIComponent(file));
    audio.preload = 'auto';
    audio.volume = 1.0; // VO is the loudest layer in the mix
    clips[key] = audio;
}

let current = null;
let pausedByVisibility = false;

export function playVO(key) {
    const clip = clips[key];
    if (!clip) return;
    stopVO();
    current = clip;
    clip.currentTime = 0;
    clip.play().catch(() => { /* autoplay policy / missing file — stay silent */ });
}

// Convenience: question VO for a level number (1–4).
export function playLevelVO(level) {
    playVO('level' + level);
}

// Duration of a clip in ms, or null if its metadata hasn't loaded yet
// (all clips preload at module load, so this is virtually always ready
// by the time gameplay starts). Used to sync the instruction-panel
// typewriter to the voice-over.
export function voDurationMs(key) {
    const d = clips[key]?.duration;
    return (d && isFinite(d)) ? d * 1000 : null;
}

export function stopVO() {
    if (!current) return;
    current.pause();
    current.currentTime = 0;
    current = null;
    pausedByVisibility = false;
}

// Tab-hidden pause support (mirrors the BG music behaviour in main.js).
// Pauses in place; resumeVO continues from where it left off.
export function pauseVO() {
    if (current && !current.paused) {
        current.pause();
        pausedByVisibility = true;
    }
}

export function resumeVO() {
    if (current && pausedByVisibility) {
        pausedByVisibility = false;
        current.play().catch(() => {});
    }
}
