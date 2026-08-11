// Phase 1: Starter imports and App Initialization

import * as dragDrop from './dragDrop.js';
import { playLevelIntro } from './level-intro.js';
import { setBgMusic } from './vo.js';

// Tracks whether dragDrop.initDragDrop() has run. Inter-level cinematic intros
// also fire window.startGame() on completion - we only want to bind handlers once.
let gameStarted = false;

// One BG-music instance for the entire session. Created here, .play() is
// deferred to the first user gesture so the browser allows autoplay.
const bgMusic = new Audio('assets/sounds/BG_Music4.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.40;
bgMusic.playbackRate = 1.0;

// Let the VO module duck this track while voice lines are speaking.
setBgMusic(bgMusic);

// Pause the BG track when the tab goes inactive (switched away / minimized).
// Resume when it returns - but only if the player actually started the game,
// otherwise we'd hit the autoplay block.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        bgMusic.pause();
    } else if (bgMusic.currentTime > 0) {
        bgMusic.play().catch(e => console.log('BG resume blocked:', e));
    }
});

class GameApp {
    constructor() {
        this.init();
    }

    init() {
        console.log("Arcade Game Initialized - Phase 1");

        // Rotate-for-better-experience banner: visibility is controlled by
        // a media query in rotate-hint.css. The dismiss button just opts the
        // player out for the current session - rotation back to landscape
        // also hides it automatically (the @media rule stops matching).
        const rotateHint = document.getElementById('rotate-hint');
        const rotateClose = rotateHint && rotateHint.querySelector('.rotate-hint-close');
        if (rotateClose) {
            rotateClose.addEventListener('click', () => {
                rotateHint.classList.add('dismissed');
            });
        }

        const playBtn = document.getElementById('play-btn');
        const screen0 = document.getElementById('screen-0');

        if (playBtn && screen0) {
            playBtn.addEventListener('click', () => {
                const startSound = new Audio('assets/sounds/start.mp3');
                startSound.play().catch(e => console.log('Audio play failed:', e));

                // First user gesture: kick off the looping BG music. Subsequent
                // clicks (Play Again) call .play() on an already-playing element,
                // which is a no-op - the loop doesn't restart mid-track.
                bgMusic.play().catch(e => console.log('BG music blocked by autoplay:', e));

                screen0.classList.add('hidden');

                // The cinematic intro plays first, then startGame() boots the game.
                window.startGame = () => {
                    if (gameStarted) return;
                    gameStarted = true;
                    dragDrop.initDragDrop();
                };
                playLevelIntro(1, 36);
            });
        } else {
            // Fallback if screen 0 is missing
            dragDrop.initDragDrop();
        }
    }
}

// Bootstrap the application
document.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameApp();
});
