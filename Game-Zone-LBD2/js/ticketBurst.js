export function triggerSuccessAnimation() {
    const gameContainer = document.querySelector('.game-container');
    const dropzoneContainer = document.querySelector('.dropzone-container');

    dropzoneContainer.classList.add('success-pop');
    setTimeout(() => {
        dropzoneContainer.classList.remove('success-pop');
    }, 600);

    const burstContainer = document.createElement('div');
    burstContainer.className = 'ticket-burst-container';
    gameContainer.appendChild(burstContainer);

    const flash = document.createElement('div');
    flash.className = 'success-flash';
    burstContainer.appendChild(flash);

    // Measure the cabinet so confetti is anchored to ITS bottom corners,
    // not the viewport's. On non-16:9 displays the cabinet is letter-boxed
    // and vw/vh would land outside the cabinet area.
    const cabinet = gameContainer.getBoundingClientRect();
    const cabW = cabinet.width;
    const cabH = cabinet.height;

    const singleTicketAsset = 'assets/images/Confetti/ticket-single.webp';
    const confettiAssets = [
        'assets/images/Confetti/confetti 1.webp',
        'assets/images/Confetti/confetti 2-1.webp',
        'assets/images/Confetti/confetti 2.webp',
        'assets/images/Confetti/confetti 3.webp',
        'assets/images/Confetti/confetti 4.webp'
    ];

    // Create bursts from both bottom corners of the cabinet
    for (let i = 0; i < 90; i++) {
        const particle = document.createElement('img');

        const isTicket = Math.random() > 0.4; // 60% tickets, 40% confetti
        particle.src = isTicket ? singleTicketAsset : confettiAssets[Math.floor(Math.random() * confettiAssets.length)];
        particle.className = isTicket ? 'anim-ticket-single' : 'anim-ticket-single anim-confetti';

        // Alternate between left and right corners
        const isLeft = i % 2 === 0;

        // Source position in % of the burst container (= the cabinet).
        const startX = isLeft ? (-5 + Math.random() * 15) : (90 + Math.random() * 15);
        const startY = 100 + Math.random() * 15;

        particle.style.left = `${startX}%`;
        particle.style.top = `${startY}%`;

        // Trajectory in px, scaled to the cabinet so the arc fits inside it
        // regardless of viewport aspect ratio. (translate's % unit can't be
        // used here - it'd resolve against the particle's own size.)
        const txFrac = 0.4 + Math.random() * 0.6;
        const tx = (isLeft ? txFrac : -txFrac) * cabW;
        const peakY = -(0.9 + Math.random() * 0.4) * cabH;
        const fallY = 0.15 * cabH; // matches the old 15vh, now in cabinet units

        const scale = 0.5 + Math.random() * 0.7;
        const duration = 2.5 + Math.random() * 1.5;
        const delay = Math.random() * 0.2; // Rapid explosion

        particle.style.zIndex = Math.random() > 0.5 ? 100 : 40;
        if (scale > 0.9) particle.style.filter = `drop-shadow(0 5px 10px rgba(0,0,0,0.5))`;

        const rot = (Math.random() - 0.5) * 1080;

        particle.style.setProperty('--tx', `${tx}px`);
        particle.style.setProperty('--peak-y', `${peakY}px`);
        particle.style.setProperty('--fall-y', `${fallY}px`);
        particle.style.setProperty('--rot', `${rot}deg`);
        particle.style.setProperty('--scale', scale);

        particle.style.animation = `cornerBurst ${duration}s linear ${delay}s forwards`;
        burstContainer.appendChild(particle);
    }
    
    // Cleanup
    setTimeout(() => {
        if (burstContainer.parentNode) {
            burstContainer.remove();
        }
    }, 5000);
}
