/**
 * Cinematic level intro
 *
 *   playLevelIntro(levelNumber, targetAmount)
 *     -> returns a Promise that resolves when the intro is done.
 *     -> also calls window.startGame() at completion, if defined.
 *
 * Total runtime: 3.7s.  All motion is CSS-keyframe driven.
 */

import { playVO } from './vo.js';

const TOTAL_MS       = 3700;
const PARTICLE_COUNT = 14;

// Four Bite frames swapped in sequence to mimic anticipation -> impact -> recovery -> idle.
// Timings line up with the keyframe boundaries in level-intro.css.
const BYTE_FRAMES = {
    falling: 'assets/images/Bite1.webp',   //  0.75s - 1.05s  (fall)
    landing: 'assets/images/Bite2.webp',   //  1.05s - 1.17s  (impact)
    popup:   'assets/images/Bite3.webp',   //  1.17s - 1.32s  (recovery)
    idle:    'assets/images/Bite.webp',    //  1.32s - 2.40s  (settle + fade out)
};

const BYTE_SWAP_SCHEDULE = [
    { src: BYTE_FRAMES.landing, at: 1050 },
    { src: BYTE_FRAMES.popup,   at: 1170 },
    { src: BYTE_FRAMES.idle,    at: 1320 },
];

// Preload all frames so the src swap is flicker-free.
for (const src of Object.values(BYTE_FRAMES)) {
    const pre = new Image();
    pre.src = src;
}

let activeOverlay = null;

export function playLevelIntro(levelNumber, targetAmount) {
    // Replace any in-flight intro so callers can't double-stack overlays.
    if (activeOverlay && activeOverlay.parentNode) {
        activeOverlay.remove();
    }

    const overlay = buildOverlay(levelNumber, targetAmount);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    const byte = overlay.querySelector('.level-intro-byte');

    // Two RAFs so the browser commits the initial (un-animated) styles before
    // the .is-playing class kicks the keyframes off cleanly.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => overlay.classList.add('is-playing'));
    });

    // Bite frame swaps - scheduled relative to .is-playing taking effect.
    const swapTimers = BYTE_SWAP_SCHEDULE.map(({ src, at }) =>
        setTimeout(() => { if (byte.isConnected) byte.src = src; }, at)
    );


    return new Promise((resolve) => {
        setTimeout(() => {
            swapTimers.forEach(clearTimeout);
            if (overlay.parentNode) overlay.remove();
            if (activeOverlay === overlay) activeOverlay = null;

            // Speak the goal now that the intro overlay is gone and the actual
            // gameplay screen is what the player sees - not mid-transition.
            playVO(`Make ${targetAmount} Rupees.ogg`);

            if (typeof window.startGame === 'function') {
                try { window.startGame(); }
                catch (err) { console.error('startGame() threw:', err); }
            }

            // Fired AFTER startGame() so level-1's listener (attached inside
            // initDragDrop) exists by now. dragDrop uses this to typewrite the
            // question text in sync with the VO that just started.
            document.dispatchEvent(new CustomEvent('level-intro-complete', {
                detail: { levelNumber, targetAmount }
            }));
            resolve();
        }, TOTAL_MS);
    });
}

/* ----------------------------------------------------------- */

function buildOverlay(levelNumber, targetAmount) {
    const overlay = document.createElement('div');
    overlay.className = 'level-intro-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', `Starting level ${levelNumber}`);

    const stage = document.createElement('div');
    stage.className = 'level-intro-stage';

    const shockwave = document.createElement('div');
    shockwave.className = 'level-intro-shockwave';

    const particles = document.createElement('div');
    particles.className = 'level-intro-particles';
    spawnParticles(particles, PARTICLE_COUNT);

    const title = document.createElement('h1');
    title.className = 'level-intro-title';
    title.textContent = `LEVEL ${levelNumber}`;

    const subtitle = document.createElement('h2');
    subtitle.className = 'level-intro-subtitle';
    subtitle.textContent = `Make ₹${targetAmount}`;

    const byte = document.createElement('img');
    byte.className = 'level-intro-byte';
    byte.src = BYTE_FRAMES.falling;
    byte.alt = '';
    byte.draggable = false;

    stage.appendChild(shockwave);
    stage.appendChild(particles);
    stage.appendChild(title);
    stage.appendChild(subtitle);
    stage.appendChild(byte);
    overlay.appendChild(stage);

    return overlay;
}

function spawnParticles(host, count) {
    for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = 'level-intro-particle';

        // Even-spread angles with small jitter so the burst feels organic.
        const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
        const dist  = 80 + Math.random() * 60;       // px
        const delay = Math.floor(Math.random() * 80); // ms

        p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
        p.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
        p.style.setProperty('--delay', `${delay}ms`);

        host.appendChild(p);
    }
}
