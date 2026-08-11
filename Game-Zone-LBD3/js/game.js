import { setupDragAndDrop } from './dragdrop.js';
import { playSound, playVO, stopVO, getVODuration } from './sounds.js';
import { onRoundStarted, resetInactivityTimer, stopGuide } from './guide.js';

const TARGET_AMOUNT = 42;

// Rounds: each one targets a different slot with its own allowed currency set.
const ROUNDS = [
    {
        slotNum: 1,
        target: TARGET_AMOUNT,
        allowed: ['coin-1', 'coin-2', 'coin-10', 'note-10'],
        instruction: `Make the amount <span class="highlight">₹${TARGET_AMOUNT}</span>`,
        autoStart: false, // user has to tap slot 1 to begin
    },
    {
        slotNum: 2,
        target: TARGET_AMOUNT,
        allowed: ['coin-2', 'coin-10', 'note-10'],
        instruction: `Make the amount <span class="highlight">₹${TARGET_AMOUNT}</span> again.`,
        autoStart: true,
    },
    {
        slotNum: 3,
        target: TARGET_AMOUNT,
        allowed: ['coin-1', 'coin-5', 'coin-20', 'note-20'],
        instruction: `Make the amount <span class="highlight">₹${TARGET_AMOUNT}</span> again.`,
        autoStart: true,
    },
];

const CURRENCY_DEFAULT_SRC = {
    'coin-1':  'assets/images/Money/One_Rupee_Default.webp',
    'coin-2':  'assets/images/Money/Two_Rupee_Default.webp',
    'coin-5':  'assets/images/Money/Five_Rupee_Default.webp',
    'coin-10': 'assets/images/Money/Ten_Rupee_Default.webp',
    'coin-20': 'assets/images/Money/Twenty_Rupee_Default.webp',
    'note-10': 'assets/images/Money/Ten_Rupee_Note_Default.webp',
    'note-20': 'assets/images/Money/Twenty_Rupee_Note_Default.webp',
};

const CURRENCY_LOCK_SRC = {
    'coin-1':  'assets/images/Money/One_Rupee_Lock.webp',
    'coin-2':  'assets/images/Money/Two_Rupee_Lock.webp',
    'coin-5':  'assets/images/Money/Five_Rupee_Lock.webp',
    'coin-10': 'assets/images/Money/Ten_Rupee_Lock.webp',
    'coin-20': 'assets/images/Money/Twenty_Rupee_Lock.webp',
    'note-10': 'assets/images/Money/Ten_Rupee_Note_Lock.webp',
    'note-20': 'assets/images/Money/Twenty_Rupee_Note_Lock.webp',
};

let currentRoundIndex = -1;

// ---- Instruction panel typewriter ----------------------------------------
// Reveals the instruction text character-by-character (no cursor). When a
// VO key is given, the reveal is paced to that line's audio duration so the
// text finishes exactly when the voice does; otherwise a default speed runs.
const DEFAULT_MS_PER_CHAR = 45;
let typeToken = 0;

