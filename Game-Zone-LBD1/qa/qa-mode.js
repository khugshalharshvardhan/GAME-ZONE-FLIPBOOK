// QA Mode — Figma-style click-to-comment tool.
// Activated ONLY when the URL has ?qa=true. Otherwise this file does nothing.
// To remove: delete the /qa/ folder and the single <script> tag in index.html.

import {
    getCommentsForCurrentScreen,
    addComment,
    updateComment,
    deleteComment,
    findCommentById,
    getAuthor,
    setAuthor,
    getRole,
    setRole,
    setPassword,
    clearSession,
    isPowerRole,
    canEditComment,
    canChangeStatus,
    canReply,
    verifyPassword,
    refreshComments,
    hasSavedPassword,
    getReplies,
} from './qa-storage.js';
import { createPopupModule } from './qa-popup.js';
import { createSidebarModule } from './qa-sidebar.js';

function isQAActive() {
    return new URLSearchParams(location.search).get('qa') === 'true';
}

// Auto-detect which logical screen the player is currently viewing.
// All checks are best-effort against the game's existing DOM; if none match,
// the comment is tagged "Other".
function detectScreen() {
    if (document.querySelector('.level-intro-overlay')) return 'Cinematic Intro';

    const transOverlay = document.getElementById('level-transition-overlay');
    if (transOverlay && !transOverlay.classList.contains('hidden')) {
        const title = document.getElementById('transition-title');
        if (title && /all\s*levels/i.test(title.textContent || '')) return 'All Levels Done';
        return 'Level Transition';
    }

    const screen0 = document.getElementById('screen-0');
    if (screen0 && !screen0.classList.contains('hidden')) return 'Pre-LBD';

    const target = document.querySelector('.target-amount');
    if (target) {
        const t = (target.textContent || '').trim();
        if (t === '₹12')  return 'Level 1';
        if (t === '₹25')  return 'Level 2';
        if (t === '₹50')  return 'Level 3';
        if (t === '₹100') return 'Level 4';
    }
    return 'Other';
}

// Best-effort CSS selector — display purpose only, not used to resolve elements.
function bestSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return 'body';
    if (el.id) return `#${el.id}`;
    if (el.classList && el.classList.length) {
        const classes = Array.from(el.classList)
            .filter(c => !c.startsWith('qa-') && c !== 'qa-hovered')
            .slice(0, 2);
        if (classes.length) return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
    }
    return el.tagName.toLowerCase();
}

function injectStylesheet() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'qa/qa-mode.css';
    document.head.appendChild(link);
}

const WELCOME_KEY = 'qa-welcome-seen-v1';
function hasSeenWelcome() {
    try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch { return false; }
}
function markWelcomeSeen() {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
}

// First-time intro modal explaining what QA mode is and how to use it.
// Also reachable any time via the "?" button in the sidebar header.
function showWelcomeModal() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'qa-name-modal qa-welcome-modal';
        modal.innerHTML = `
            <div class="qa-name-modal__card qa-welcome-card" role="dialog" aria-modal="true">
                <h3 class="qa-name-modal__title">Welcome to QA Mode</h3>
                <p class="qa-name-modal__sub">
                    A lightweight in-browser feedback tool, just for QA. Comments are stored
                    centrally so everyone reviewing the build sees the same notes.
                </p>
                <ul class="qa-welcome-list">
                    <li>
                        <strong>Drop a pin.</strong>
                        Hit <em>+ Comment</em> in the sidebar, then click any element on the page.
                        A popup opens; type your note and save. A numbered pin lands at that spot.
                    </li>
                    <li>
                        <strong>Status pills.</strong>
                        Each comment carries a status —
                        <span class="qa-pill qa-pill--open">Open</span>
                        <span class="qa-pill qa-pill--in_progress">In Progress</span>
                        <span class="qa-pill qa-pill--resolved">Resolved</span>
                        <span class="qa-pill qa-pill--wontfix">Won't Fix</span>.
                        Pin colours match.
                    </li>
                    <li>
                        <strong>Three roles.</strong>
                        <em>Owner</em> has full access. <em>QA</em> can triage status &amp; reply.
                        <em>Other</em> can comment and manage their own. Roles are gated by password.
                    </li>
                    <li>
                        <strong>Replies &amp; discussion.</strong>
                        Open any pin to view its thread and add replies.
                    </li>
                    <li>
                        <strong>Stay focused.</strong>
                        Turn <em>+ Comment</em> off any time to keep playing the game normally —
                        existing pins stay visible.
                    </li>
                </ul>
                <div class="qa-name-modal__actions">
                    <button class="qa-name-modal__btn qa-name-modal__btn--ok" type="button">Got it</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const okBtn = modal.querySelector('.qa-name-modal__btn--ok');
        const finish = () => { markWelcomeSeen(); modal.remove(); resolve(); };
        okBtn.addEventListener('click', finish);
        const onKey = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.stopPropagation();
                document.removeEventListener('keydown', onKey, true);
                finish();
            }
        };
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => okBtn.focus(), 50);
    });
}

// Lightweight transient toast — used for action failures + diagnostics.
let toastTimer = null;
function showToast(message, type = 'info', duration = 3500) {
    const existing = document.querySelector('.qa-toast');
    if (existing) { clearTimeout(toastTimer); existing.remove(); }
    const t = document.createElement('div');
    t.className = `qa-toast qa-toast--${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('qa-toast--show'));
    toastTimer = setTimeout(() => {
        t.classList.remove('qa-toast--show');
        setTimeout(() => t.remove(), 220);
    }, duration);
}

