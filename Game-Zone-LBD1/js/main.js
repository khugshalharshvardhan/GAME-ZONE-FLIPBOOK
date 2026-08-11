// Phase 1: Starter imports and App Initialization

import * as dragDrop from './dragDrop.js';
import { playLevelIntro } from './level-intro.js';
import { playLevelVO, pauseVO, resumeVO } from './vo.js';

const INITIAL_LEVEL = 1;
const INITIAL_TARGET = 12;

// Re-trigger the gold-glow attention pop on the TARGET amount.
// Removes + re-adds the class with a reflow in between so the animation restarts.
function popTarget() {
    const el = document.querySelector('.target-amount');
    if (!el) return;
    el.classList.remove('attention-pop');
    void el.offsetWidth;
    el.classList.add('attention-pop');
}

class GameApp {
    constructor() {
        this.init();
    }

    init() {
        console.log("Arcade Game Initialized - Phase 1");

        // Empty the instruction panel at boot. index.html ships with the
        // Level 1 question baked in, which would flash fully formed while
        // the cinematic intro fades out — the typewriter (window.typeQuestion)
        // writes it in synced with the VO once the intro finishes.
        const questionContent = document.querySelector('.question-content');
        if (questionContent) questionContent.innerHTML = '';

        // Preload the "Play again" SVG so when all four levels are completed
        // and the play button swaps from "Let's Play" → "Play again", the new
        // image is already in cache. The src swap then resolves synchronously
        // and the button can't flicker through the old text on the way in.
        const playAgainPreload = new Image();
        playAgainPreload.src = 'assets/images/Play_again_BTN.svg';

        // Mobile portrait → suggest landscape (non-blocking). Dismiss persists
        // for the session so the user isn't nagged every time they rotate.
        const rotatePrompt = document.getElementById('rotate-prompt');
        if (rotatePrompt) {
            try {
                if (sessionStorage.getItem('rotate-dismissed') === '1') {
                    document.body.classList.add('rotate-dismissed');
                }
            } catch { /* sessionStorage blocked → just show it again */ }
            const dismissBtn = rotatePrompt.querySelector('.rotate-prompt__dismiss');
            dismissBtn?.addEventListener('click', () => {
                document.body.classList.add('rotate-dismissed');
                try { sessionStorage.setItem('rotate-dismissed', '1'); } catch {}
            });
        }

        // Looping background music — kicked off inside the Play click handler
        // so it counts as a user gesture and the browser actually plays it.
        const bgMusic = new Audio('assets/sounds/BG_Music4.mp3');
        bgMusic.loop = true;
        // Below the VO/SFX layers but still clearly audible.
        bgMusic.volume = 0.28;
        bgMusic.playbackRate = 1.0;

        // The BG file has ~2–3s of trailing silence that makes the native
        // loop feel delayed. Manually rewind a bit early so playback wraps
        // back to the start without the dead air. Tweak TRIM_TAIL_SECONDS
        // if the track has more or less silence than expected.
        const TRIM_TAIL_SECONDS = 2.5;
        bgMusic.addEventListener('timeupdate', () => {
            if (bgMusic.duration &&
                bgMusic.currentTime >= bgMusic.duration - TRIM_TAIL_SECONDS) {
                bgMusic.currentTime = 0;
            }
        });

        // One-shot, idempotent wrapper the cinematic intro invokes on completion.
        let gameStarted = false;
        window.startGame = () => {
            if (gameStarted) return;
            gameStarted = true;
            dragDrop.initDragDrop();
        };

        // Pause everything when the tab is hidden (switched away or browser
        // minimised). Resumes when it comes back. Music pauses in-place;
        // CSS animations across the whole page freeze via .game-paused.
        let bgWasPlayingBeforeHide = false;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                bgWasPlayingBeforeHide = !bgMusic.paused;
                if (bgWasPlayingBeforeHide) bgMusic.pause();
                pauseVO();
                document.body.classList.add('game-paused');
            } else {
                document.body.classList.remove('game-paused');
                if (bgWasPlayingBeforeHide) {
                    bgMusic.play().catch(() => {});
                }
                resumeVO();
            }
        });

        const playBtn = document.getElementById('play-btn');
        const screen0 = document.getElementById('screen-0');

        if (playBtn && screen0) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const startSound = new Audio('assets/sounds/start.mp3');
                startSound.volume = 0.8; // match the SFX level of the rest of the mix
                startSound.play().catch(err => console.log('Audio play failed:', err));

                // Start BG music if it hasn't already (calling play() on an
                // already-playing element is a safe no-op).
                bgMusic.play().catch(err => console.log('BG music play failed:', err));

                screen0.classList.add('hidden');

                // Cinematic intro plays, then triggers window.startGame() at the end.
                // Covers both the first "Let's Play" and the "Play again" runs.
                // startGame() runs synchronously before this .then, so
                // window.typeQuestion is guaranteed to exist here.
                playLevelIntro(INITIAL_LEVEL, INITIAL_TARGET).then(() => {
                    popTarget();
                    playLevelVO(INITIAL_LEVEL);
                    window.typeQuestion?.();
                });
            });
        } else {
            // Fallback if screen 0 is missing — go straight into the intro.
            playLevelIntro(INITIAL_LEVEL, INITIAL_TARGET).then(() => {
                popTarget();
                playLevelVO(INITIAL_LEVEL);
                window.typeQuestion?.();
            });
        }
    }
}

// Bootstrap the application
document.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameApp();
});