function typeInstruction(html, voKey) {
    const el = document.getElementById('instruction-text');
    if (!el) return;

    const token = ++typeToken; // cancels any typing already in progress

    // Render the full markup (keeps the ₹42 highlight span), then blank out
    // every text node and reveal the characters progressively.
    el.innerHTML = html;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let totalChars = 0;
    while (walker.nextNode()) {
        const full = walker.currentNode.nodeValue;
        nodes.push({ node: walker.currentNode, full });
        totalChars += full.length;
    }
    if (totalChars === 0) return;
    nodes.forEach(n => { n.node.nodeValue = ''; });

    const voSeconds = voKey ? getVODuration(voKey) : 0;
    const duration = voSeconds > 0 ? voSeconds * 1000 : totalChars * DEFAULT_MS_PER_CHAR;
    const start = performance.now();

    const tick = now => {
        if (token !== typeToken) return; // superseded by a newer message
        const progress = Math.min((now - start) / duration, 1);
        let charsToShow = Math.floor(progress * totalChars);
        for (const n of nodes) {
            const take = Math.min(charsToShow, n.full.length);
            n.node.nodeValue = n.full.slice(0, take);
            charsToShow -= take;
        }
        if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

export function setupGameFlow() {
    startIdleState();

    // The slots start locked, so every coin/note should also start locked.
    // applyCurrencyLocks([]) marks them all as .locked and swaps to lock images.
    applyCurrencyLocks([]);

    // Single source of truth for CHECK clicks across every slot
    document.addEventListener('click', e => {
        if (e.target.closest('.check-btn')) onCheckClicked();
    });

    // Drag listeners get attached once; each round just updates which items are locked
    setupDragAndDrop({ onDrop: handleDrop });
}

function startIdleState() {
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.classList.add('lever-glow-active');
    }
    // Initial idle: locks are visible but dimmed (no pulse). The post-lever
    // pulse animation is still added by triggerReplayReset / stopReelAtZero.
}

function startRound(index) {
    const round = ROUNDS[index];
    if (!round) return;
    currentRoundIndex = index;

    const slot = document.querySelector(`.slot-${round.slotNum}`);
    if (!slot) return;

    // Stop any pulsing locks and reset panel light states
    document.querySelectorAll('.lock-icon').forEach(lock => lock.classList.remove('pulse-active'));
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.classList.remove('success-lights-active', 'failure-lights-active', 'jackpot-active');
        gameContainer.classList.add('game-started');
    }

    // Update borders and fills overlay classes
    document.querySelectorAll('.border-path, .slot-fill').forEach(el => {
        el.classList.remove('active', 'incorrect');
        if (el.classList.contains('correct')) {
            el.classList.add('completed-dim');
        }
    });

    const borderPath = document.querySelector(`.border-path-${round.slotNum}`);
    const fillPath = document.querySelector(`.slot-fill-${round.slotNum}`);
    if (borderPath) {
        borderPath.classList.remove('completed-dim');
        borderPath.classList.add('active');
    }
    if (fillPath) {
        fillPath.classList.remove('completed-dim');
        fillPath.classList.add('active');
    }

    // Activate this slot; disable the other slots
    document.querySelectorAll('.slot').forEach(other => {
        other.classList.remove('active');
        if (other === slot) return;
        if (other.classList.contains('correct')) {
            other.classList.add('completed-inactive');
            return;
        }
        other.classList.add('disabled');
    });

    slot.classList.remove('disabled', 'tappable', 'completed-inactive');
    slot.classList.add('active');

    // Lock currencies that aren't part of this round
    applyCurrencyLocks(round.allowed);

    // Trigger guide tutorial for the active slot
    onRoundStarted(round.slotNum);

    // VO: round-1 says "Make the amount ₹42", rounds 2–3 say the "again" variant.
    // After the line finishes, chain "Drag money here."
    const makeKey = (index === 0) ? 'makeAmount' : 'makeAmountAgain';
    // Clear any pulse left over from the previous round, then start it on THIS
    // slot's "DRAG MONEY HERE" the moment that voice-over begins. It keeps
    // pulsing until the label hides itself on the first drop (.has-drops).
    document.querySelectorAll('.drag-text.vo-pulse')
            .forEach(el => el.classList.remove('vo-pulse'));
    playVO(makeKey, () => {
        const dragText = slot.querySelector('.drag-text');
        if (dragText) dragText.classList.add('vo-pulse');
        playVO('dragMoney');
    });

    // Instruction text types out in sync with the VO line above
    typeInstruction(round.instruction, makeKey);
}

function applyCurrencyLocks(allowed) {
    document.querySelectorAll('.coin, .note').forEach(el => {
        const denom = [...el.classList].find(c => /^(coin|note)-\d+$/.test(c));
        if (!denom) return;
        // Tolerance counter resets every round — the previous slot's drops
        // shouldn't keep a tray item disabled.
        el.classList.remove('at-max');
        if (allowed.includes(denom)) {
            el.classList.remove('locked');
            const src = CURRENCY_DEFAULT_SRC[denom];
            if (src) el.src = src;
        } else {
            el.classList.add('locked');
            const src = CURRENCY_LOCK_SRC[denom];
            if (src) el.src = src;
        }
    });
}

