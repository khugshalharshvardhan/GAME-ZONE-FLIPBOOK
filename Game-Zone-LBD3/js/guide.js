// js/guide.js — ghost coin tutorial guide and inactivity trigger

let inactivityTimer = null;
let lastPointerX = null;
let lastPointerY = null;
let currentSlotNum = null;

// Starts the inactivity detection listeners
export function initGuideTutorial() {
    // Listen for user activity to hide the guide and reset the timer
    window.addEventListener('pointerdown', handleUserActivity);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', handleUserActivity);
}

// Reset inactivity timer
export function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    
    // Only schedule if a round is actually active
    if (isRoundGameplayActive()) {
        inactivityTimer = setTimeout(triggerInactivityGuide, 10000); // 10 seconds of inactivity
    }
}

// Check if we are currently in active gameplay where the guide can be shown
function isRoundGameplayActive() {
    const activeSlot = document.querySelector('.slot.active');
    if (!activeSlot) return false;
    
    const gameContainer = document.querySelector('.game-container');
    if (!gameContainer) return false;
    
    // Do not show guide if slot is correct/incorrect, or if game is spinning/stopping or jackpot active
    const isSpinning = document.querySelector('.reel-strip.spinning') || document.querySelector('.reel-strip.stopping');
    const isTransitioning = gameContainer.classList.contains('lever-pulled-active') || gameContainer.classList.contains('jackpot-active');
    
    return !isSpinning && !isTransitioning;
}

function onPointerMove(e) {
    if (e.clientX === lastPointerX && e.clientY === lastPointerY) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    handleUserActivity();
}

function handleUserActivity() {
    stopGuide();
    resetInactivityTimer();
}

export function stopGuide() {
    const guideContainer = document.querySelector('.guide-container');
    if (guideContainer) {
        guideContainer.classList.remove('guide-active', 'guide-intro', 'guide-continuous');
    }
}

// Triggered when a new round starts
export function onRoundStarted(slotNum) {
    currentSlotNum = slotNum;
    
    // Update the slot class on guide container
    const guideContainer = document.querySelector('.guide-container');
    if (guideContainer) {
        // Remove old active-slot-X classes
        guideContainer.classList.remove('active-slot-1', 'active-slot-2', 'active-slot-3');
        guideContainer.classList.add(`active-slot-${slotNum}`);
        
        // Update guide coin image based on slot
        const guideCoinImg = guideContainer.querySelector('.coin-guide-img');
        if (guideCoinImg) {
            if (slotNum === 2) {
                guideCoinImg.src = 'assets/images/Money/Two_Rupee_Default.webp';
            } else {
                guideCoinImg.src = 'assets/images/Money/One_Rupee_Default.webp';
            }
        }
    }
    
    stopGuide();
    clearTimeout(inactivityTimer);
    
    // If it's slot 1, trigger the intro guide automatically after a 5-second observation delay
    if (slotNum === 1) {
        inactivityTimer = setTimeout(triggerIntroGuide, 5000);
    } else {
        resetInactivityTimer();
    }
}

function triggerIntroGuide() {
    if (!isRoundGameplayActive()) return;
    
    const guideContainer = document.querySelector('.guide-container');
    if (guideContainer) {
        guideContainer.classList.add('guide-active', 'guide-intro');
    }
    
    // Intro animation runs 3 times (each takes 2.2s, so 6.6s total).
    // After that, we reset the inactivity timer.
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        stopGuide();
        resetInactivityTimer();
    }, 6600);
}

function triggerInactivityGuide() {
    if (!isRoundGameplayActive()) return;
    
    const guideContainer = document.querySelector('.guide-container');
    if (guideContainer) {
        guideContainer.classList.add('guide-active', 'guide-continuous');
    }
}