// Prompt for a free-text reason. Resolves with the trimmed string or null on cancel.
function promptReason({ title, message, label, placeholder = '', confirmLabel = 'Save', destructive = false }) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'qa-name-modal qa-confirm-modal';
        modal.innerHTML = `
            <div class="qa-name-modal__card" role="dialog" aria-modal="true">
                <h3 class="qa-name-modal__title"></h3>
                <p class="qa-name-modal__sub"></p>
                <label class="qa-name-modal__field">
                    <span class="qa-name-modal__label"></span>
                    <textarea class="qa-name-modal__input qa-name-modal__textarea" rows="3" maxlength="500"></textarea>
                </label>
                <div class="qa-name-modal__actions">
                    <button class="qa-name-modal__btn qa-name-modal__btn--cancel" type="button">Cancel</button>
                    <button class="qa-name-modal__btn ${destructive ? 'qa-name-modal__btn--danger' : 'qa-name-modal__btn--ok'}" type="button"></button>
                </div>
            </div>
        `;
        modal.querySelector('.qa-name-modal__title').textContent = title;
        modal.querySelector('.qa-name-modal__sub').textContent   = message;
        modal.querySelector('.qa-name-modal__label').textContent = label;
        const ta = modal.querySelector('.qa-name-modal__textarea');
        ta.placeholder = placeholder;
        const okBtn = modal.querySelector(destructive ? '.qa-name-modal__btn--danger' : '.qa-name-modal__btn--ok');
        okBtn.textContent = confirmLabel;
        const cancelBtn = modal.querySelector('.qa-name-modal__btn--cancel');

        document.body.appendChild(modal);

        const finish = (v) => {
            document.removeEventListener('keydown', onKey, true);
            modal.remove();
            resolve(v);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                const v = ta.value.trim();
                if (v) finish(v);
            }
        };
        document.addEventListener('keydown', onKey, true);

        okBtn.addEventListener('click', () => {
            const v = ta.value.trim();
            if (!v) { ta.classList.add('qa-name-modal__input--err'); ta.focus(); return; }
            finish(v);
        });
        cancelBtn.addEventListener('click', () => finish(null));
        ta.addEventListener('input', () => ta.classList.remove('qa-name-modal__input--err'));
        setTimeout(() => ta.focus(), 50);
    });
}