// Drag listeners get attached once; each round just updates which items are locked
function handleDrop() {
    // CSS-driven: first drop adds .has-drops, revealing the CHECK button
}

function activeRoundSlot() {
    // The slot the player is currently dropping into — active, not yet checked
    return document.querySelector('.slot.active:not(.correct):not(.incorrect)');
}

function onCheckClicked() {
    const slot = activeRoundSlot();
    const instruction = document.getElementById('instruction-text');
    const round = ROUNDS[currentRoundIndex];
    if (!slot || !instruction || !round) return;

    // Stop guide immediately when check is clicked
    stopGuide();

    const sum = computeDroppedSum(slot);

    if (sum === round.target) {
        typeInstruction('Yay! That is correct.', 'correct');
        slot.classList.remove('active');
        slot.classList.add('correct');

        playSound('success');
        playVO('correct');

        // Update border and fill overlay paths to correct
        const borderPath = document.querySelector(`.border-path-${round.slotNum}`);
        const fillPath = document.querySelector(`.slot-fill-${round.slotNum}`);
        if (borderPath) {
            borderPath.classList.remove('active', 'incorrect');
            borderPath.classList.add('correct');
        }
        if (fillPath) {
            fillPath.classList.remove('active', 'incorrect');
            fillPath.classList.add('correct');
        }

        // Trigger success panel lights
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) {
            gameContainer.classList.add('success-lights-active');
        }

        // Spin the reel, then move on — but never before the success message
        // and its VO have fully finished (the reel takes ~3s; if the VO runs
        // longer, wait out the difference before the next round starts).
        const successStart = performance.now();
        const successVoMs = getVODuration('correct') * 1000;
        spinReel(round.slotNum, () => {
            const elapsed = performance.now() - successStart;
            const wait = Math.max(0, successVoMs + 200 - elapsed);
            setTimeout(() => {
                const nextIndex = currentRoundIndex + 1;
                if (ROUNDS[nextIndex]) {
                    startRound(nextIndex);
                } else {
                    // NOTE: the flipbook is NOT told we are finished here. Doing so
                    // shrank the game back into the book the instant the last round
                    // was solved — cutting off the jackpot celebration. The signal now
                    // fires at the END of that celebration (see triggerJackpotCelebration).
                    triggerJackpotCelebration(instruction);
                }
            }, wait);
        });
    } else {
        typeInstruction(`Oops! That’s incorrect`, 'incorrect');
        slot.classList.add('incorrect', 'shake-active');

        playSound('error');
        playVO('incorrect');

        // Trigger failure panel lights
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) {
            gameContainer.classList.add('failure-lights-active');
        }

        // Update border and fill overlay paths to incorrect
        const borderPath = document.querySelector(`.border-path-${round.slotNum}`);
        const fillPath = document.querySelector(`.slot-fill-${round.slotNum}`);
        if (borderPath) {
            borderPath.classList.remove('active');
            borderPath.classList.add('incorrect');
        }
        if (fillPath) {
            fillPath.classList.remove('active');
            fillPath.classList.add('incorrect');
        }

        // Hold the error state until the "Oops" VO has finished speaking
        // (never shorter than the original 1.5s red flash).
        const voMs = getVODuration('incorrect') * 1000;
        const resetDelay = Math.max(1500, voMs + 200);
        setTimeout(() => resetSlot(slot, instruction, round), resetDelay);
    }
}

function computeDroppedSum(slot) {
    let sum = 0;
    slot.querySelectorAll('.drop-stack img').forEach(el => {
        const denom = [...el.classList].find(c => /^(coin|note)-\d+$/.test(c));
        if (!denom) return;
        sum += parseInt(denom.split('-')[1], 10);
    });
    return sum;
}

