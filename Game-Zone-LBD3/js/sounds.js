// js/sounds.js - Sound effects manager for the arcade learning game

const SOUNDS = {
    drop: new Audio('assets/sounds/drop.mp3'),
    note: new Audio('assets/sounds/note.mp3'),
    leverPull: new Audio('assets/sounds/Slot_Machine3.mp3'),
    success: new Audio('assets/sounds/success1.mp3'),
    error: new Audio('assets/sounds/error3.mp3'),

    // Placeholders for other arcade game sounds (user can drop files into folder later)
    jackpot: new Audio('assets/sounds/jackpot_win.mp3'),
    click: new Audio('assets/sounds/click.mp3'),
    grab: new Audio('assets/sounds/grab.mp3'),
    remove: new Audio('assets/sounds/remove.mp3')
};

// Per-sound volume overrides (default for HTMLAudioElement.volume is 1.0)
SOUNDS.leverPull.volume = 0.5;

// Remember each SFX's base volume (after the overrides above) so ducking
// can scale them down and restore them exactly.
const SFX_BASE_VOLUME = {};
Object.keys(SOUNDS).forEach(key => {
    SFX_BASE_VOLUME[key] = SOUNDS[key].volume;
});

// ---- Background music ---------------------------------------------------
// One Audio instance, loops continuously across the entire session.
// Don't .play() at module load — wait for the first user gesture.
const bgMusic = new Audio('assets/sounds/BG_Music4.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.40;
bgMusic.playbackRate = 1.0;

// Tracks whether BG music has been kicked off by a user gesture yet —
// resumeAudio() won't try to .play() before the first start to avoid
// triggering autoplay rejections on every tab focus.
let bgMusicStarted = false;

// Kick off the BG music. Idempotent — .play() on an already-playing
// element is a no-op, so replay flows won't restart the loop.
export function startBgMusic() {
    bgMusicStarted = true;
    bgMusic.play().catch(err => {
        // Browser autoplay policy may reject — log silently.
        console.warn('Background music play() rejected:', err);
    });
}

// ---- Voice-over (VO) ----------------------------------------------------
// One VO at a time. New VO stops the previous. Supports chaining via
// an optional onEnd callback (used to sequence "Make the amount…" →
// "Drag money here").
const VO = {
    letsPlay:         new Audio(encodeURI('assets/vo/Let us play Tap the lever.ogg')),
    makeAmount:       new Audio(encodeURI('assets/vo/Make the amount 42 Rupees.ogg')),
    makeAmountAgain:  new Audio(encodeURI('assets/vo/Make the amount 42 Rupees again.ogg')),
    dragMoney:        new Audio(encodeURI('assets/vo/Drag money here.ogg')),
    correct:          new Audio(encodeURI('assets/vo/Yay that is correct.ogg')),
    incorrect:        new Audio(encodeURI('assets/vo/Opps that_s incorrect.ogg')),
    jackpot:          new Audio(encodeURI('assets/vo/You have hit the jackpot.ogg')),
    tapLever:         new Audio(encodeURI('assets/vo/Tap lever. Play again.ogg')),
};

// Load metadata early so VO durations are known before the first play —
// the instruction-panel typewriter paces itself to these durations.
Object.values(VO).forEach(a => { a.preload = 'auto'; });

// Duration (in seconds) of a VO line, or 0 if not yet known / missing.
export function getVODuration(key) {
    const a = VO[key];
    if (!a || !isFinite(a.duration) || a.duration <= 0) return 0;
    return a.duration;
}

let currentVO = null;

// ---- Ducking -------------------------------------------------------------
// While a VO line is speaking, BG music and SFX drop to a fraction of their
// base volume so the voice stays clear, then restore when the line ends.
const DUCK_FACTOR = 0.25;
const BG_BASE_VOLUME = bgMusic.volume;
let ducked = false;

function duckAudio() {
    if (ducked) return;
    ducked = true;
    bgMusic.volume = BG_BASE_VOLUME * DUCK_FACTOR;
    Object.keys(SOUNDS).forEach(key => {
        SOUNDS[key].volume = SFX_BASE_VOLUME[key] * DUCK_FACTOR;
    });
}

function unduckAudio() {
    if (!ducked) return;
    ducked = false;
    bgMusic.volume = BG_BASE_VOLUME;
    Object.keys(SOUNDS).forEach(key => {
        SOUNDS[key].volume = SFX_BASE_VOLUME[key];
    });
}

export function playVO(key, onEnd) {
    const audio = VO[key];
    if (!audio) return;

    // Stop whatever was playing so lines never talk over each other.
    if (currentVO && currentVO !== audio) {
        currentVO.pause();
        currentVO.currentTime = 0;
        currentVO.onended = null;
    }

    currentVO = audio;
    duckAudio();
    audio.currentTime = 0;
    audio.onended = () => {
        audio.onended = null;
        if (currentVO === audio) {
            currentVO = null;
            // Only restore volumes if the onEnd chain doesn't start another VO
            if (onEnd) onEnd();
            if (!currentVO) unduckAudio();
        } else if (onEnd) {
            onEnd();
        }
    };
    audio.play().catch(err => {
        console.warn(`Failed to play VO '${key}':`, err);
        audio.onended = null;
        if (currentVO === audio) {
            currentVO = null;
            if (onEnd) onEnd();
            if (!currentVO) unduckAudio();
        } else if (onEnd) {
            onEnd();
        }
    });
}

export function stopVO() {
    if (currentVO) {
        currentVO.pause();
        currentVO.currentTime = 0;
        currentVO.onended = null;
        currentVO = null;
    }
    unduckAudio();
}

// Called when the tab/window is hidden (Page Visibility API).
export function pauseAudio() {
    if (bgMusicStarted) bgMusic.pause();
    stopVO(); // stale VO on return would be more confusing than helpful
}

// Called when the tab/window becomes visible again.
export function resumeAudio() {
    if (!bgMusicStarted) return;
    bgMusic.play().catch(() => {
        // Silent — rare cases where the browser blocks the resume.
    });
}

// Play helper that handles browser autoplay/interaction constraints
export function playSound(key) {
    const audio = SOUNDS[key];
    if (!audio) return;

    // Reset playhead to start to support rapid, overlapping sound triggers
    audio.currentTime = 0;

    audio.play().catch(err => {
        console.warn(`Failed to play sound '${key}':`, err);
    });
}