// Confirm modal — resolves true on confirm, false on cancel/Escape.
function confirmAction({ title, message, confirmLabel = 'Confirm', destructive = false }) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'qa-name-modal qa-confirm-modal';
        modal.innerHTML = `
            <div class="qa-name-modal__card" role="dialog" aria-modal="true">
                <h3 class="qa-name-modal__title"></h3>
                <p class="qa-name-modal__sub"></p>
                <div class="qa-name-modal__actions">
                    <button class="qa-name-modal__btn qa-name-modal__btn--cancel" type="button">Cancel</button>
                    <button class="qa-name-modal__btn ${destructive ? 'qa-name-modal__btn--danger' : 'qa-name-modal__btn--ok'}" type="button"></button>
                </div>
            </div>
        `;
        modal.querySelector('.qa-name-modal__title').textContent = title;
        modal.querySelector('.qa-name-modal__sub').textContent = message;
        const confirmBtn = modal.querySelector(destructive ? '.qa-name-modal__btn--danger' : '.qa-name-modal__btn--ok');
        const cancelBtn  = modal.querySelector('.qa-name-modal__btn--cancel');
        confirmBtn.textContent = confirmLabel;

        document.body.appendChild(modal);

        const finish = (result) => {
            document.removeEventListener('keydown', onKey, true);
            modal.remove();
            resolve(result);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
            if (e.key === 'Enter')  { e.stopPropagation(); finish(true); }
        };
        document.addEventListener('keydown', onKey, true);

        confirmBtn.addEventListener('click', () => finish(true));
        cancelBtn.addEventListener('click', () => finish(false));
        setTimeout(() => confirmBtn.focus(), 50);
    });
}