function resetSlot(slot, instruction, round) {
    const dropZone = slot.querySelector('.dropped-items');
    if (dropZone) dropZone.innerHTML = '';
    slot.classList.remove('incorrect', 'has-drops', 'shake-active');
    typeInstruction(round.instruction); // no VO replay here — default typing speed

    // Slot is empty again — clear every tray tolerance lock so the player
    // can drop the round's coins/notes from scratch.
    document.querySelectorAll('.coin.at-max, .note.at-max').forEach(el => {
        el.classList.remove('at-max');
    });

    // Reset failure panel lights
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.classList.remove('failure-lights-active');
    }

    // Reset border and fill overlay paths back to active
    const borderPath = document.querySelector(`.border-path-${round.slotNum}`);
    const fillPath = document.querySelector(`.slot-fill-${round.slotNum}`);
    if (borderPath) {
        borderPath.classList.remove('incorrect');
        borderPath.classList.add('active');
    }
    if (fillPath) {
        fillPath.classList.remove('incorrect');
        fillPath.classList.add('active');
    }

    // Reset inactivity timer since the slot is empty and active again
    resetInactivityTimer();
}

function spinReel(slotNum, callback) {
    const strip = document.querySelector(`.slot-${slotNum} .reel-strip`);
    if (!strip) {
        if (callback) callback();
        return;
    }

    // Reset strip classes and style
    strip.className = 'reel-strip';
    strip.style.transform = 'translateY(0)';

    // Trigger reflow
    void strip.offsetWidth;

    // Start fast spin
    strip.classList.add('spinning');

    // Spin for 1.2 seconds, then ease to stop
    setTimeout(() => {
        strip.classList.remove('spinning');
        strip.classList.add('stopping');
        
        // Target index 5 (₹42) is exactly -62.5% of translation (5 / 8 * 100%)
        strip.style.transform = 'translateY(-62.5%)';

        // Wait for smooth stopping transition (1.8s) to complete
        setTimeout(() => {
            strip.classList.remove('stopping');
            if (callback) callback();
        }, 1800);
    }, 1200);
}

function stopReelStrip(strip) {
    if (!strip) return;
    strip.className = 'reel-strip stopping';
    strip.style.transform = 'translateY(-62.5%)';
    setTimeout(() => {
        strip.className = 'reel-strip';
    }, 1800);
}

function triggerJackpotCelebration(instruction) {
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.classList.remove('success-lights-active', 'failure-lights-active');
        gameContainer.classList.add('jackpot-active');
    }

    // The top instruction panel goes silent for the jackpot end screen —
    // all the messaging is in the falling popup over the slot row.
    // (Bump the type token so any in-flight typewriter stops writing.)
    typeToken++;
    if (instruction) {
        instruction.innerHTML = '';
    }

    playSound('leverPull');

    // All slots show final amounts and animate
    document.querySelectorAll('.slot').forEach(s => {
        s.classList.remove('completed-inactive', 'disabled', 'active');
        s.classList.add('jackpot-active');
    });

    document.querySelectorAll('.border-path, .slot-fill').forEach(el => {
        el.classList.remove('completed-dim', 'active', 'incorrect');
        el.classList.add('jackpot-active');
    });

    // Spin all three reels in parallel!
    const strips = [
        document.querySelector('.slot-1 .reel-strip'),
        document.querySelector('.slot-2 .reel-strip'),
        document.querySelector('.slot-3 .reel-strip')
    ];

    strips.forEach(strip => {
        if (!strip) return;
        strip.className = 'reel-strip spinning';
        strip.style.transform = 'translateY(0)';
    });

    // Stop Reel 1 after 1.2 seconds
    setTimeout(() => {
        stopReelStrip(strips[0]);
    }, 1200);

    // Stop Reel 2 after 2.0 seconds
    setTimeout(() => {
        stopReelStrip(strips[1]);
    }, 2000);

    // Stop Reel 3 after 2.8 seconds
    setTimeout(() => {
        stopReelStrip(strips[2]);
    }, 2800);

    // Once all reels have stopped (2.8s + 1.8s = 4.6s), fade the ₹42 reels out
    // and celebrate with the falling popup + confetti.
    setTimeout(() => {
        if (gameContainer) gameContainer.classList.add('jackpot-settled');
        launchConfetti();
        showJackpotPopup();
        playVO('jackpot');
    }, 4600);

    // After "You have hit the JACKPOT" has been on screen for 5s, tell the flipbook
    // we are done and — WHEN RUNNING STANDALONE — swap the popup's text to the replay
    // prompt (the popup itself stays visible either way). The top panel is
    // intentionally left alone (no "Tap lever. Play Again!" at the top).
    setTimeout(() => {
        const embedded = window.parent !== window;

        // FINISHED — the jackpot celebration has run its full course (reels, confetti,
        // "You have hit the JACKPOT" and its voice-over). Only now is the flipbook told,
        // so the game stays full screen throughout the celebration instead of shrinking
        // away the moment the last round was solved.
        try {
            if (embedded) {
                window.parent.postMessage({ source: 'lbd', type: 'lbd-complete' }, '*');
            }
        } catch (_) {}

        // The "Tap lever / Play Again" prompt is STANDALONE-ONLY. Inside the book the
        // reader stays on this page and turns it themselves, so inviting another spin
        // here would loop them back into the activity instead of on with the story —
        // the popup keeps "You have hit the JACKPOT" as the end screen.
        if (embedded) return;

        swapJackpotPopupToReplay();
        if (gameContainer) {
            gameContainer.classList.add('lever-glow-active');
        }
        playVO('tapLever');
    }, 4600 + 5000);
}

