// js/dragdrop.js — pointer-based drag & drop for coins/notes
import { playSound } from './sounds.js';

const DESIGN_WIDTH = 1920;

let onDropCallback = null;
let activeDrag = null;

export function setupDragAndDrop({ onDrop } = {}) {
    onDropCallback = onDrop || null;

    // Attach to ALL tray currency once; locked state is checked at pointerdown
    // so we don't have to re-bind every round.
    document.querySelectorAll('.coin, .note').forEach(attachDragHandler);
}

function attachDragHandler(el) {
    el.addEventListener('pointerdown', onPointerDown);
}

function getActiveDropSlot() {
    // The slot the player is currently filling — active, not yet checked.
    return document.querySelector('.slot.active:not(.correct):not(.incorrect)');
}

function getDesignScale() {
    const gameContainer = document.querySelector('.game-container');
    const rect = gameContainer.getBoundingClientRect();
    return { scale: rect.width / DESIGN_WIDTH, rect };
}

function toDesignCoords(clientX, clientY) {
    const { scale, rect } = getDesignScale();
    return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
    };
}

function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;

    // Block dragging during slot machine spin/stop transitions
    if (document.querySelector('.reel-strip.spinning') || document.querySelector('.reel-strip.stopping')) {
        return;
    }

    const source = e.currentTarget;
    if (source.classList.contains('locked')) return;
    e.preventDefault();

    playSound('grab');

    const gameContainer = document.querySelector('.game-container');

    // Clone BEFORE fading the source so the ghost stays at full opacity
    const ghost = source.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('id');
    ghost.style.opacity = '';
    ghost.style.removeProperty('--stack-index');
    ghost.style.transform = 'translate(-50%, -50%) scale(1.05)';
    const coords = toDesignCoords(e.clientX, e.clientY);
    ghost.style.left = `${coords.x}px`;
    ghost.style.top = `${coords.y}px`;
    gameContainer.appendChild(ghost);

    source.style.opacity = '0.4';

    activeDrag = { source, ghost, pointerId: e.pointerId };

    source.setPointerCapture(e.pointerId);
    source.addEventListener('pointermove', onPointerMove);
    source.addEventListener('pointerup', onPointerUp);
    source.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;
    const coords = toDesignCoords(e.clientX, e.clientY);
    activeDrag.ghost.style.left = `${coords.x}px`;
    activeDrag.ghost.style.top = `${coords.y}px`;
}

function onPointerUp(e) {
    if (!activeDrag || e.pointerId !== activeDrag.pointerId) return;

    const { source, ghost } = activeDrag;
    const sourceInSlot = source.closest('.dropped-items') !== null;

    const targetSlot = getActiveDropSlot();
    let overTargetSlot = false;
    if (targetSlot) {
        const r = targetSlot.getBoundingClientRect();
        overTargetSlot =
            e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top && e.clientY <= r.bottom;
    }

    // Restore source opacity BEFORE cloning so the drop clone is full opacity
    source.style.opacity = '';

    if (!sourceInSlot && overTargetSlot && targetSlot) {
        dropIntoSlot(source, targetSlot);
        if (onDropCallback) onDropCallback(source);
    } else if (sourceInSlot && !overTargetSlot) {
        const sourceSlot = source.closest('.slot');
        if (sourceSlot) removeFromSlot(source, sourceSlot);
    }

    ghost.remove();
    try { source.releasePointerCapture(e.pointerId); } catch (_) {}
    source.removeEventListener('pointermove', onPointerMove);
    source.removeEventListener('pointerup', onPointerUp);
    source.removeEventListener('pointercancel', onPointerUp);
    activeDrag = null;
}

function getDenomClass(el) {
    return [...el.classList].find(c => c.startsWith('coin-') || c.startsWith('note-'));
}

function dropIntoSlot(source, slot1) {
    const dropZone = slot1.querySelector('.dropped-items');
    const denom = getDenomClass(source);
    if (!denom) return;

    // Play drop/note sound
    if (denom.startsWith('coin-')) {
        playSound('drop');
    } else if (denom.startsWith('note-')) {
        playSound('note');
    }

    const isCoin = denom.startsWith('coin-');
    const rowClass = isCoin ? 'coins-row' : 'notes-row';

    let row = dropZone.querySelector(`.drop-row.${rowClass}`);
    if (!row) {
        row = document.createElement('div');
        row.className = `drop-row ${rowClass}`;
        if (isCoin) {
            dropZone.insertBefore(row, dropZone.firstChild);
        } else {
            dropZone.appendChild(row);
        }
    }

    let stack = row.querySelector(`.drop-stack[data-denom="${denom}"]`);
    if (!stack) {
        stack = document.createElement('div');
        stack.className = 'drop-stack';
        stack.dataset.denom = denom;
        row.appendChild(stack);
    }

    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('dropped-item');
    clone.style.opacity = '';
    stack.appendChild(clone);

    attachDragHandler(clone);
    slot1.classList.add('has-drops');
    fitDropZoneContents(dropZone);
    checkTolerance(slot1, denom);
}

// Each denomination can be dropped at most MAX_PER_DENOM times into the
// active slot. When the cap is hit, dim & disable the tray source.
const MAX_PER_DENOM = 4;

function checkTolerance(slot, denom) {
    if (!denom) return;
    const stack = slot.querySelector(`.drop-stack[data-denom="${denom}"]`);
    const count = stack ? stack.children.length : 0;
    const traySource = document.querySelector(`.money-rack .${denom}`);
    if (!traySource) return;
    if (count >= MAX_PER_DENOM) {
        traySource.classList.add('at-max');
    } else {
        traySource.classList.remove('at-max');
    }
}

// Shrinks the drop zone as items pile up, so the stacks always fit inside the slot.
function fitDropZoneContents(dropZone) {
    if (!dropZone) return;
    const count = dropZone.querySelectorAll('.drop-stack img').length;
    let scale = 1;
    if (count > 12) scale = 0.65;
    else if (count > 9)  scale = 0.75;
    else if (count > 6)  scale = 0.85;
    else if (count > 4)  scale = 0.93;
    dropZone.style.transform = `scale(${scale})`;
    dropZone.style.transformOrigin = 'center center';
}

function removeFromSlot(droppedItem, slot1) {
    const stack = droppedItem.parentElement;
    if (!stack) return;
    const row = stack.parentElement;
    const dropZone = row.parentElement;

    const denom = getDenomClass(droppedItem);
    if (denom) {
        if (denom.startsWith('coin-')) {
            playSound('drop');
        } else if (denom.startsWith('note-')) {
            playSound('note');
        }
    }
    droppedItem.remove();

    if (stack.children.length === 0) stack.remove();
    if (row.children.length === 0) row.remove();
    if (dropZone.children.length === 0) slot1.classList.remove('has-drops');
    fitDropZoneContents(dropZone);
    checkTolerance(slot1, denom);
}
