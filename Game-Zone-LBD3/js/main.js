// main.js - Application entry point
import { setupLeverInteraction } from './lever.js';
import { setupGameFlow } from './game.js';
import { initGuideTutorial } from './guide.js';
import { playSound, startBgMusic, pauseAudio, resumeAudio, playVO } from './sounds.js';

console.log('Arcade Game - Phase 1 Initialized');

/**
 * Initialize the pre-LBD intro start screen.
 */
const initPreLbdScreen = () => {
    const playBtn = document.querySelector('.prelbd-play-btn');
    const prelbdContainer = document.querySelector('.prelbd-container');
    if (playBtn && prelbdContainer) {
        playBtn.addEventListener('click', () => {
            playSound('success');
            // First user gesture: start the looping BG music (browser autoplay
            // policy is satisfied here). Safe to call again later — .play()
            // on an already-playing element is a no-op.
            startBgMusic();
            prelbdContainer.classList.add('hidden');

            // Bouncy entrance for the "Let's play! Tap lever." pill
            const pill = document.querySelector('.idle-slot-pill');
            if (pill) {
                pill.classList.remove('entering');
                void pill.offsetWidth; // force reflow so the animation restarts
                pill.classList.add('entering');
            }

            // VO: "Let us play. Tap the lever."
            playVO('letsPlay');
        });
    }
};

/**
 * Initialize the game layout and any required listeners.
 */
const initGame = () => {
    // Scale the game container to fit the viewport window optimally
    scaleGame();
    window.addEventListener('resize', scheduleScaleGame);

    // Rotate-overlay is a suggestion, not a force — let the player dismiss it.
    initRotateOverlayDismiss();

    // Fade in the container smoothly once initial scale is applied
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        void gameContainer.offsetHeight; // Force layout reflow
        gameContainer.style.opacity = '1';
    }
    window.addEventListener('orientationchange', () => {
        setTimeout(scaleGame, 200);
    });

    // Hide the rotation suggestion automatically when the user does land in
    // landscape (one-shot — once dismissed, it stays dismissed for the session).
    const mql = window.matchMedia('(orientation: landscape)');
    const onOrientationChange = () => {
        if (mql.matches) {
            const overlay = document.querySelector('.rotate-overlay');
            if (overlay) overlay.classList.add('dismissed');
        }
    };
    mql.addEventListener('change', onOrientationChange);

    // Initialize the pre-LBD landing screen overlay
    initPreLbdScreen();

    // Inline the cabinet SVG (lever tap currently disabled)
    setupLeverInteraction();

    // Initialize onboarding guide event listeners
    initGuideTutorial();

    // Start the slot-1 tap-to-begin game flow
    setupGameFlow();

    // Pause music + animations when the tab is hidden / window minimised,
    // resume when it comes back.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            document.body.classList.add('tab-hidden');
            pauseAudio();
        } else {
            document.body.classList.remove('tab-hidden');
            resumeAudio();
        }
    });
};

const scaleGame = () => {
    const gameContainer = document.querySelector('.game-container');
    if (!gameContainer) return;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Base dimensions we designed for
    const baseWidth = 1920;
    const baseHeight = 1080;

    // Find the scale ratio that fits the container entirely within the screen
    const scale = Math.min(windowWidth / baseWidth, windowHeight / baseHeight);

    gameContainer.style.transform = `scale(${scale})`;
};

// Debounce resize-driven scale work — mobile address bars fire many events
// per second when collapsing/expanding.
let scaleRaf = 0;
const scheduleScaleGame = () => {
    if (scaleRaf) return;
    scaleRaf = requestAnimationFrame(() => {
        scaleRaf = 0;
        scaleGame();
    });
};

// Dismiss handler for the rotation suggestion overlay
const initRotateOverlayDismiss = () => {
    const overlay = document.querySelector('.rotate-overlay');
    const btn = overlay && overlay.querySelector('.rotate-overlay-dismiss');
    if (!btn || !overlay) return;
    btn.addEventListener('click', () => overlay.classList.add('dismissed'));
};

// Block the browser's right-click "Save image as / Copy image" menu on
// every image and SVG — those are art assets, not user content.
document.addEventListener('contextmenu', e => {
    if (e.target && (e.target.closest('img, svg, picture'))) {
        e.preventDefault();
    }
});

// Last-resort guard against the native HTML5 dragstart event for anyone
// who somehow bypasses the CSS / draggable=false rules.
document.addEventListener('dragstart', e => e.preventDefault());

// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', initGame);