function swapJackpotPopupToReplay() {
    const title = document.querySelector('.jackpot-popup .jackpot-popup-title');
    if (!title) return;
    title.style.opacity = '0';
    setTimeout(() => {
        title.innerHTML = 'Tap lever.<br><span class="jackpot-word">Play Again!</span>';
        title.style.opacity = '';
    }, 300);
}

function launchConfetti() {
    const container = document.querySelector('.confetti-container');
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#FFC822', '#FF6B6B', '#4ECDC4', '#95E1D3', '#F38181', '#AA96DA', '#FCBAD3', '#79F01D'];
    const pieceCount = 120;

    for (let i = 0; i < pieceCount; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        const color = colors[Math.floor(Math.random() * colors.length)];
        const startLeft = Math.random() * 100;
        const drift = (Math.random() - 0.5) * 400;
        const spin = (Math.random() * 6 - 3) * 360;
        const delay = Math.random() * 1.5;
        const duration = 3 + Math.random() * 2.5;
        const widthPx = 8 + Math.random() * 8;
        const heightPx = 12 + Math.random() * 12;
        piece.style.backgroundColor = color;
        piece.style.left = `${startLeft}vw`;
        piece.style.width = `${widthPx}px`;
        piece.style.height = `${heightPx}px`;
        piece.style.setProperty('--drift', `${drift}px`);
        piece.style.setProperty('--spin', `${spin}deg`);
        piece.style.animationDelay = `${delay}s`;
        piece.style.animationDuration = `${duration}s`;
        container.appendChild(piece);
    }

    // Clean up the confetti DOM once all pieces have finished falling
    setTimeout(() => { container.innerHTML = ''; }, 6500);
}

function showJackpotPopup() {
    const popup = document.querySelector('.jackpot-popup');
    if (popup) popup.classList.add('visible');
}

function hideJackpotPopup() {
    const popup = document.querySelector('.jackpot-popup');
    if (!popup) return;
    popup.classList.remove('visible');
    // Reset the title back to the original message so the next celebration starts clean
    const title = popup.querySelector('.jackpot-popup-title');
    if (title) {
        title.innerHTML = 'You have hit the<br><span class="jackpot-word">JACKPOT</span>.';
        title.style.opacity = '';
    }
}

