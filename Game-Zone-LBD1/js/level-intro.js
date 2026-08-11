// Cinematic level-intro module.
// playLevelIntro(levelNumber, targetAmount) builds its own fullscreen overlay,
// runs ~3.7s of orchestrated CSS animations, calls window.startGame() if defined,
// and resolves a Promise on completion. Safe to call multiple times — any
// in-flight overlay is torn down before a new one starts.

const FRAMES = {
    fall:     'assets/images/Bite1.webp',
    impact:   'assets/images/Bite2.webp',
    recovery: 'assets/images/Bite3.webp',
    idle:     'assets/images/Bite.webp',
};

// Preload all four frames once at module load so JS-driven src swaps
// during the impact sequence never flicker.
(function preloadFrames() {
    for (const src of Object.values(FRAMES)) {
        const img = new Image();
        img.src = src;
    }
})();

const PARTICLE_COUNT = 14;
const TOTAL_DURATION_MS = 3700;
const TOTAL_DURATION_REDUCED_MS = 50;

// Timestamps (ms) for JS-driven sprite swaps. Mirror the CSS keyframe schedule.
const SWAP_IMPACT_MS = 1050;
const SWAP_RECOVERY_MS = 1170;
const SWAP_IDLE_MS = 1320;

let active = null;

function buildOverlay(levelNumber, targetAmount) {
    const overlay = document.createElement('div');
    overlay.className = 'level-intro-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="level-intro-grid"></div>
        <div class="level-intro-stage">
            <div class="level-intro-shockwave"></div>
            <div class="level-intro-particles"></div>
            <h1 class="level-intro-title">LEVEL ${levelNumber}</h1>
            <h2 class="level-intro-subtitle">Make ₹${targetAmount}</h2>
            <img class="level-intro-byte" src="${FRAMES.fall}" alt="" draggable="false" />
        </div>
    `;

    // Spawn particles with even angular spread + small per-particle jitter,
    // exposing position and delay as CSS custom properties.
    const particlesContainer = overlay.querySelector('.level-intro-particles');
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const baseAngle = (i / PARTICLE_COUNT) * Math.PI * 2;
        const angle = baseAngle + (Math.random() - 0.5) * 0.4; // ±0.2 rad
        const radius = 80 + Math.random() * 60;                // 80–140 px
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        const delay = Math.random() * 80;                      // 0–80 ms stagger

        const p = document.createElement('div');
        p.className = 'level-intro-particle';
        p.style.setProperty('--px', `${px.toFixed(1)}px`);
        p.style.setProperty('--py', `${py.toFixed(1)}px`);
        p.style.setProperty('--delay', `${delay.toFixed(0)}ms`);
        particlesContainer.appendChild(p);
    }

    return overlay;
}

export function playLevelIntro(levelNumber, targetAmount) {
    // Replace any in-flight intro with the new one.
    if (active) active.cancel();

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const totalDuration = reduceMotion ? TOTAL_DURATION_REDUCED_MS : TOTAL_DURATION_MS;

    return new Promise((resolve) => {
        const overlay = buildOverlay(levelNumber, targetAmount);
        document.body.appendChild(overlay);

        const byteImg = overlay.querySelector('.level-intro-byte');
        const timers = [];
        let cancelled = false;
        let finished = false;

        if (reduceMotion) {
            byteImg.src = FRAMES.idle;
        } else {
            timers.push(setTimeout(() => { byteImg.src = FRAMES.impact;   }, SWAP_IMPACT_MS));
            timers.push(setTimeout(() => { byteImg.src = FRAMES.recovery; }, SWAP_RECOVERY_MS));
            timers.push(setTimeout(() => { byteImg.src = FRAMES.idle;     }, SWAP_IDLE_MS));
        }

        const cleanup = () => {
            timers.forEach(clearTimeout);
            timers.length = 0;
            if (overlay.parentElement) overlay.remove();
        };

        const cancel = () => {
            if (cancelled || finished) return;
            cancelled = true;
            cleanup();
            if (active && active.cancel === cancel) active = null;
            resolve();
        };

        active = { cancel };

        timers.push(setTimeout(() => {
            if (cancelled) return;
            finished = true;
            cleanup();
            if (active && active.cancel === cancel) active = null;
            if (typeof window.startGame === 'function') {
                try { window.startGame(); } catch (err) { console.error('startGame() failed:', err); }
            }
            resolve();
        }, totalDuration));
    });
}
