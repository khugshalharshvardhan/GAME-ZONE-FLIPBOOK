/**
 * Voice-over playback - one shared channel.
 *
 * All VO lines route through a single Audio element so a newly triggered line
 * always interrupts the previous one (two voices never talk over each other).
 * SFX and BG music live elsewhere and are unaffected.
 */

const VO_BASE = 'assets/vo/';

// Warm the browser cache so the first play of each line starts exactly on its
// scheduled delay instead of delay + network fetch.
[
    'Make 36 Rupees.ogg',
    'Make 54 Rupees.ogg',
    'Make 63 Rupees.ogg',
    'Add more.ogg',
    'remove some.ogg',
    'Yay you have won the tickets.ogg',
    'All levels done.ogg',
    'Tap the basket ball.ogg',
].forEach(file => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = VO_BASE + file;
});

const voPlayer = new Audio();
let pendingTimer = null;

// --- BG-music ducking -------------------------------------------------------
// While a VO line speaks, the background track fades down so the voice reads
// clearly, then fades back up when the line ends. main.js registers its
// bgMusic element via setBgMusic().
let bgMusic = null;
let bgNormalVolume = 0.40;
let fadeTimer = null;
const DUCK_FACTOR = 0.25;  // duck to 25% of normal volume
const FADE_MS = 200;

export function setBgMusic(audio) {
    bgMusic = audio;
    bgNormalVolume = audio.volume;
}

function fadeBgTo(target) {
    if (!bgMusic) return;
    clearInterval(fadeTimer);
    const start = bgMusic.volume;
    const steps = Math.max(1, Math.round(FADE_MS / 25));
    let i = 0;
    fadeTimer = setInterval(() => {
        i++;
        bgMusic.volume = start + (target - start) * (i / steps);
        if (i >= steps) clearInterval(fadeTimer);
    }, 25);
}

function duckBg()   { fadeBgTo(bgNormalVolume * DUCK_FACTOR); }
function unduckBg() { fadeBgTo(bgNormalVolume); }
// ----------------------------------------------------------------------------

/**
 * Play a VO clip.
 * @param {string} file    - filename inside assets/vo/, e.g. 'Add more.ogg'
 * @param {number} delayMs - optional delay before speaking (lets an SFX land first)
 * @param {function} [onEnded] - optional callback when the clip finishes
 */
export function playVO(file, delayMs = 0, onEnded = null) {
    clearTimeout(pendingTimer);
    voPlayer.onended = null;

    const start = () => {
        voPlayer.src = VO_BASE + file;
        voPlayer.currentTime = 0;
        duckBg();
        voPlayer.onended = () => {
            if (onEnded) onEnded();
            // Only restore BG volume if the callback didn't start another line
            // (chained VOs keep the music ducked straight through).
            if (voPlayer.paused || voPlayer.ended) unduckBg();
        };
        voPlayer.play().catch(e => {
            console.log('VO error:', e);
            unduckBg();
        });
    };

    if (delayMs > 0) {
        pendingTimer = setTimeout(start, delayMs);
    } else {
        start();
    }
}

export function stopVO() {
    clearTimeout(pendingTimer);
    voPlayer.onended = null;
    voPlayer.pause();
    voPlayer.currentTime = 0;
    unduckBg();
}