// Centered modal that collects the QA tester's name + role + (for power roles)
// password. Returns a Promise resolving to { name, role } on success, or null
// if cancelled in switch-mode. Password is stored separately via setPassword().
function showRoleModal({ initialName = '', initialRole = '', isSwitch = false } = {}) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'qa-name-modal';
        modal.innerHTML = `
            <div class="qa-name-modal__card" role="dialog" aria-modal="true">
                <h3 class="qa-name-modal__title"></h3>
                <p class="qa-name-modal__sub"></p>
                <label class="qa-name-modal__field">
                    <span class="qa-name-modal__label">Your name</span>
                    <input class="qa-name-modal__input qa-name-modal__input--name" type="text" placeholder="e.g. Piyush" maxlength="40" autocomplete="off" />
                </label>
                <label class="qa-name-modal__field">
                    <span class="qa-name-modal__label">Role</span>
                    <div class="qa-select-wrap">
                        <select class="qa-name-modal__input qa-name-modal__input--role qa-select">
                            <option value="other">Other — comment + edit own</option>
                            <option value="qa">QA — also change status &amp; reply</option>
                            <option value="owner">Owner — full access</option>
                        </select>
                    </div>
                </label>
                <label class="qa-name-modal__field qa-name-modal__field--password" hidden>
                    <span class="qa-name-modal__label">Password</span>
                    <div class="qa-pw-wrap">
                        <input class="qa-name-modal__input qa-name-modal__input--password" type="password" placeholder="Enter your role's password" autocomplete="current-password" />
                        <button class="qa-pw-toggle" type="button" tabindex="-1" aria-label="Show password" data-shown="false">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                                <path class="qa-pw-eye-on"  d="M12 5c-5 0-9.27 3.11-11 7.5 1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
                                <path class="qa-pw-eye-off" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.27-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75C21.27 8.11 17 5 12 5c-1.27 0-2.49.2-3.64.57l2.17 2.17C11.13 7.13 11.55 7 12 7zM2 4.27l2.28 2.28C2.94 7.6 1.93 9 1 10.5 2.73 14.89 7 18 12 18c1.55 0 3.03-.3 4.38-.84L19.73 21 21 19.73 3.27 3 2 4.27zM12 16a4 4 0 0 1-4-4c0-.55.1-1.08.27-1.57l5.3 5.3c-.49.17-1.02.27-1.57.27z" style="display:none"/>
                            </svg>
                        </button>
                    </div>
                </label>
                <div class="qa-name-modal__error" hidden></div>
                <div class="qa-name-modal__actions">
                    ${isSwitch ? '<button class="qa-name-modal__btn qa-name-modal__btn--cancel" type="button">Cancel</button>' : ''}
                    <button class="qa-name-modal__btn qa-name-modal__btn--ok" type="button"></button>
                </div>
            </div>
        `;
        modal.querySelector('.qa-name-modal__title').textContent =
            isSwitch ? 'Switch role' : 'Who’s reviewing?';
        modal.querySelector('.qa-name-modal__sub').textContent =
            isSwitch
                ? 'Change your role here. Past comments keep their original author.'
                : 'We’ll tag every comment with your name. Owner and QA roles need a password.';
        modal.querySelector('.qa-name-modal__btn--ok').textContent =
            isSwitch ? 'Switch' : 'Continue';

        document.body.appendChild(modal);

        const nameInput  = modal.querySelector('.qa-name-modal__input--name');
        const roleInput  = modal.querySelector('.qa-name-modal__input--role');
        const pwField    = modal.querySelector('.qa-name-modal__field--password');
        const pwInput    = modal.querySelector('.qa-name-modal__input--password');
        const errBox     = modal.querySelector('.qa-name-modal__error');
        const okBtn      = modal.querySelector('.qa-name-modal__btn--ok');
        const cancelBtn  = modal.querySelector('.qa-name-modal__btn--cancel');

        nameInput.value = initialName;
        if (initialRole) roleInput.value = initialRole;

        // Password show/hide toggle.
        const pwToggle = modal.querySelector('.qa-pw-toggle');
        const eyeOn   = modal.querySelector('.qa-pw-eye-on');
        const eyeOff  = modal.querySelector('.qa-pw-eye-off');
        pwToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const showing = pwInput.type === 'text';
            pwInput.type = showing ? 'password' : 'text';
            pwToggle.dataset.shown = showing ? 'false' : 'true';
            pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
            eyeOn.style.display  = showing ? '' : 'none';
            eyeOff.style.display = showing ? 'none' : '';
        });

        function refreshPasswordVisibility() {
            const showPw = roleInput.value === 'owner' || roleInput.value === 'qa';
            pwField.hidden = !showPw;
            if (!showPw) pwInput.value = '';
        }
        refreshPasswordVisibility();
        roleInput.addEventListener('change', refreshPasswordVisibility);

        function showErr(msg) {
            errBox.textContent = msg;
            errBox.hidden = false;
        }
        function clearErr() {
            errBox.hidden = true;
            errBox.textContent = '';
        }

        async function submit() {
            clearErr();
            const name = nameInput.value.trim();
            const role = roleInput.value;
            if (!name) {
                nameInput.classList.add('qa-name-modal__input--err');
                nameInput.focus();
                return;
            }
            nameInput.classList.remove('qa-name-modal__input--err');

            if (role === 'owner' || role === 'qa') {
                const pwd = pwInput.value;
                if (!pwd) {
                    pwInput.classList.add('qa-name-modal__input--err');
                    pwInput.focus();
                    return;
                }
                okBtn.disabled = true;
                okBtn.textContent = 'Verifying…';
                const verifiedRole = await verifyPassword(pwd);
                okBtn.disabled = false;
                okBtn.textContent = isSwitch ? 'Switch' : 'Continue';
                if (!verifiedRole) {
                    showErr("That password didn't match. Try again.");
                    pwInput.classList.add('qa-name-modal__input--err');
                    pwInput.focus();
                    pwInput.select();
                    return;
                }
                if (verifiedRole !== role) {
                    showErr(`That's not the ${role.toUpperCase()} password. Pick the matching role or enter the right password.`);
                    pwInput.classList.add('qa-name-modal__input--err');
                    pwInput.focus();
                    pwInput.select();
                    return;
                }
                setPassword(pwd);
                modal.remove();
                resolve({ name, role });
                return;
            }

            // "Other" — no password, just save name + role.
            setPassword('');
            modal.remove();
            resolve({ name, role: 'other' });
        }

        function cancel() {
            modal.remove();
            resolve(null);
        }

        okBtn.addEventListener('click', submit);
        if (cancelBtn) cancelBtn.addEventListener('click', cancel);

        [nameInput, pwInput].forEach((el) => {
            el.addEventListener('input', () => el.classList.remove('qa-name-modal__input--err'));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape' && isSwitch) cancel();
            });
        });

        setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
    });
}

