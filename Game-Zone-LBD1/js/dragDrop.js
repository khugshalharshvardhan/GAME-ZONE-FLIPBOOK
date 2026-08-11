import { triggerSuccessAnimation } from './ticketBurst.js';
import { playLevelIntro } from './level-intro.js';
import { playVO, playLevelVO, voDurationMs } from './vo.js';

export function initDragDrop() {
    const moneyItems = document.querySelectorAll('.money-item');
    const dropzoneArea = document.getElementById('dropzone');
    const dropzoneBg = document.getElementById('dropzone-bg');
    const dropzoneContainer = document.querySelector('.dropzone-container');
    const moneyTray = document.querySelector('.money-tray');
    const checkBtn = document.getElementById('check-btn');
    const questionContent = document.querySelector('.question-content');
    const confetti = document.getElementById('confetti');
    const dropzoneText = document.getElementById('dropzone-text');
    
    const sounds = {
        drop: new Audio('assets/sounds/drop.mp3'),
        note: new Audio('assets/sounds/note.mp3'),
        click: new Audio('assets/sounds/click.mp3'),
        error: new Audio('assets/sounds/error3.mp3'),
        success: new Audio('assets/sounds/success1.mp3') // Used success1.mp3 based on folder contents
    };
    // SFX sit just under the voice-overs in the mix — VO stays at full
    // volume, SFX slightly below, BG music (main.js) lowest.
    const SFX_VOLUME = 0.8;
    Object.values(sounds).forEach(s => { s.volume = SFX_VOLUME; });

    function playSound(name) {
        if (sounds[name]) {
            sounds[name].currentTime = 0;
            sounds[name].play().catch(e => console.log('Audio error:', e));
        }
    }
    
    let currentLevel = 1;
    let targetAmount = 12;
    let requiredItemValue = '2';
    let requiredItemType = 'coin'; // 'coin' or 'note' — drives error message wording
    let mixedDenoms = false; // level 3: both coin AND note work → type-neutral wording
    let requiredCount = 6;
    // Per-denomination + per-type caps in the dropzone. Each unlocked tray
    // item respects its own cap independently — e.g. on Level 3 (₹10), both
    // the ₹10 coin and ₹10 note unlock (they share data-value), and each
    // caps at 5 items.
    const MAX_PER_COIN = 10;
    const MAX_PER_NOTE = 5;
    // Per-(type, value) overrides. ₹10 coin matches the ₹10 note's cap so
    // Level 3 stays balanced — 5 of either or any mix totalling 5.
    const CAP_OVERRIDES = {
        coin: { '10': 5 },
        note: {},
    };
    const capFor = (type, value) => {
        const override = CAP_OVERRIDES[type]?.[value];
        if (override !== undefined) return override;
        return type === 'note' ? MAX_PER_NOTE : MAX_PER_COIN;
    };
    let questionHTML = '<p>Use <span class="highlight">₹2 coins</span> to make <span class="highlight">₹12</span>.</p>';
    // True between a successful Check and the next level loading — blocks drag/drop
    // so the celebration + cinematic intro can't be interrupted.
    let levelLocked = false;

    // --- Instruction-panel typewriter ---
    // Every write to the question panel goes through setQuestion(). With
    // animate=true the text types in character by character (highlight
    // spans and inline colors are preserved — we type into the text nodes,
    // not the markup). Instant writes cancel any in-flight typing, except
    // when re-writing the exact HTML that is currently being typed (the
    // frequent "reset to question" calls must not stutter the animation).
    // When a VO duration is passed (syncMs), the per-character interval is
    // derived from it so the text finishes typing right as the voice-over
    // finishes speaking. Without one, a fixed 35ms/char cadence is used.
    const TYPE_SPEED_MS = 35;
    const TYPE_SPEED_MIN_MS = 15;
    const TYPE_SPEED_MAX_MS = 90;
    let typeTimer = null;
    let typingHTML = null;

    function setQuestion(html, animate = false, syncMs = null) {
        if (!animate) {
            if (typingHTML === html) return; // already typing this — let it finish
            clearInterval(typeTimer);
            typingHTML = null;
            questionContent.innerHTML = html;
            return;
        }

        clearInterval(typeTimer);
        typingHTML = html;
        questionContent.innerHTML = html;

        const root = questionContent.firstElementChild || questionContent;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        const full = nodes.map(n => n.nodeValue);
        nodes.forEach(n => { n.nodeValue = ''; });
        root.classList.add('typing');

        const totalChars = full.reduce((sum, t) => sum + t.length, 0);
        let speed = TYPE_SPEED_MS;
        if (syncMs && totalChars > 0) {
            // Aim to land slightly before the VO ends, clamped to sane bounds.
            speed = Math.min(TYPE_SPEED_MAX_MS,
                     Math.max(TYPE_SPEED_MIN_MS, (syncMs * 0.9) / totalChars));
        }

        let i = 0, j = 0;
        typeTimer = setInterval(() => {
            while (i < nodes.length && j >= full[i].length) { i++; j = 0; }
            if (i >= nodes.length) {
                clearInterval(typeTimer);
                typingHTML = null;
                root.classList.remove('typing');
                return;
            }
            nodes[i].nodeValue += full[i][j++];
        }, speed);
    }

    function loadLevel(level) {
        currentLevel = level;
        levelLocked = false;
        const dynamicNote = document.getElementById('dynamic-note');
        
        if (level === 1) {
            targetAmount = 12;
            requiredItemValue = '2';
            requiredCount = 6;
            document.querySelector('.target-amount').textContent = '₹12';
        } else if (level === 2) {
            targetAmount = 25;
            requiredItemValue = '5';
            requiredCount = 5;
            document.querySelector('.target-amount').textContent = '₹25';
        } else if (level === 3) {
            targetAmount = 50;
            requiredItemValue = '10';
            requiredCount = 5;
            document.querySelector('.target-amount').textContent = '₹50';
        } else if (level === 4) {
            targetAmount = 100;
            requiredItemValue = '50';
            requiredCount = 2;
            document.querySelector('.target-amount').textContent = '₹100';
        }

        // Level 4 uses the ₹50 note; every other level uses coins.
        requiredItemType = (level === 4) ? 'note' : 'coin';
        // Level 3 accepts BOTH the ₹10 coin and the ₹10 note, so its
        // question and error messages must not name an item type.
        mixedDenoms = (level === 3);

        // Build the question dynamically with proper pluralization. If a future
        // level ever requires exactly one item, we'll correctly say "coin" / "note"
        // instead of "coins" / "notes". Mixed levels drop the type word entirely:
        // "Use ₹10 to make ₹50."
        const itemLabel = requiredCount === 1 ? requiredItemType : `${requiredItemType}s`;
        questionHTML = mixedDenoms
            ? `<p>Use <span class="highlight">₹${requiredItemValue}</span> to make <span class="highlight">₹${targetAmount}</span>.</p>`
            : `<p>Use <span class="highlight">₹${requiredItemValue} ${itemLabel}</span> to make <span class="highlight">₹${targetAmount}</span>.</p>`;


        // Dynamically swap the second note
        if (level === 4) {
            dynamicNote.setAttribute('data-value', '50');
            dynamicNote.querySelector('img').src = 'assets/images/Money/Fifty_Rupee_Note_Default.webp';
            dynamicNote.querySelector('img').alt = '₹50 Note';
        } else {
            dynamicNote.setAttribute('data-value', '20');
            dynamicNote.querySelector('img').src = 'assets/images/Money/Twenty_Rupee_Note_Default.webp';
            dynamicNote.querySelector('img').alt = '₹20 Note';
        }
        
        // Keep the panel EMPTY while the cinematic intro runs — the overlay
        // fades out at its end, and any text set here would flash fully
        // formed during that fade, then visibly re-type. The typewriter run
        // fires when the intro resolves (see checkBtn handler / main.js).
        setQuestion('');

        // Lock every tray item except the one this level requires. The dynamic
        // note has already been re-tagged above, so its data-value is current.
        applyLockState();

        resetGame(true); // soft reset
    }

    // Swap each tray item between its X_Rupee_Default.webp and X_Rupee_Lock.webp
    // sibling based on whether its data-value matches the current
    // requiredItemValue. Locked items also get a .locked class so the drag
    // handlers can refuse them and CSS can show cursor: not-allowed.
    // Also clears any stale .disabled state from a previous level.
    function applyLockState() {
        document.querySelectorAll('.money-item').forEach(item => {
            const img = item.querySelector('img');
            if (!img) return;
            const isRequired = item.getAttribute('data-value') === requiredItemValue;
            item.classList.toggle('locked', !isRequired);
            item.classList.remove('disabled');
            img.draggable = isRequired;
            // Replace whichever variant is currently shown (_Default / _Lock / _Glow).
            img.src = img.src.replace(/_(Default|Lock|Glow)\.webp/, isRequired ? '_Default.webp' : '_Lock.webp');
        });
    }

    // Count how many dropped coins of an exact denomination + type are in
    // the dropzone right now.
    function countDroppedFor(value, type) {
        return dropzoneArea.querySelectorAll(
            `.dropped-coin.${type}[data-value="${value}"]`
        ).length;
    }

    // For every unlocked tray item, count its dropped siblings and toggle
    // .disabled when it hits its own cap. Independent across types, so
    // hitting the ₹10 coin cap doesn't disable the ₹10 note (or vice versa).
    function updateLimitState() {
        document.querySelectorAll('.money-item:not(.locked)').forEach(item => {
            const value = item.getAttribute('data-value');
            const type  = item.classList.contains('note') ? 'note' : 'coin';
            const atMax = countDroppedFor(value, type) >= capFor(type, value);
            item.classList.toggle('disabled', atMax);
            const img = item.querySelector('img');
            if (img) img.draggable = !atMax;
        });
    }
    
    // --- Ghost Coin Hint Logic ---
    // Level 1 plays a 3x ghost-coin tutorial 5s after the level becomes playable.
    // Across all levels, 15s of user inactivity replays the ghost animation.
    // A drag attempt cancels the pending tutorial and resets the idle clock.
    const TUTORIAL_START_DELAY = 5000;
    const TUTORIAL_REPEATS = 3;
    const TUTORIAL_INTERVAL = 2800;
    const IDLE_THRESHOLD = 15000;
    const GHOST_ANIM_DURATION = 2400;
    const transitionOverlayEl = document.getElementById('level-transition-overlay');

    let ghostHintActive = false;
    let tutorialPlayed = false;
    let tutorialTimers = [];
    let idleTimer = null;
    let userDragged = false;
    let activeGhostEl = null;
    let activeGhostCancelOnActivity = false;
    let activeGhostTimeout = null;
    let returnHintTimers = [];
    let returnHintArmed = false;   // once armed, any user activity cancels the hint
    let returnHintArmTimer = null;
    // First "remove a coin" hint waits out the 500ms error shake before playing.
    const RETURN_HINT_START_DELAY = 700;

    function playGhostCoinAnimation(fromIdle = false) {
        if (ghostHintActive) return;
        if (dropzoneBg.classList.contains('success-glow')) return;
        if (dropzoneContainer.classList.contains('shake')) return;

        // Use the denomination the current level actually requires, so the
        // hint shows the kid exactly which coin/note to drag.
        const sourceCoin = document.querySelector(`.money-item[data-value="${requiredItemValue}"]:not(.dropped-coin)`);
        if (!sourceCoin) return;
        // If the cap is already hit, don't suggest dragging more in — the
        // user needs to remove coins instead. The "too many" return hint
        // (playGhostReturnAnimation) handles that flow separately.
        if (sourceCoin.classList.contains('disabled')) return;

        ghostHintActive = true;
        const ghost = document.createElement('img');
        ghost.src = sourceCoin.querySelector('img').src;
        ghost.className = 'ghost-coin-tutorial';

        const rect = sourceCoin.getBoundingClientRect();
        const gameContainer = document.querySelector('.game-container').getBoundingClientRect();
        const dropzoneRect = document.querySelector('.dropzone-container').getBoundingClientRect();

        const startX = ((rect.left - gameContainer.left) / gameContainer.width) * 100;
        const startY = ((rect.top - gameContainer.top) / gameContainer.height) * 100;

        const tx = (dropzoneRect.left + dropzoneRect.width / 2) - (rect.left + rect.width / 2);
        const ty = (dropzoneRect.top + dropzoneRect.height / 2) - (rect.top + rect.height / 2);

        ghost.style.left = `${startX + 1}%`;
        ghost.style.top = `${startY + 2}%`;
        ghost.style.setProperty('--nudge-tx', `${tx}px`);
        ghost.style.setProperty('--nudge-ty', `${ty}px`);

        document.querySelector('.game-container').appendChild(ghost);

        activeGhostEl = ghost;
        activeGhostCancelOnActivity = fromIdle;
        activeGhostTimeout = setTimeout(() => {
            if (ghost.parentElement) ghost.remove();
            ghostHintActive = false;
            if (activeGhostEl === ghost) {
                activeGhostEl = null;
                activeGhostCancelOnActivity = false;
                activeGhostTimeout = null;
            }
        }, GHOST_ANIM_DURATION);
    }

    function stopActiveGhost() {
        if (!activeGhostEl) return;
        clearTimeout(activeGhostTimeout);
        if (activeGhostEl.parentElement) activeGhostEl.remove();
        activeGhostEl = null;
        activeGhostCancelOnActivity = false;
        activeGhostTimeout = null;
        ghostHintActive = false;
    }

    // Reverse of playGhostCoinAnimation: a ghost coin drags from a dropped coin
    // in the dropzone back to its slot in the tray — shows the kid how to remove
    // a coin when there are too many.
    function playGhostReturnAnimation() {
        if (ghostHintActive) return;
        if (dropzoneBg.classList.contains('success-glow')) return;
        if (dropzoneContainer.classList.contains('shake')) return;

        const droppedCoins = dropzoneArea.querySelectorAll('.dropped-coin');
        if (droppedCoins.length === 0) return;
        const sourceCoin = droppedCoins[droppedCoins.length - 1]; // the most recent one
        const trayCoin = document.querySelector(`.money-item[data-value="${requiredItemValue}"]:not(.dropped-coin)`);
        if (!trayCoin) return;

        ghostHintActive = true;
        const ghost = document.createElement('img');
        ghost.src = sourceCoin.querySelector('img').src;
        ghost.className = 'ghost-coin-tutorial';

        const rect = sourceCoin.getBoundingClientRect();
        const gameContainer = document.querySelector('.game-container').getBoundingClientRect();
        const trayRect = trayCoin.getBoundingClientRect();

        const startX = ((rect.left - gameContainer.left) / gameContainer.width) * 100;
        const startY = ((rect.top - gameContainer.top) / gameContainer.height) * 100;

        const tx = (trayRect.left + trayRect.width / 2) - (rect.left + rect.width / 2);
        const ty = (trayRect.top + trayRect.height / 2) - (rect.top + rect.height / 2);

        ghost.style.left = `${startX}%`;
        ghost.style.top = `${startY}%`;
        ghost.style.setProperty('--nudge-tx', `${tx}px`);
        ghost.style.setProperty('--nudge-ty', `${ty}px`);

        document.querySelector('.game-container').appendChild(ghost);

        activeGhostEl = ghost;
        activeGhostCancelOnActivity = true; // like idle hints, any activity kills it
        activeGhostTimeout = setTimeout(() => {
            if (ghost.parentElement) ghost.remove();
            ghostHintActive = false;
            if (activeGhostEl === ghost) {
                activeGhostEl = null;
                activeGhostCancelOnActivity = false;
                activeGhostTimeout = null;
            }
        }, GHOST_ANIM_DURATION);
    }

    function cancelReturnHint() {
        returnHintTimers.forEach(clearTimeout);
        returnHintTimers = [];
        clearTimeout(returnHintArmTimer);
        returnHintArmTimer = null;
        returnHintArmed = false;
    }

    // Play the "drag a coin back to the tray" hint TUTORIAL_REPEATS times.
    // Stops early if the player removes enough coins or starts dragging.
    function startReturnHint() {
        cancelReturnHint();
        // Arm on the next tick so the Check click that triggered this hint
        // (its own click/mouse event) doesn't immediately cancel it.
        returnHintArmTimer = setTimeout(() => { returnHintArmed = true; }, 0);
        for (let i = 0; i < TUTORIAL_REPEATS; i++) {
            const delay = RETURN_HINT_START_DELAY + i * TUTORIAL_INTERVAL;
            const timer = setTimeout(() => {
                if (droppedCoinsCount <= requiredCount) {
                    cancelReturnHint();
                    return;
                }
                playGhostReturnAnimation();
            }, delay);
            returnHintTimers.push(timer);
        }
    }

    function cancelTutorialTimers() {
        tutorialTimers.forEach(clearTimeout);
        tutorialTimers = [];
    }

    function startLevel1Tutorial() {
        if (tutorialPlayed || userDragged) return;
        tutorialPlayed = true;

        for (let i = 0; i < TUTORIAL_REPEATS; i++) {
            const delay = TUTORIAL_START_DELAY + i * TUTORIAL_INTERVAL;
            const timer = setTimeout(() => {
                if (userDragged) {
                    cancelTutorialTimers();
                    return;
                }
                playGhostCoinAnimation();
                resetIdleTimer();
            }, delay);
            tutorialTimers.push(timer);
        }
    }

    function tryShowIdleHint() {
        const transitionVisible = !transitionOverlayEl.classList.contains('hidden');
        if (transitionVisible ||
            dropzoneBg.classList.contains('success-glow') ||
            dropzoneContainer.classList.contains('shake')) {
            idleTimer = setTimeout(tryShowIdleHint, 1000);
            return;
        }
        if (ghostHintActive) {
            idleTimer = setTimeout(tryShowIdleHint, 500);
            return;
        }
        playGhostCoinAnimation(true);
        // Once the 10s threshold trips, the hint loops back-to-back at the
        // animation cadence. Any user activity calls resetIdleTimer which
        // clears this and restarts the 10s wait from scratch.
        idleTimer = setTimeout(tryShowIdleHint, TUTORIAL_INTERVAL);
    }

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(tryShowIdleHint, IDLE_THRESHOLD);
    }

    function onUserDragAttempt() {
        // A real drag means the user knows what to do — kill anything in flight,
        // including a tutorial ghost mid-animation.
        userDragged = true;
        cancelTutorialTimers();
        cancelReturnHint();
        stopActiveGhost();
        resetIdleTimer();
    }

    function onUserActivity() {
        // Generic input (mouse move, touch, click) cancels the idle ghost loop
        // and the "remove a coin" hint, but lets a tutorial ghost finish.
        if (activeGhostCancelOnActivity) stopActiveGhost();
        if (returnHintArmed) cancelReturnHint();
        resetIdleTimer();
    }

    ['mousedown', 'mousemove', 'touchstart', 'touchmove', 'click'].forEach(evt => {
        window.addEventListener(evt, onUserActivity, { passive: true });
    });
    // ------------------------------
    
    let draggedItemValue = null;
    let draggedItemOrigin = null;
    let draggedItemType = null;
    let draggedItemSrc = null;
    
    moneyItems.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        
        // Touch events
        item.addEventListener('touchstart', handleTouchStart, {passive: false});
        item.addEventListener('touchmove', handleTouchMove, {passive: false});
        item.addEventListener('touchend', handleTouchEnd);
        item.addEventListener('touchcancel', handleTouchEnd);
    });

    function handleDragStart(e) {
        if (levelLocked) {
            e.preventDefault();
            return;
        }
        const item = e.currentTarget;
        // Locked tray items (wrong denomination for this level) and disabled
        // ones (per-denomination cap reached) both refuse drag.
        // Dropped-coins in the dropzone never carry either class, so they
        // can still be returned to the tray.
        if (item.classList.contains('locked') || item.classList.contains('disabled')) {
            e.preventDefault();
            return;
        }
        onUserDragAttempt();
        draggedItemValue = item.getAttribute('data-value');
        draggedItemType = item.classList.contains('note') ? 'note' : 'coin';
        
        if (item.classList.contains('dropped-coin')) {
            draggedItemOrigin = item;
        } else {
            draggedItemOrigin = null; // Came from tray
        }
        
        const img = item.querySelector('img');
        const originalSrc = img.src;
        draggedItemSrc = originalSrc;
        if (!item.classList.contains('dropped-coin')) {
            img.setAttribute('data-original', originalSrc);
            img.src = originalSrc.replace('_Default', '_Glow');
        }
        
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = item.classList.contains('dropped-coin') ? 'move' : 'copy';
            e.dataTransfer.setData('text/plain', draggedItemValue);
        }
    }

    function handleDragEnd(e) {
        const item = e.currentTarget;
        const img = item.querySelector('img');
        if (img && img.getAttribute('data-original')) {
            img.src = img.getAttribute('data-original');
        }
        if (item.classList.contains('dropped-coin')) {
            draggedItemOrigin = null;
        }
        updateDropzoneBackground();
    }

    // --- Touch Logic ---
    let touchClone = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;

    function handleTouchStart(e) {
        if (levelLocked) {
            e.preventDefault();
            return;
        }
        const item = e.currentTarget;
        if (item.classList.contains('locked') || item.classList.contains('disabled')) {
            e.preventDefault();
            return;
        }
        if (e.targetTouches.length !== 1) return;
        
        const touch = e.targetTouches[0];
        const rect = item.getBoundingClientRect();
        
        touchOffsetX = touch.clientX - rect.left;
        touchOffsetY = touch.clientY - rect.top;
        
        handleDragStart(e);
        
        touchClone = item.cloneNode(true);
        touchClone.style.position = 'fixed';
        touchClone.style.left = `${rect.left}px`;
        touchClone.style.top = `${rect.top}px`;
        touchClone.style.width = `${rect.width}px`;
        touchClone.style.height = `${rect.height}px`;
        touchClone.style.opacity = '0.8';
        touchClone.style.pointerEvents = 'none';
        touchClone.style.zIndex = '9999';
        
        document.body.appendChild(touchClone);
        
        if (droppedCoinsCount === 0 && !draggedItemOrigin) {
            dropzoneBg.classList.add('is-glow');
        }
        
        // Prevent default only after we setup the clone, to prevent scrolling while dragging
        e.preventDefault();
    }

    function handleTouchMove(e) {
        if (!touchClone) return;
        e.preventDefault(); // Stop scrolling
        const touch = e.targetTouches[0];
        touchClone.style.left = `${touch.clientX - touchOffsetX}px`;
        touchClone.style.top = `${touch.clientY - touchOffsetY}px`;
    }

    function handleTouchEnd(e) {
        if (!touchClone) return;
        const item = e.currentTarget;
        const touch = e.changedTouches[0];
        
        touchClone.remove();
        touchClone = null;
        
        const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        const isDropzone = dropTarget && (dropTarget.closest('.dropzone-container') || dropTarget.id === 'dropzone');
        const isTray = dropTarget && dropTarget.closest('.money-tray');
        
        if (isDropzone) {
            handleDropInDropzone();
        } else if (isTray) {
            handleDropInTray();
        }
        
        // Fire handleDragEnd AFTER drop logic to simulate correct HTML5 drag lifecycle
        // This ensures draggedItemOrigin is not nullified before handleDropInDropzone needs it
        handleDragEnd(e);
        
        updateDropzoneBackground();
    }
    
    function updateDropzoneBackground() {
        if (dropzoneContainer.classList.contains('shake')) return; // Don't override error state
        if (dropzoneContainer.classList.contains('success-pop')) return; // Don't override success animation
        
        // Remove specialized glows
        dropzoneBg.classList.remove('success-glow', 'error-glow');
        
        if (droppedCoinsCount > 0) {
            checkBtn.classList.remove('hidden');
            dropzoneText.classList.add('hidden'); // Hide text when items are inside
        } else {
            checkBtn.classList.add('hidden');
            setQuestion(questionHTML);
            dropzoneText.classList.remove('hidden'); // Show text when empty
        }

        if (droppedCoinsCount === 0) {
            dropzoneBg.classList.remove('is-glow');
        } else {
            dropzoneBg.classList.add('is-glow');
        }
    }

    dropzoneContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (droppedCoinsCount === 0 && !draggedItemOrigin) {
            dropzoneBg.classList.add('is-glow');
        }
    });
    
    dropzoneContainer.addEventListener('dragleave', (e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        updateDropzoneBackground();
    });
    
    let droppedCoinsCount = 0;
    
    dropzoneContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        handleDropInDropzone();
    });

    function handleDropInDropzone() {
        if (levelLocked) return;
        if (draggedItemOrigin) {
            // Dragged within dropzone, do nothing
            return;
        }

        if (draggedItemValue === requiredItemValue) {
            // Refuse the drop if this exact denomination+type is already at
            // its cap. The tray item will have .disabled by this point, but a
            // tiny race (queued dragend) could still reach here — bail safely.
            if (countDroppedFor(draggedItemValue, draggedItemType) >= capFor(draggedItemType, draggedItemValue)) {
                return;
            }

            // Success dropping required item

            // Play the material drop sound
            if (draggedItemType === 'note') {
                playSound('note');
            } else {
                playSound('drop');
            }

            droppedCoinsCount++;
            setQuestion(questionHTML); // Reset any previous error text
            updateDropzoneBackground();
            
            const newCoin = document.createElement('div');
            newCoin.className = `dropped-coin ${draggedItemType === 'note' ? 'note' : 'coin'}`;
            newCoin.draggable = true;
            newCoin.setAttribute('data-value', draggedItemValue); // Required for dragging back
            
            // Add mouse drag events for returning to tray
            newCoin.addEventListener('dragstart', handleDragStart);
            newCoin.addEventListener('dragend', handleDragEnd);
            
            // Add touch events for returning to tray
            newCoin.addEventListener('touchstart', handleTouchStart, {passive: false});
            newCoin.addEventListener('touchmove', handleTouchMove, {passive: false});
            newCoin.addEventListener('touchend', handleTouchEnd);
            newCoin.addEventListener('touchcancel', handleTouchEnd);
            
            const coinImg = document.createElement('img');
            // If the src contains _Glow from the tray, use _Default for the dropped version
            coinImg.src = draggedItemSrc ? draggedItemSrc.replace('_Glow', '_Default') : '';
            newCoin.appendChild(coinImg);

            // Stack with existing same-denomination + same-type siblings,
            // regardless of drop order. Example: drop coin, coin, note, coin
            // → DOM ends up [coin, coin, coin, note], not [coin, coin, note, coin].
            // This also keeps the deck-of-cards overlap rules (.coin + .coin,
            // .note + .note) intact, since matching neighbours stay adjacent.
            const existingSameType = dropzoneArea.querySelectorAll(
                `.dropped-coin.${draggedItemType}[data-value="${draggedItemValue}"]`
            );
            const lastSameType = existingSameType[existingSameType.length - 1];
            if (lastSameType) {
                lastSameType.insertAdjacentElement('afterend', newCoin);
            } else {
                dropzoneArea.appendChild(newCoin);
            }
            updateDropzoneLayout(droppedCoinsCount);
            // Recount after the new element is in the DOM.
            updateLimitState();
        } else {
            // Incorrect
            playSound('error');
            triggerErrorState();
        }
    }
    
    // Allow dropping back to tray
    moneyTray.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    
    moneyTray.addEventListener('drop', (e) => {
        e.preventDefault();
        handleDropInTray();
    });

    function handleDropInTray() {
        if (levelLocked) return;
        if (draggedItemOrigin) {
            if (draggedItemType === 'note') {
                playSound('note');
            } else {
                playSound('drop');
            }
            draggedItemOrigin.remove();
            droppedCoinsCount--;
            updateDropzoneLayout(droppedCoinsCount);
            // Recount after the dropped element is gone from the DOM.
            updateLimitState();
            draggedItemOrigin = null;
            updateDropzoneBackground();
        }
    }
    
    function updateDropzoneLayout(count) {
        dropzoneArea.className = 'dropzone-area'; // reset

        if (count === 1) {
            dropzoneArea.classList.add('layout-1');
        } else if (count === 2) {
            dropzoneArea.classList.add('layout-2');
        } else if (count >= 3) {
            dropzoneArea.classList.add('layout-3');
        }
    }

    // Check button logic
    checkBtn.addEventListener('click', () => {
        resetIdleTimer();

        if (droppedCoinsCount < requiredCount) {
            // Failure: Less coin
            playSound('error');
            const tooFewKey = mixedDenoms ? 'addMore'
                : (requiredItemType === 'note' ? 'tooFewNotes' : 'tooFewCoins');
            const tooFewText = mixedDenoms ? 'Add more.'
                : `Too few ${requiredItemType}s! Add more.`;
            playVO(tooFewKey);
            setQuestion(`<p style="color: #FFD600;">${tooFewText}</p>`, true, voDurationMs(tooFewKey));
            triggerErrorState();
        } else if (droppedCoinsCount > requiredCount) {
            // Failure: More coin
            playSound('error');
            const tooManyKey = mixedDenoms ? 'removeSome'
                : (requiredItemType === 'note' ? 'tooManyNotes' : 'tooManyCoins');
            const tooManyText = mixedDenoms ? 'Remove some.'
                : `Too many ${requiredItemType}s! Remove some.`;
            playVO(tooManyKey);
            setQuestion(`<p style="color: #FFD600;">${tooManyText}</p>`, true, voDurationMs(tooManyKey));
            triggerErrorState();
            // Show the kid how to drag a coin back to the tray (3x).
            startReturnHint();
        } else if (droppedCoinsCount === requiredCount) {
            // Success!
            levelLocked = true;
            playSound('success');
            playVO('success');
            setQuestion('<p>Yay! You have won the tickets!</p>', true, voDurationMs('success'));

            // Apply success CSS glow instead of changing src
            dropzoneBg.classList.remove('is-glow', 'error-glow');
            dropzoneBg.classList.add('success-glow');

            triggerSuccessAnimation();
            checkBtn.classList.add('hidden');
            
            // Load next level smoothly 3 seconds after celebration
            setTimeout(() => {
                let nextLevel = currentLevel + 1;

                if (nextLevel > 4) {
                    // All Levels Completed state — keep the legacy overlay flow
                    // (the flipbook is told we are finished further down, once the
                    // "All Levels Done." card has had its moment — see below)
                    const overlay = document.getElementById('level-transition-overlay');
                    const title = document.getElementById('transition-title');
                    const subtitle = document.getElementById('transition-subtitle');
                    const uiLayer = document.querySelector('.ui-layer');
                    const screen0 = document.getElementById('screen-0');
                    const playBtnImg = document.querySelector('#play-btn img');

                    uiLayer.classList.add('level-fade');

                    setTimeout(() => {
                        title.textContent = `All Levels Done.`;
                        subtitle.textContent = ``;
                        overlay.classList.remove('hidden');
                        playVO('allDone');

                        setTimeout(() => {
                            overlay.classList.add('hidden');
                            uiLayer.classList.remove('level-fade');

                            // FINISHED — told to the flipbook HERE, after the
                            // "All Levels Done." card, not before it. The book then
                            // turns to the next story page, so the reader never lands
                            // back on this game's title / "Play again" screen.
                            try {
                                if (window.parent !== window) {
                                    window.parent.postMessage({ source: 'lbd', type: 'lbd-complete' }, '*');
                                }
                            } catch (_) {}

                            // Swap the button image FIRST (while screen-0 is still
                            // hidden), then reveal screen-0. The preload below
                            // guarantees the swap is instant from cache.
                            // (Standalone only — inside the book we have already left.)
                            if (screen0 && playBtnImg) {
                                playBtnImg.src = 'assets/images/Play_again_BTN.svg';
                                screen0.classList.remove('hidden');
                            }

                            loadLevel(1);
                            clearTimeout(idleTimer);
                        }, 3000);
                    }, 500);
                    return;
                }

                // Normal Level Transition — cinematic intro
                let nextTargetAmount = 12;
                if (nextLevel === 2) nextTargetAmount = 25;
                if (nextLevel === 3) nextTargetAmount = 50;
                if (nextLevel === 4) nextTargetAmount = 100;

                playLevelIntro(nextLevel, nextTargetAmount).then(() => {
                    resetIdleTimer();
                    // Read the new level's question aloud once gameplay is
                    // visible, typing it into the panel in sync with the voice.
                    playLevelVO(nextLevel);
                    setQuestion(questionHTML, true, voDurationMs('level' + nextLevel));
                    // Re-trigger the gold-glow attention pop on the new target.
                    const targetEl = document.querySelector('.target-amount');
                    if (targetEl) {
                        targetEl.classList.remove('attention-pop');
                        void targetEl.offsetWidth;
                        targetEl.classList.add('attention-pop');
                    }
                });

                // Reset the dropzone 200 ms in, while the intro overlay is fully opaque,
                // so the player never sees coins/glow disappear.
                setTimeout(() => {
                    loadLevel(nextLevel);
                }, 200);
            }, 3000);
        }
    });

    function resetGame(soft = false) {
        droppedCoinsCount = 0;
        dropzoneArea.innerHTML = '';
        dropzoneArea.className = 'dropzone-area'; // reset layouts
        
        // Remove all glows
        dropzoneBg.classList.remove('is-glow', 'success-glow', 'error-glow');
        
        if (!soft) setQuestion(questionHTML);
        checkBtn.classList.add('hidden');
        dropzoneText.classList.remove('hidden'); // Restore text
    }

    function triggerErrorState() {
        // Apply error CSS glow instead of changing src
        dropzoneBg.classList.remove('is-glow', 'success-glow');
        dropzoneBg.classList.add('error-glow');
        
        dropzoneContainer.classList.add('shake');
        setTimeout(() => {
            dropzoneContainer.classList.remove('shake');
            updateDropzoneBackground();
        }, 500);
    }
    
    // Let main.js re-run the question typewriter at the moment an intro
    // finishes (first play and "Play again" both funnel through there).
    // Mirrors the window.startGame handshake. Synced to the level VO.
    window.typeQuestion = () =>
        setQuestion(questionHTML, true, voDurationMs('level' + currentLevel));

    // The cinematic level-intro module already played the Level 1 banner.
    // Lock all the non-required denominations from the start, kick off the
    // tutorial schedule and idle clock.
    applyLockState();
    if (currentLevel === 1) startLevel1Tutorial();
    resetIdleTimer();
}
