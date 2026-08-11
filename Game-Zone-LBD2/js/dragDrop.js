import { triggerSuccessAnimation } from './ticketBurst.js';
import { playLevelIntro } from './level-intro.js';
import { playVO, stopVO } from './vo.js';

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
        click: new Audio('assets/sounds/click1.mp3'),
        error: new Audio('assets/sounds/error3.mp3'),
        success: new Audio('assets/sounds/success1.mp3') // Used success1.mp3 based on folder contents
    };

    // Preload the "Play Again" button so the end-game src swap is instant
    // (no network round-trip) and the user never sees the old "Let's Play" art.
    const playAgainPreload = new Image();
    playAgainPreload.src = 'assets/images/Play_again_BTN.svg';

    function playSound(name) {
        if (sounds[name]) {
            sounds[name].currentTime = 0;
            sounds[name].play().catch(e => console.log('Audio error:', e));
        }
    }
    
    let currentLevel = 1;
    let targetAmount = 36;
    let questionHTML = '<p>Make <span class="highlight">₹36</span>.</p>';

    // --- Typewriter for the question/instruction panel -----------------------
    // Reveals text character by character (no cursor) while keeping the inner
    // HTML structure (highlight spans) intact. A new call cancels the previous
    // one so rapid state changes can't interleave two typings.
    let typeCharTimer = null;
    let typeDelayTimer = null;
    function typeText(el, html, durationMs, startDelayMs = 0) {
        clearInterval(typeCharTimer);
        clearTimeout(typeDelayTimer);

        el.innerHTML = html;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = [];
        let totalChars = 0;
        while (walker.nextNode()) {
            nodes.push({ node: walker.currentNode, full: walker.currentNode.textContent });
            totalChars += walker.currentNode.textContent.length;
        }
        if (!totalChars) return;
        nodes.forEach(n => (n.node.textContent = ''));

        const stepMs = Math.max(20, durationMs / totalChars);
        let nodeI = 0;
        let charI = 0;
        const begin = () => {
            typeCharTimer = setInterval(() => {
                charI++;
                nodes[nodeI].node.textContent = nodes[nodeI].full.slice(0, charI);
                if (charI >= nodes[nodeI].full.length) { nodeI++; charI = 0; }
                if (nodeI >= nodes.length) clearInterval(typeCharTimer);
            }, stepMs);
        };

        if (startDelayMs > 0) {
            typeDelayTimer = setTimeout(begin, startDelayMs);
        } else {
            begin();
        }
    }

    // The cinematic intro fires this when its overlay is removed - the same
    // moment the "Make X Rupees" VO starts - so the question text types in
    // sync with the voice on every level (and play-again).
    document.addEventListener('level-intro-complete', () => {
        typeText(questionContent, questionHTML, 1300);
    });
    // --------------------------------------------------------------------------

    function loadLevel(level) {
        currentLevel = level;
        const dynamicNote = document.getElementById('dynamic-note');
        
        if (level === 1) {
            targetAmount = 36;
            questionHTML = '<p>Make <span class="highlight">₹36</span>.</p>';
            document.querySelector('.target-amount').textContent = '₹36';
        } else if (level === 2) {
            targetAmount = 54;
            questionHTML = '<p>Make <span class="highlight">₹54</span>.</p>';
            document.querySelector('.target-amount').textContent = '₹54';
        } else if (level === 3) {
            targetAmount = 63;
            questionHTML = '<p>Make <span class="highlight">₹63</span>.</p>';
            document.querySelector('.target-amount').textContent = '₹63';
        }
        
        // Dynamically swap the second note
        if (level === 3) {
            dynamicNote.setAttribute('data-value', '50');
            dynamicNote.querySelector('img').src = 'assets/images/Money/Fifty_Rupee_Note_Default.webp';
            dynamicNote.querySelector('img').alt = '₹50 Note';
        } else {
            dynamicNote.setAttribute('data-value', '20');
            dynamicNote.querySelector('img').src = 'assets/images/Money/Twenty_Rupee_Note_Default.webp';
            dynamicNote.querySelector('img').alt = '₹20 Note';
        }
        
        // Leave the panel blank during the level transition - the typewriter
        // fills it in sync with the VO once the intro overlay is removed.
        // Setting it here would flash the full text during the intro fade-out.
        questionContent.innerHTML = '';
        resetGame(true); // soft reset

        // The success-glow during the level transition causes resetInactivityTimer()
        // to early-return without re-arming. Now that resetGame has cleared it,
        // restart the idle countdown so the ghost coin appears on the new level too.
        resetInactivityTimer();
    }
    
    // --- Ghost Coin Nudge (Tutorial + Inactivity) ---
    let inactivityTimer = null;
    let tutorialActive = true;
    const liveGhosts = new Set();

    function spawnGhostCoin(sourceCoin, { loop = false, targetRect = null } = {}) {
        if (!sourceCoin) return;
        const sourceImg = sourceCoin.querySelector('img');
        if (!sourceImg) return;

        const ghost = document.createElement('img');
        ghost.src = sourceImg.src.replace('_Glow', '_Default');
        ghost.className = 'ghost-coin-tutorial';

        const rect = sourceCoin.getBoundingClientRect();
        const gameContainer = document.querySelector('.game-container').getBoundingClientRect();
        // Default destination is the dropzone (the "add a coin" gesture). Passing
        // targetRect lets the ghost travel the other way, e.g. dropzone -> tray
        // to demonstrate removing a coin.
        const dest = targetRect || document.querySelector('.dropzone-container').getBoundingClientRect();

        const startX = ((rect.left - gameContainer.left) / gameContainer.width) * 100;
        const startY = ((rect.top - gameContainer.top) / gameContainer.height) * 100;
        const tx = (dest.left + dest.width / 2) - (rect.left + rect.width / 2);
        const ty = (dest.top + dest.height / 2) - (rect.top + rect.height / 2);

        ghost.style.left = `${startX + 1}%`;
        ghost.style.top = `${startY + 2}%`;
        ghost.style.setProperty('--nudge-tx', `${tx}px`);
        ghost.style.setProperty('--nudge-ty', `${ty}px`);
        ghost.style.animation = 'none';

        document.querySelector('.game-container').appendChild(ghost);
        ghost.offsetHeight; // Force reflow so the animation reliably starts
        ghost.style.animation = loop
            ? 'dragNudgeAnim 2s cubic-bezier(0.4, 0, 0.2, 1) infinite'
            : 'dragNudgeAnim 2s cubic-bezier(0.4, 0, 0.2, 1) forwards';

        liveGhosts.add(ghost);
        if (!loop) {
            setTimeout(() => {
                if (ghost.parentElement) ghost.remove();
                liveGhosts.delete(ghost);
            }, 2000);
        }
    }

    function clearLiveGhosts() {
        liveGhosts.forEach(g => {
            if (g.parentElement) g.remove();
        });
        liveGhosts.clear();
    }

    // --- "Remove a coin" demo (shown after a too-many-coins error) ---
    // Plays the dropzone -> tray drag-back gesture 3 times so a first-time kid
    // learns how to take a coin out. Cancelled the moment the player interacts.
    let removeTutorialTimers = [];

    function stopRemoveTutorial() {
        if (!removeTutorialTimers.length) return;
        removeTutorialTimers.forEach(clearTimeout);
        removeTutorialTimers = [];
        clearLiveGhosts();
    }

    function playRemoveGhostOnce() {
        const droppedCoins = document.querySelectorAll('.dropped-coin');
        if (!droppedCoins.length) return;
        // Demonstrate dragging the most-recently-added coin back to the tray.
        const sourceCoin = droppedCoins[droppedCoins.length - 1];
        const trayRect = document.querySelector('.money-tray').getBoundingClientRect();
        spawnGhostCoin(sourceCoin, { targetRect: trayRect });
    }

    function playRemoveTutorial() {
        stopRemoveTutorial();           // reset if one is already running
        playRemoveGhostOnce();          // 1st play (immediate)
        removeTutorialTimers.push(setTimeout(playRemoveGhostOnce, 2500)); // 2nd
        removeTutorialTimers.push(setTimeout(playRemoveGhostOnce, 5000)); // 3rd
        // Clear the timer list once the 3rd ghost has faded (5000 + 2000).
        removeTutorialTimers.push(setTimeout(() => { removeTutorialTimers = []; }, 7000));
    }

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);

        // Any post-tutorial activity dismisses an in-flight inactivity ghost.
        // During the tutorial, mousemove should not abort the lesson.
        if (!tutorialActive) clearLiveGhosts();

        // Don't show nudge if celebrating
        if (dropzoneBg.classList.contains('success-glow')) return;

        inactivityTimer = setTimeout(showNudge, 15000);
    }

    function showNudge() {
        if (dropzoneBg.classList.contains('success-glow') || tutorialActive) return;

        const sourceCoin = document.querySelector('.money-item[data-value="1"]:not(.dropped-coin)');
        spawnGhostCoin(sourceCoin, { loop: true });
    }

    let hasInteracted = false;
    ['mousedown', 'mousemove', 'touchstart', 'touchmove', 'click', 'dragstart'].forEach(evt => {
        window.addEventListener(evt, (e) => {
            const target = e.target;
            const isStartButtonClick =
                target instanceof Element &&
                (target.closest('#play-btn') || target.closest('#screen-0'));

            // Don't let the start-screen click cancel the level-1 tutorial.
            if (!isStartButtonClick && !hasInteracted && evt !== 'mousemove') {
                hasInteracted = true;
                tutorialActive = false;
                clearLiveGhosts();
            }
            if (!isStartButtonClick) {
                resetInactivityTimer();
            }

            // Stop the "remove a coin" demo as soon as the player interacts.
            // Excludes the Check-button press that launches it, and idle mouse
            // movement so a returning player isn't forced to watch all 3 loops.
            const isCheckButtonClick = target instanceof Element && target.closest('#check-btn');
            if (!isCheckButtonClick && evt !== 'mousemove' && evt !== 'touchmove') {
                stopRemoveTutorial();
            }
        }, { passive: true });
    });

    resetInactivityTimer();

    // Pause the idle countdown when the tab is hidden (switched away or
    // browser minimized). Otherwise a throttled setTimeout can fire the ghost
    // coin the instant the player returns, even if they were only gone briefly.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearTimeout(inactivityTimer);
        } else {
            resetInactivityTimer();
        }
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
        // Lock all dragging during the success celebration (3s window between
        // a correct sum and the level transition). Without this, coins could
        // still be added or pulled back out while confetti is playing.
        if (dropzoneBg.classList.contains('success-glow')) {
            if (e.preventDefault) e.preventDefault();
            return false;
        }

        const item = e.currentTarget;
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
        if (e.targetTouches.length !== 1) return;
        // Mirror the lock from handleDragStart for the touch path.
        if (dropzoneBg.classList.contains('success-glow')) return;

        const item = e.currentTarget;
        
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
            questionContent.innerHTML = questionHTML;
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
        if (draggedItemOrigin) {
            // Dragged within dropzone, do nothing
            return;
        }

        // Per-denomination cap. Belt-and-braces - the tray source is already
        // pointer-events:none once full, so a real drag from the tray can't get
        // here. This guards programmatic/edge-case drops.
        const sameKindCount = dropzoneArea.querySelectorAll(
            `.dropped-coin.${draggedItemType}[data-value="${draggedItemValue}"]`
        ).length;
        if (sameKindCount >= MAX_PER_DENOMINATION) return;

        // Play the material drop sound
        if (draggedItemType === 'note') {
            playSound('note');
        } else {
            playSound('drop');
        }

        droppedCoinsCount++;
        questionContent.innerHTML = questionHTML; // Reset any previous error text
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
        
        const existingOfSameValue = dropzoneArea.querySelectorAll(`.dropped-coin[data-value="${draggedItemValue}"]`);
        if (existingOfSameValue.length > 0) {
            const lastOne = existingOfSameValue[existingOfSameValue.length - 1];
            lastOne.after(newCoin);
        } else {
            dropzoneArea.appendChild(newCoin);
        }

        updateDropzoneLayout(droppedCoinsCount);
        updateTrayLimits();
        updateNoteScale();
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
        if (draggedItemOrigin) {
            if (draggedItemType === 'note') {
                playSound('note');
            } else {
                playSound('drop');
            }
            draggedItemOrigin.remove();
            droppedCoinsCount--;
            updateDropzoneLayout(droppedCoinsCount);
            draggedItemOrigin = null;
            updateDropzoneBackground();
            updateTrayLimits();
            updateNoteScale();
        }
    }

    // Cap per denomination - once 5 of a kind are in the dropzone, the matching
    // tray source greys out (CSS .disabled). Pulled back below 5 and it re-enables.
    const MAX_PER_DENOMINATION = 5;
    function updateTrayLimits() {
        document.querySelectorAll('.money-item:not(.dropped-coin)').forEach(item => {
            const type = item.classList.contains('note') ? 'note' : 'coin';
            const value = item.getAttribute('data-value');
            const count = dropzoneArea.querySelectorAll(
                `.dropped-coin.${type}[data-value="${value}"]`
            ).length;
            item.classList.toggle('disabled', count >= MAX_PER_DENOMINATION);
        });
    }

    // Notes shrink progressively as more are added to the dropzone so they
    // don't wrap behind the check button. The CSS rule on .dropped-coin.note
    // reads --note-scale and scales width + same-note overlap together.
    //
    // Floor is 0.72 (= 18% width / ~145px tall). Coins are 8% (~129px), so at
    // every tier notes stay clearly larger than coins both in width AND height.
    function updateNoteScale() {
        const noteCount = dropzoneArea.querySelectorAll('.dropped-coin.note').length;
        let scale;
        if      (noteCount <= 2) scale = 0.88; // 22%   width
        else if (noteCount <= 4) scale = 0.84; // 21%
        else if (noteCount <= 6) scale = 0.80; // 20%
        else if (noteCount <= 8) scale = 0.76; // 19%
        else                     scale = 0.72; // 18%   (floor, 9-10 notes)
        dropzoneArea.style.setProperty('--note-scale', scale);
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
        
        let currentSum = 0;
        document.querySelectorAll('.dropped-coin').forEach(coin => {
            currentSum += parseInt(coin.getAttribute('data-value'), 10);
        });
        
        if (currentSum < targetAmount) {
            // Failure: Less coin
            playSound('error');
            playVO('Add more.ogg', 400); // let the error buzz land first
            typeText(questionContent, '<p style="color: #FFD600;">Add more.</p>', 900, 400);
            triggerErrorState();
        } else if (currentSum > targetAmount) {
            // Failure: More coin
            playSound('error');
            playVO('remove some.ogg', 400);
            typeText(questionContent, '<p style="color: #FFD600;">Remove some.</p>', 1100, 400);
            triggerErrorState();
            playRemoveTutorial(); // show how to drag a coin back to the tray
        } else if (currentSum === targetAmount) {
            // Success!
            playSound('success');
            playVO('Yay you have won the tickets.ogg', 500);
            typeText(questionContent, '<p>Yay! You have won the <span class="highlight">tickets!</span></p>', 2000, 500);
            
            // Apply success CSS glow instead of changing src
            dropzoneBg.classList.remove('is-glow', 'error-glow');
            dropzoneBg.classList.add('success-glow');
            
            triggerSuccessAnimation();
            checkBtn.classList.add('hidden');
            
            // Load next level smoothly 3 seconds after celebration
            setTimeout(() => {
                let nextLevel = currentLevel + 1;
                
                const overlay = document.getElementById('level-transition-overlay');
                const title = document.getElementById('transition-title');
                const subtitle = document.getElementById('transition-subtitle');
                const uiLayer = document.querySelector('.ui-layer');
                const screen0 = document.getElementById('screen-0');
                const playBtnImg = document.querySelector('#play-btn img');
                
                uiLayer.classList.add('level-fade');
                
                setTimeout(() => {
                    if (nextLevel > 3) {
                        // (The flipbook is told we are finished further down, once the
                        // basketball has been tapped and scored — see below.)
                        // End-of-game: "All Levels Done." announcement card
                        // first, then the Basket Blast reward screen, then back
                        // to the start screen with a "Play again" button.
                        title.textContent = 'All Levels Done.';
                        subtitle.textContent = '';
                        overlay.classList.remove('hidden');

                        // Speak once the overlay's 0.5s fade-in has finished
                        // so the VO doesn't land mid-transition.
                        playVO('All levels done.ogg', 500);

                        setTimeout(() => {
                            // Hand off from the announcement card to the
                            // Basket Blast reward screen (crossfade - the
                            // overlay fades out while the screen fades in).
                            overlay.classList.add('hidden');

                            const finalScreen = document.getElementById('final-success-screen');
                            const ball = document.getElementById('basketball');
                            const nudge = document.getElementById('basketball-nudge');
                            const bg1 = document.getElementById('success-bg-1');
                            const bg2 = document.getElementById('success-bg-2');

                            finalScreen.classList.remove('hidden');

                            // Prompt the tap once the screen's 0.5s fade-in settles.
                            playVO('Tap the basket ball.ogg', 600);

                            // Ball interaction
                            ball.addEventListener('click', function handleBallTap() {
                                // Only trigger once
                                ball.removeEventListener('click', handleBallTap);

                                nudge.classList.add('hidden');
                                stopVO(); // don't keep saying "tap the basketball" after the tap
                                playSound('success');

                                // Shoot ball
                                ball.classList.add('shot');

                                // Switch to cheering background exactly when ball hits hoop
                                setTimeout(() => {
                                    bg1.classList.add('hidden');
                                    bg2.classList.remove('hidden');
                                }, 850); // sync with ball animation (70% of 1.2s = ~840ms)

                                // Show the cheer, then return to the start screen
                                setTimeout(() => {
                                    // FINISHED — told to the flipbook HERE, after the
                                    // ball has been tapped and gone in and the cheer has
                                    // played. The book turns to the next story page, so
                                    // the reader never sees the "Play again" screen.
                                    try {
                                        if (window.parent !== window) {
                                            window.parent.postMessage({ source: 'lbd', type: 'lbd-complete' }, '*');
                                        }
                                    } catch (_) {}

                                    // Silently reset to level 1 while the reward
                                    // screen still covers everything, so "Play
                                    // again" starts a clean run through the
                                    // level-1 cinematic intro. (Standalone only —
                                    // inside the book we have already left.)
                                    loadLevel(1);
                                    clearTimeout(inactivityTimer); // no idle hints on the start screen
                                    clearLiveGhosts();
                                    stopRemoveTutorial();

                                    // Swap the button art FIRST (preloaded at
                                    // init, screen-0 still hidden) so the user
                                    // never sees the swap happen.
                                    if (screen0 && playBtnImg) {
                                        playBtnImg.src = 'assets/images/Play_again_BTN.svg';
                                    }

                                    // Reveal screen-0 BEHIND the still-opaque
                                    // reward screen (z-2000 covers z-1000) and
                                    // let its fade-in finish while hidden.
                                    if (screen0) screen0.classList.remove('hidden');
                                    uiLayer.classList.remove('level-fade');

                                    // Only after screen-0 is fully opaque, fade
                                    // the reward screen away - the start screen
                                    // is what's revealed, never the gameplay UI.
                                    setTimeout(() => {
                                        finalScreen.classList.add('hidden');

                                        // Reset basketball state only after the
                                        // fade-out completes so the ball doesn't
                                        // visibly snap back mid-fade.
                                        setTimeout(() => {
                                            ball.classList.remove('shot');
                                            bg1.classList.remove('hidden');
                                            bg2.classList.add('hidden');
                                            nudge.classList.remove('hidden');
                                        }, 500);
                                    }, 550);
                                }, 5000); // Show cheer for 5 seconds
                            });
                        }, 3000); // Keep "All Levels Done." up for 3 seconds
                        return; // End execution - no next level
                    }
                    
                    // Normal Level Transition - cinematic intro
                    let nextTargetAmount = 36;
                    if (nextLevel === 2) nextTargetAmount = 54;
                    if (nextLevel === 3) nextTargetAmount = 63;

                    playLevelIntro(nextLevel, nextTargetAmount);

                    // While the intro overlay is fully opaque (~150ms in), swap
                    // the dropzone over to the new level and restore the UI layer
                    // so it's already visible when the intro fades out at the end.
                    setTimeout(() => {
                        loadLevel(nextLevel);
                        uiLayer.classList.remove('level-fade');
                    }, 200);
                }, 500); // Wait 500ms for UI to fade out before showing overlay
            }, 3000);
        }
    });

    function resetGame(soft = false) {
        droppedCoinsCount = 0;
        dropzoneArea.innerHTML = '';
        dropzoneArea.className = 'dropzone-area'; // reset layouts

        // Remove all glows
        dropzoneBg.classList.remove('is-glow', 'success-glow', 'error-glow');

        if (!soft) questionContent.innerHTML = questionHTML;
        checkBtn.classList.add('hidden');
        dropzoneText.classList.remove('hidden'); // Restore text

        // Dropzone is empty - every denomination is back at 0, so the whole
        // tray should be re-enabled (also handles the level-3 ₹50 note swap).
        updateTrayLimits();
        updateNoteScale();
    }

    function triggerErrorState() {
        // Apply error CSS glow instead of changing src
        dropzoneBg.classList.remove('is-glow', 'success-glow');
        dropzoneBg.classList.add('error-glow');

        dropzoneContainer.classList.add('shake');

        // Pull the player's eye to the TARGET so they can re-read it.
        const targetBox = document.querySelector('.target-box');
        if (targetBox) {
            targetBox.classList.add('attention');
            setTimeout(() => targetBox.classList.remove('attention'), 500);
        }

        setTimeout(() => {
            dropzoneContainer.classList.remove('shake');
            updateDropzoneBackground();
        }, 500);
    }
    
    // Cinematic intro (level-intro.js) handles the initial LEVEL 1 reveal,
    // so we skip the legacy overlay here. References are still grabbed for the
    // level-2/level-3 transition logic below.
    const overlay = document.getElementById('level-transition-overlay');
    const title = document.getElementById('transition-title');
    const subtitle = document.getElementById('transition-subtitle');
    const uiLayer = document.querySelector('.ui-layer');
    
    function playTutorialAnimation() {
        if (currentLevel !== 1 || hasInteracted) return;
        const sourceCoin = document.querySelector('.money-item[data-value="1"]:not(.dropped-coin)');
        spawnGhostCoin(sourceCoin);
    }
    
    setTimeout(() => {
        overlay.classList.add('hidden');
        uiLayer.classList.remove('level-fade');
        
        // Wait 4 seconds for kid to read instructions
        setTimeout(() => {
            playTutorialAnimation();
            
            // Show it a 2nd time after the first one finishes (2s + small delay)
            setTimeout(() => {
                playTutorialAnimation();
            }, 2500);
            
            // Show it a 3rd time
            setTimeout(() => {
                playTutorialAnimation();
                
                // End tutorial mode and start inactivity timer
                setTimeout(() => {
                    tutorialActive = false;
                    resetInactivityTimer();
                }, 2000);
            }, 5000);
        }, 4000);
    }, 2000);
}