export function triggerReplayReset() {
    const gameContainer = document.querySelector('.game-container');
    const instruction = document.getElementById('instruction-text');
    if (!gameContainer || !instruction) return;

    // Stop guide + any in-flight VO so replay starts clean
    stopGuide();
    stopVO();

    // Clear the jackpot popup (resets its title for the next celebration too)
    hideJackpotPopup();

    // Re-lock every coin/note while the reels spin — they stay locked until
    // slot 1's unlock animation completes and startRound(0) frees the allowed set.
    applyCurrencyLocks([]);

    // Panel stays blank through the spin — the round text appears (typed,
    // in sync with its VO) only when startRound(0) fires after the reels stop.
    typeToken++; // cancel any in-flight typewriter
    instruction.innerHTML = '';

    // 1. Cyan chasing lights
    gameContainer.classList.remove('success-lights-active', 'failure-lights-active', 'jackpot-active', 'jackpot-settled', 'game-started');
    gameContainer.classList.add('lever-pulled-active');

    // 2. Spin all reels in parallel
    const strips = [
        document.querySelector('.slot-1 .reel-strip'),
        document.querySelector('.slot-2 .reel-strip'),
        document.querySelector('.slot-3 .reel-strip')
    ];

    strips.forEach(strip => {
        if (!strip) return;
        strip.className = 'reel-strip spinning';
        strip.style.transform = 'translateY(0)';
    });

    // Reset all borders/fills classes (without wiping unique index classes like border-path-1)
    document.querySelectorAll('.border-path, .slot-fill').forEach(el => {
        el.classList.remove('active', 'correct', 'incorrect', 'completed-dim', 'jackpot-active');
    });

    // Reset all slot classes to locked immediately (so their lock icons show and pulse during the spin)
    document.querySelectorAll('.slot').forEach(s => {
        const slotNumClass = [...s.classList].find(c => /^slot-\d+$/.test(c));
        s.className = 'slot ' + slotNumClass + ' locked';
        const dropZone = s.querySelector('.dropped-items');
        if (dropZone) dropZone.innerHTML = '';
        s.classList.remove('has-drops', 'shake-active', 'correct', 'incorrect');
        
        const lock = s.querySelector('.lock-icon');
        if (lock) {
            lock.classList.add('pulse-active');
        }
    });

    // 3. Stop them one by one!
    
    // Stop Reel 1 after 1.0 seconds
    setTimeout(() => {
        stopReelAtZero(strips[0], 1);
    }, 1000);

    // Stop Reel 2 after 1.6 seconds
    setTimeout(() => {
        stopReelAtZero(strips[1], 2);
    }, 1600);

    // Stop Reel 3 after 2.2 seconds
    setTimeout(() => {
        stopReelAtZero(strips[2], 3);
    }, 2200);

    // 4. After Reel 3 stops (2.2s + 1.8s transition = 4.0s), the locks keep
    //    pulsing for 3s, then the first lock smoothly opens before Round 0 starts.
    setTimeout(() => {
        gameContainer.classList.remove('lever-pulled-active');

        setTimeout(() => {
            unlockFirstSlotThenStart();
        }, 3000);
    }, 4000);
}

function unlockFirstSlotThenStart() {
    const slot1 = document.querySelector('.slot-1');
    const lock = slot1 ? slot1.querySelector('.lock-icon') : null;
    if (!lock) {
        startRound(0);
        return;
    }

    // Swap the pulsing loop for the one-shot unlock animation
    lock.classList.remove('pulse-active');
    lock.classList.add('unlocking');

    // Once the lock has popped away (0.8s), activate the slot
    setTimeout(() => {
        lock.classList.remove('unlocking');
        startRound(0);
    }, 800);
}

function stopReelAtZero(strip, slotNum) {
    if (!strip) return;
    strip.className = 'reel-strip';
    strip.style.transform = 'translateY(0)';

    // Ensure the slot shows its lock icon and remains disabled/locked
    const slot = document.querySelector(`.slot-${slotNum}`);
    if (slot) {
        slot.className = `slot slot-${slotNum} locked disabled`;
        const lock = slot.querySelector('.lock-icon');
        if (lock) {
            lock.classList.add('pulse-active');
        }
    }
}