async function init() {
    if (!isQAActive()) return;

    injectStylesheet();
    document.body.setAttribute('data-qa', 'true');

    // ── UI containers ───────────────────────────────────────────────
    const pinsContainer = document.createElement('div');
    pinsContainer.className = 'qa-pins';
    document.body.appendChild(pinsContainer);

    let popup;    // initialised below
    let sidebar;  // initialised below
    let lastHovered = null;
    let currentScreen = detectScreen();
    let frozenIntroRef = null; // the .level-intro-overlay we're holding still
    // OFF by default — game plays normally. Turn ON via the sidebar's
    // "+ Comment" button to start intercepting clicks.
    let interceptEnabled = false;

    function freezeOverlay(el) {
        if (!el || el === frozenIntroRef) return;
        frozenIntroRef = el;
        el.classList.add('qa-intro-frozen');
    }

    function clearFrozenOverlay() {
        if (!frozenIntroRef) return;
        frozenIntroRef.classList.remove('qa-intro-frozen');
        if (frozenIntroRef.parentElement) {
            frozenIntroRef.parentElement.removeChild(frozenIntroRef);
        }
        frozenIntroRef = null;
    }

    // Watches body for the cinematic intro overlay being added or removed.
    // While in comment mode: freeze any new intro, and re-attach the frozen
    // one if level-intro.js's 3.7s cleanup tries to take it away.
    const introObserver = new MutationObserver((mutations) => {
        if (!interceptEnabled) return;
        for (const m of mutations) {
            m.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.classList && node.classList.contains('level-intro-overlay')) {
                    freezeOverlay(node);
                }
            });
            m.removedNodes.forEach((node) => {
                if (node === frozenIntroRef) {
                    document.body.appendChild(frozenIntroRef);
                }
            });
        }
    });
    introObserver.observe(document.body, { childList: true });

    function setInterceptEnabled(on) {
        interceptEnabled = on;
        document.body.classList.toggle('qa-intercept-on', on);

        if (on) {
            // If an intro is already on screen when QA enters comment mode,
            // freeze it right away (the observer above will catch later ones).
            const existing = document.querySelector('.level-intro-overlay');
            if (existing) freezeOverlay(existing);
        } else {
            // Drop the frozen overlay so gameplay underneath becomes visible again.
            clearFrozenOverlay();
        }

        if (!on && lastHovered) {
            lastHovered.classList.remove('qa-hovered');
            lastHovered = null;
        }
        if (!on) popup.close();
    }

    function isQAUI(el) {
        if (!el) return false;
        if (popup && popup.isInside(el)) return true;
        if (sidebar && sidebar.isInside(el)) return true;
        if (pinsContainer.contains(el)) return true;
        if (el.closest && el.closest('.qa-name-modal')) return true;
        return false;
    }

    // Open the popup for an existing comment with full permission-aware UI
    // (status pill, reply thread, delete button, conditional read-only mode).
    function openExistingComment(c) {
        const editable    = canEditComment(c);
        const statusOK    = canChangeStatus();
        const replyOK     = canReply();
        const canDelReply = (r) => canEditComment(r);

        const replyHandlers = {
            canReply: replyOK,
            canDeleteReply: canDelReply,
            onReply: async (text) => {
                const newReply = await addComment({
                    selector: c.selector, x: c.x, y: c.y, text,
                    screen: c.screen, parentId: c.id,
                });
                if (!newReply) { showToast('Reply failed', 'error'); return; }
                popup.refreshReplies({ replies: getReplies(c.id), ...replyHandlers });
                sidebar.render(currentScreen);
            },
            onReplyDelete: async (replyId) => {
                const ok = await confirmAction({
                    title: 'Delete reply?',
                    message: 'This cannot be undone.',
                    confirmLabel: 'Delete',
                    destructive: true,
                });
                if (!ok) return;
                const result = await deleteComment(replyId);
                if (!result.ok) { showToast(result.error || 'Delete failed', 'error'); return; }
                popup.refreshReplies({ replies: getReplies(c.id), ...replyHandlers });
                sidebar.render(currentScreen);
            },
        };

        const currentStatus = c.status || 'open';

        popup.open({
            x: c.x, y: c.y,
            selector: c.selector,
            isNew: false,
            text: c.text,
            readOnly: !editable,
            canDelete: editable,
            status: currentStatus,
            canChangeStatus: statusOK,
            wontfixReason: c.wontfixReason || '',
            byline: `${c.author || 'Unknown'} · ${new Date(c.createdAt).toLocaleString()}`,
            replies: getReplies(c.id),
            ...replyHandlers,

            onSave: async (text) => {
                const result = await updateComment(c.id, { text });
                if (!result.ok) { showToast(result.error || 'Update failed', 'error'); return; }
                renderPins();
                sidebar.render(currentScreen);
            },
            onDelete: async () => {
                const ok = await confirmAction({
                    title: 'Delete comment?',
                    message: 'This will permanently remove the comment and all its replies.',
                    confirmLabel: 'Delete',
                    destructive: true,
                });
                if (!ok) return;
                const result = await deleteComment(c.id);
                if (!result.ok) {
                    const hint = (result.error && /authoris/i.test(result.error))
                        ? `${result.error}. If you rotated the password, hit ↺ to re-authenticate.`
                        : (result.error || 'Delete failed');
                    showToast(hint, 'error', 5500);
                    return;
                }
                popup.close();
                renderPins();
                sidebar.render(currentScreen);
            },
            onStatusChange: async (newStatus) => {
                const patch = { status: newStatus };

                if (newStatus === 'wontfix') {
                    const reason = await promptReason({
                        title: "Why won't this be fixed?",
                        message: 'A brief reason helps everyone reading later understand the call.',
                        label: 'Reason',
                        placeholder: 'e.g. Working as intended, out of scope, browser limitation…',
                        confirmLabel: "Mark as Won't Fix",
                        destructive: true,
                    });
                    if (!reason) {
                        // User cancelled — revert dropdown to whatever it was before.
                        popup.refreshStatus(c.status || 'open');
                        return;
                    }
                    patch.wontfix_reason = reason;
                } else if ((c.status || 'open') === 'wontfix') {
                    // Moving OFF wontfix clears any stale reason.
                    patch.wontfix_reason = null;
                }

                const result = await updateComment(c.id, patch);
                if (!result.ok) {
                    showToast(result.error || 'Status change failed', 'error');
                    popup.refreshStatus(c.status || 'open', c.wontfixReason || '');
                    return;
                }
                // Keep our local reference in sync so re-open shows the new state.
                c.status        = newStatus;
                c.wontfixReason = patch.wontfix_reason ?? null;
                popup.refreshStatus(newStatus, c.wontfixReason || '');
                renderPins();
                sidebar.render(currentScreen);
            },
        });
    }

    // Open the popup for a new comment (no status, no replies, just text).
    function openNewComment(x, y, selectorStr) {
        popup.open({
            x, y,
            selector: selectorStr,
            isNew: true,
            text: '',
            readOnly: false,
            canDelete: false,
            replies: [],
            canReply: false,
            onSave: async (text) => {
                const created = await addComment({
                    selector: selectorStr, x, y, text, screen: currentScreen,
                });
                if (!created) { showToast('Save failed', 'error'); return; }
                renderPins();
                sidebar.render(currentScreen);
            },
        });
    }

    // ── Pins ────────────────────────────────────────────────────────
    function renderPins() {
        pinsContainer.innerHTML = '';
        getCommentsForCurrentScreen(currentScreen).forEach((c, idx) => {
            const status = c.status || 'open';
            const pin = document.createElement('button');
            pin.className = `qa-pin qa-pin--status-${status}`;
            pin.type = 'button';
            pin.dataset.id = c.id;
            pin.style.left = c.x + 'px';
            pin.style.top  = c.y + 'px';
            pin.textContent = String(idx + 1);
            pin.title = c.text;
            pin.addEventListener('click', (e) => {
                e.stopPropagation();
                openExistingComment(c);
            });
            pinsContainer.appendChild(pin);
        });
    }

    function flashPin(id) {
        const pin = pinsContainer.querySelector(`.qa-pin[data-id="${id}"]`);
        if (!pin) return;
        pin.classList.remove('qa-pin--focus');
        void pin.offsetWidth;
        pin.classList.add('qa-pin--focus');
    }

    // ── Wire popup + sidebar ────────────────────────────────────────
    popup = createPopupModule();

    sidebar = createSidebarModule({
        onItemClick: (id) => {
            const c = findCommentById(id);
            if (!c) return;
            flashPin(id);
            openExistingComment(c);
        },
        onDelete: async (id) => {
            const ok = await confirmAction({
                title: 'Delete comment?',
                message: 'This will permanently remove the comment and all its replies.',
                confirmLabel: 'Delete',
                destructive: true,
            });
            if (!ok) return;
            const result = await deleteComment(id);
            if (!result.ok) {
                const hint = (result.error && /authoris/i.test(result.error))
                    ? `${result.error}. If you rotated the password, hit ↺ to re-authenticate.`
                    : (result.error || 'Delete failed');
                showToast(hint, 'error', 5500);
                return;
            }
            renderPins();
            sidebar.render(currentScreen);
            popup.close();
        },
        onInspectToggle: setInterceptEnabled,
        onShowHelp: () => { showWelcomeModal(); },
        onSwitchRole: async () => {
            const result = await showRoleModal({
                initialName: getAuthor(),
                initialRole: getRole(),
                isSwitch: true,
            });
            if (result) {
                setAuthor(result.name);
                setRole(result.role);
                // Permissions may have changed — drop any open popup so the
                // user can't act on stale UI from the previous role.
                popup.close();
                sidebar.setIdentity({ name: result.name, role: result.role });
                renderPins();
                sidebar.render(currentScreen);
            }
        },
    });

    // Pull the current set of comments from Supabase before first render.
    // If the network call fails the wrappers log + return [] so the UI still loads.
    await refreshComments();

    renderPins();
    sidebar.render(currentScreen);
    sidebar.setIdentity({ name: getAuthor() || '—', role: getRole() || '' });

    // First-visit welcome + identity collection. Welcome shows once per
    // browser (re-openable via the sidebar's "?" button); the role modal
    // shows whenever identity is missing or the saved password was cleared.
    const needsAuth =
        !getAuthor() ||
        !getRole() ||
        (isPowerRole(getRole()) && !hasSavedPassword());

    (async () => {
        if (!hasSeenWelcome()) {
            await showWelcomeModal();
        }
        if (needsAuth) {
            const result = await showRoleModal({
                initialName: getAuthor(),
                initialRole: getRole(),
                isSwitch: !!getAuthor(),
            });
            if (!result) return;
            setAuthor(result.name);
            setRole(result.role);
            sidebar.setIdentity({ name: result.name, role: result.role });
            renderPins();
            sidebar.render(currentScreen);
        }
    })();

    // Background sync — pick up comments posted by other reviewers without
    // requiring a page reload. 10s is plenty for a QA workflow; cheap because
    // it's a single SELECT scoped to this page.
    setInterval(async () => {
        await refreshComments();
        renderPins();
        sidebar.render(currentScreen);
    }, 10000);

    // Poll the DOM for screen changes (cheap; runs only while QA is active).
    // When the player advances a level or the cinematic intro shows/hides,
    // re-render pins + sidebar to match the new context.
    setInterval(() => {
        const detected = detectScreen();
        if (detected !== currentScreen) {
            currentScreen = detected;
            renderPins();
            sidebar.render(currentScreen);
        }
    }, 500);

    // ── Event interception (capture phase on document) ──────────────
    // Anything not inside QA UI gets its propagation stopped so game
    // handlers never see it. Drag-initiating events also get preventDefault
    // so native drag never starts.
    const BLOCKED = [
        'mousedown', 'mouseup', 'mousemove',
        'touchstart', 'touchmove', 'touchend',
        'dragstart', 'click',
    ];
    const DRAG_INITIATORS = new Set(['mousedown', 'touchstart', 'dragstart']);

    BLOCKED.forEach((evt) => {
        document.addEventListener(evt, (e) => {
            if (!interceptEnabled) return;        // play mode: let the game handle it
            if (isQAUI(e.target)) return;         // QA UI handles itself

            e.stopPropagation();
            if (DRAG_INITIATORS.has(evt)) e.preventDefault();

            if (evt === 'click') {
                openNewComment(e.clientX, e.clientY, bestSelector(e.target));
            }
        }, { capture: true, passive: false }); // capture + active so preventDefault works on touch events
    });

    // Hover highlight — only while in comment mode.
    document.addEventListener('mouseover', (e) => {
        if (!interceptEnabled) return;
        if (isQAUI(e.target)) return;
        if (lastHovered) lastHovered.classList.remove('qa-hovered');
        lastHovered = e.target;
        if (lastHovered && lastHovered !== document.body && lastHovered !== document.documentElement) {
            lastHovered.classList.add('qa-hovered');
        }
    }, true);

    document.addEventListener('mouseout', (e) => {
        if (e.target && e.target.classList) {
            e.target.classList.remove('qa-hovered');
        }
        if (lastHovered === e.target) lastHovered = null;
    }, true);

    // ESC closes the popup.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') popup.close();
    });

    // Surface a tiny diagnostic for QA testers.
    console.info('[QA] Mode active. Play normally; press "+ Comment" in the sidebar to drop pins.');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
