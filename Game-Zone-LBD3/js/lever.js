// js/lever.js
import { triggerReplayReset } from './game.js';
import { playSound } from './sounds.js';

export async function setupLeverInteraction() {
    const cabinetImg = document.querySelector('.cabinet-img');
    if (!cabinetImg) return;

    try {
        // Fetch the SVG content so we can inline it and animate its internal paths
        const response = await fetch(cabinetImg.src);
        const svgText = await response.text();
        
        // Create a temporary container to parse the SVG
        const wrapper = document.createElement('div');
        wrapper.innerHTML = svgText;
        const svg = wrapper.querySelector('svg');
        
        if (!svg) return;

        // Copy classes and attributes
        svg.setAttribute('class', cabinetImg.className);
        
        // The Stick of the lever starts with this exact rect in the SVG
        const rectStick = svg.querySelector('rect[x="1765"][y="326"]');
        
        if (rectStick) {
            // Create a group for JUST the lever stick and ball
            const handleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            handleGroup.id = 'lever-handle';
            
            // The stick rect and the next 6 elements make up the stick and ball
            let current = rectStick;
            const elementsToGroup = [];
            for (let i = 0; i < 7; i++) {
                if (current) {
                    elementsToGroup.push(current);
                    current = current.nextElementSibling;
                }
            }
            
            // Insert handle group before the stick
            rectStick.parentNode.insertBefore(handleGroup, rectStick);
            
            // Move elements into the group
            elementsToGroup.forEach(el => handleGroup.appendChild(el));

            // Pivot point exactly at the base of the stick inside the golden dome
            handleGroup.style.transformOrigin = '1775.5px 596px';
            handleGroup.style.cursor = 'pointer';

            // Lever click handler
            handleGroup.addEventListener('click', onLeverPull);
        }
        
        // Find all groups representing the panel lights and tag them sequentially
        for (let i = 0; i <= 15; i++) {
            const g = svg.querySelector(`g[filter*="filter${i}_dddddd"]`);
            if (g) {
                g.classList.add('cabinet-light');
                g.setAttribute('data-light-index', i.toString());
            }
        }

        // Replace the static <img> with the dynamic inline <svg>
        cabinetImg.parentNode.replaceChild(svg, cabinetImg);
    } catch (err) {
        console.error('Failed to inline SVG for lever interaction:', err);
    }
}

function onLeverPull() {
    const handle = document.getElementById('lever-handle');
    const gameContainer = document.querySelector('.game-container');
    if (!handle || handle.classList.contains('pulled')) return;

    // Only allow pull if the lever is active/glowing for replay
    if (!gameContainer.classList.contains('lever-glow-active')) return;

    // Remove the lever glow immediately
    gameContainer.classList.remove('lever-glow-active');

    // 1. Smoothly bend the lever using CSS transform
    handle.classList.add('pulled');
    
    // Play startup sound
    playSound('leverPull');
    
    // Return lever to normal after 500ms
    setTimeout(() => {
        handle.classList.remove('pulled');
    }, 500);

    // Trigger game replay reset
    triggerReplayReset();
}
