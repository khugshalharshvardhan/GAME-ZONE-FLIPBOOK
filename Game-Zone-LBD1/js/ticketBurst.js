export function triggerSuccessAnimation() {
    const dropzoneContainer = document.querySelector('.dropzone-container');

    dropzoneContainer.classList.add('success-pop');
    setTimeout(() => {
        dropzoneContainer.classList.remove('success-pop');
    }, 600);

    // Anchor the burst to the cabinet's actual bounds (not the viewport),
    // so particles emit from the visible bottom corners of the game even
    // when the page is letterboxed on wide / tall monitors.
    const cabinet = document.querySelector('.cabinet-wrapper')
                 || document.querySelector('.game-container');
    const rect = cabinet
        ? cabinet.getBoundingClientRect()
        : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight,
            width: window.innerWidth, height: window.innerHeight };

    // Container is fixed/full-viewport so particles can fly outside the
    // cabinet bounds (above + below) without being clipped.
    const burstContainer = document.createElement('div');
    burstContainer.className = 'ticket-burst-container';
    document.body.appendChild(burstContainer);

    const flash = document.createElement('div');
    flash.className = 'success-flash';
    burstContainer.appendChild(flash);

    const singleTicketAsset = 'assets/images/Confetti/ticket-single.webp';
    const confettiAssets = [
        'assets/images/Confetti/confetti 1.webp',
        'assets/images/Confetti/confetti 2-1.webp',
        'assets/images/Confetti/confetti 2.webp',
        'assets/images/Confetti/confetti 3.webp',
        'assets/images/Confetti/confetti 4.webp'
    ];

    // Corner spawn region — bottom 8% × 8% of the cabinet on each side.
    const cornerW = rect.width  * 0.08;
    const cornerH = rect.height * 0.08;

    for (let i = 0; i < 90; i++) {
        const particle = document.createElement('img');

        const isTicket = Math.random() > 0.4; // 60% tickets, 40% confetti
        particle.src = isTicket
            ? singleTicketAsset
            : confettiAssets[Math.floor(Math.random() * confettiAssets.length)];
        particle.className = isTicket ? 'anim-ticket-single' : 'anim-ticket-single anim-confetti';

        // Alternate between cabinet bottom-left and cabinet bottom-right.
        const isLeft = i % 2 === 0;

        // Spawn at the cabinet's visible corner (viewport-pixel coords).
        const startX = isLeft
            ? rect.left  + Math.random() * cornerW
            : rect.right - Math.random() * cornerW;
        const startY = rect.bottom - Math.random() * cornerH;

        particle.style.left = `${startX}px`;
        particle.style.top  = `${startY}px`;

        // Trajectory in cabinet-relative pixels so the spread scales with the
        // cabinet rather than the browser window.
        const tx = isLeft
            ?  rect.width * 0.5 + Math.random() * rect.width * 0.5
            : -rect.width * 0.5 - Math.random() * rect.width * 0.5;

        // Arc peaks above the top of the cabinet.
        const peakY = -rect.height * 0.85 - Math.random() * rect.height * 0.3;

        // Ends below the cabinet bottom by ~15–25% of cabinet height.
        const endY = rect.height * 0.15 + Math.random() * rect.height * 0.1;

        const scale    = 0.5 + Math.random() * 0.7;
        const duration = 2.5 + Math.random() * 1.5;
        const delay    = Math.random() * 0.05; // ≤50 ms — feels instant

        particle.style.zIndex = Math.random() > 0.5 ? 100 : 40;
        if (scale > 0.9) particle.style.filter = 'drop-shadow(0 5px 10px rgba(0,0,0,0.5))';

        const rot = (Math.random() - 0.5) * 1080;

        particle.style.setProperty('--tx',     `${tx}px`);
        particle.style.setProperty('--peak-y', `${peakY}px`);
        particle.style.setProperty('--end-y',  `${endY}px`);
        particle.style.setProperty('--rot',    `${rot}deg`);
        particle.style.setProperty('--scale',  scale);

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
