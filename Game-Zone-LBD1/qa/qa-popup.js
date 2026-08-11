// QA comment popup — factory that builds a rich popup with:
//   • main comment (editable or read-only)
//   • status pill (read-only or dropdown for Owner/QA)
//   • delete button (when allowed)
//   • reply thread + reply input (when allowed)
//
// All behaviour is driven by params passed to open(); the caller decides
// what's allowed.

const POPUP_W = 320;

const STATUS_LABELS = {
    open:         'Open',
    in_progress:  'In Progress',
    resolved:     'Resolved',
    wontfix:      "Won't Fix",
};
const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'wontfix'];

function fmtTime(ts) {
    return new Date(ts).toLocaleString();
}

export function createPopupModule() {
    let popupEl = null;
    let currentParams = null;
    let outsideClickHandler = null;

    function detachOutsideClick() {
        if (outsideClickHandler) {
            document.removeEventListener('click', outsideClickHandler);
            outsideClickHandler = null;
        }
    }
    function attachOutsideClick() {
        detachOutsideClick();
        outsideClickHandler = (e) => {
            if (!popupEl) return;
            if (popupEl.contains(e.target)) return;
            // Don't close on clicks landing on other QA UI (sidebar, pins, modals, toast, mute btn).
            if (e.target.closest?.('.qa-pin, .qa-sidebar, .qa-name-modal, .qa-toast, .qa-pins')) return;
            close();
        };
        // Defer so the click that opened the popup doesn't immediately close it.
        setTimeout(() => {
            if (popupEl) document.addEventListener('click', outsideClickHandler);
        }, 30);
    }

    function close() {
        detachOutsideClick();
        if (popupEl?.parentElement) popupEl.parentElement.removeChild(popupEl);
        popupEl = null;
        currentParams = null;
    }

    function build(params) {
        const {
            selector,
            isNew = false,
            text = '',
            readOnly = false,
            canDelete = false,
            status = 'open',
            canChangeStatus = false,
            wontfixReason = '',
            byline = '',
            replies = [],
            canReply = false,
            canDeleteReply = () => false,
            onSave,
            onDelete,
            onStatusChange,
            onReply,
            onReplyDelete,
        } = params;

        const el = document.createElement('div');
        el.className = 'qa-popup'
            + (readOnly ? ' qa-popup--readonly' : '')
            + (isNew    ? ' qa-popup--new'      : '');

        // ── Header ─────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'qa-popup__header';

        const label = document.createElement('div');
        label.className = 'qa-popup__label';
        label.innerHTML = 'Comment on: <code></code>';
        label.querySelector('code').textContent = selector || '(unknown)';
        header.appendChild(label);

        if (!isNew) {
            header.appendChild(buildStatusPill(status, canChangeStatus, onStatusChange));
        }
        el.appendChild(header);

        // ── Byline (existing only) ─────────────────────────────────
        if (byline) {
            const b = document.createElement('div');
            b.className = 'qa-popup__byline';
            b.textContent = byline;
            el.appendChild(b);
        }

        // ── Won't Fix reason (only if status is wontfix and reason set) ──
        if (!isNew && status === 'wontfix' && wontfixReason) {
            const box = document.createElement('div');
            box.className = 'qa-popup__wontfix';
            box.innerHTML = '<span class="qa-popup__wontfix-label">Reason</span><span class="qa-popup__wontfix-text"></span>';
            box.querySelector('.qa-popup__wontfix-text').textContent = wontfixReason;
            el.appendChild(box);
        }

        // ── Comment textarea ──────────────────────────────────────
        const ta = document.createElement('textarea');
        ta.className = 'qa-popup__text';
        ta.placeholder = isNew ? 'Type your comment...' : '';
        ta.value = text;
        if (readOnly) ta.readOnly = true;
        el.appendChild(ta);

        // ── Action buttons row ────────────────────────────────────
        const actions = document.createElement('div');
        actions.className = 'qa-popup__actions';

        if (!isNew && canDelete) {
            const del = document.createElement('button');
            del.className = 'qa-btn qa-btn--del';
            del.type = 'button';
            del.textContent = 'Delete';
            del.addEventListener('click', () => onDelete?.());
            actions.appendChild(del);
        }
        const spacer = document.createElement('div');
        spacer.className = 'qa-popup__actions-spacer';
        actions.appendChild(spacer);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'qa-btn qa-btn--cancel';
        cancelBtn.type = 'button';
        cancelBtn.textContent = readOnly && !isNew ? 'Close' : 'Cancel';
        cancelBtn.addEventListener('click', close);
        actions.appendChild(cancelBtn);

        if (!readOnly) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'qa-btn qa-btn--save';
            saveBtn.type = 'button';
            saveBtn.textContent = isNew ? 'Save' : 'Update';
            saveBtn.addEventListener('click', () => attemptSave(ta));
            actions.appendChild(saveBtn);

            ta.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') attemptSave(ta);
            });
        }
        el.appendChild(actions);

        // ── Replies + reply input (existing only) ─────────────────
        if (!isNew && (replies.length > 0 || canReply)) {
            const section = buildRepliesSection({
                replies, canReply, canDeleteReply, onReply, onReplyDelete,
            });
            el.appendChild(section);
        }

        function attemptSave(textarea) {
            const t = textarea.value.trim();
            if (!t) { close(); return; }
            onSave?.(t);
            close();
        }

        return el;
    }

    function buildStatusPill(status, canChange, onStatusChange) {
        if (!canChange) {
            const pill = document.createElement('span');
            pill.className = `qa-status-pill qa-status-pill--${status}`;
            pill.textContent = STATUS_LABELS[status] || status;
            return pill;
        }
        const select = document.createElement('select');
        select.className = `qa-status-select qa-status-pill--${status}`;
        STATUS_ORDER.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s;
            opt.textContent = STATUS_LABELS[s];
            select.appendChild(opt);
        });
        select.value = status;
        select.addEventListener('change', () => {
            const next = select.value;
            // Update the visual class immediately for snappy feedback.
            select.className = `qa-status-select qa-status-pill--${next}`;
            onStatusChange?.(next);
        });
        return select;
    }

    function buildRepliesSection({ replies, canReply, canDeleteReply, onReply, onReplyDelete }) {
        const wrap = document.createElement('div');
        wrap.className = 'qa-popup__replies';

        if (replies.length > 0) {
            const head = document.createElement('div');
            head.className = 'qa-popup__replies-head';
            head.textContent = `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`;
            wrap.appendChild(head);

            const list = document.createElement('div');
            list.className = 'qa-popup__reply-list';
            replies.forEach(r => list.appendChild(buildReply(r, canDeleteReply, onReplyDelete)));
            wrap.appendChild(list);
        }

        if (canReply) {
            const inputWrap = document.createElement('div');
            inputWrap.className = 'qa-popup__reply-input';
            inputWrap.innerHTML = `
                <textarea class="qa-popup__reply-textarea" placeholder="Write a reply..."></textarea>
                <button class="qa-btn qa-btn--reply" type="button">Send</button>
            `;
            const replyTa = inputWrap.querySelector('textarea');
            const sendBtn = inputWrap.querySelector('button');
            const send = () => {
                const t = replyTa.value.trim();
                if (!t) return;
                onReply?.(t);
                replyTa.value = '';
            };
            sendBtn.addEventListener('click', send);
            replyTa.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
            });
            wrap.appendChild(inputWrap);
        }

        return wrap;
    }

    function buildReply(r, canDeleteReply, onReplyDelete) {
        const item = document.createElement('div');
        item.className = 'qa-popup__reply';
        item.dataset.id = r.id;
        item.innerHTML = `
            <div class="qa-popup__reply-head">
                <span class="qa-popup__reply-meta"></span>
                <button class="qa-popup__reply-del" type="button" title="Delete">×</button>
            </div>
            <div class="qa-popup__reply-text"></div>
        `;
        item.querySelector('.qa-popup__reply-meta').textContent =
            `${r.author || 'Unknown'} · ${fmtTime(r.createdAt)}`;
        item.querySelector('.qa-popup__reply-text').textContent = r.text;

        const delBtn = item.querySelector('.qa-popup__reply-del');
        if (canDeleteReply(r)) {
            delBtn.addEventListener('click', () => onReplyDelete?.(r.id));
        } else {
            delBtn.style.display = 'none';
        }
        return item;
    }

    function position(x, y) {
        if (!popupEl) return;
        const w = popupEl.offsetWidth  || POPUP_W;
        const h = popupEl.offsetHeight || 220;
        let px = x + 12;
        let py = y + 12;
        if (px + w > window.innerWidth  - 8) px = x - w - 12;
        if (py + h > window.innerHeight - 8) py = Math.max(8, window.innerHeight - h - 8);
        if (px < 8) px = 8;
        if (py < 8) py = 8;
        popupEl.style.left = px + 'px';
        popupEl.style.top  = py + 'px';
    }

    function open(params) {
        close();
        currentParams = params;
        popupEl = build(params);
        document.body.appendChild(popupEl);
        position(params.x, params.y);
        attachOutsideClick();

        if (!params.readOnly) {
            popupEl.querySelector('.qa-popup__text')?.focus();
        } else if (params.canReply) {
            popupEl.querySelector('.qa-popup__reply-textarea')?.focus();
        }
    }

    // Rebuild only the replies section in-place (e.g., after a new reply
    // is added or deleted).
    function refreshReplies({ replies, canReply, canDeleteReply, onReply, onReplyDelete }) {
        if (!popupEl) return;
        const existing = popupEl.querySelector('.qa-popup__replies');
        if (existing) existing.remove();
        if (replies.length > 0 || canReply) {
            const section = buildRepliesSection({
                replies, canReply, canDeleteReply, onReply, onReplyDelete,
            });
            popupEl.appendChild(section);
        }
        position(currentParams?.x ?? 100, currentParams?.y ?? 100);
    }

    function isInside(el) {
        return !!(popupEl && el && popupEl.contains(el));
    }

    // Sync the status pill/select AND the Won't Fix reason block in place,
    // so the popup reflects the new state without a full rebuild.
    function refreshStatus(newStatus, newWontfixReason = '') {
        if (!popupEl) return;

        const pill = popupEl.querySelector('.qa-status-pill, .qa-status-select');
        if (pill) {
            if (pill.tagName === 'SELECT') {
                pill.value = newStatus;
                pill.className = `qa-status-select qa-status-pill--${newStatus}`;
            } else {
                pill.className = `qa-status-pill qa-status-pill--${newStatus}`;
                pill.textContent = STATUS_LABELS[newStatus] || newStatus;
            }
        }

        const existing = popupEl.querySelector('.qa-popup__wontfix');
        if (newStatus === 'wontfix' && newWontfixReason) {
            if (existing) {
                existing.querySelector('.qa-popup__wontfix-text').textContent = newWontfixReason;
            } else {
                const box = document.createElement('div');
                box.className = 'qa-popup__wontfix';
                box.innerHTML = '<span class="qa-popup__wontfix-label">Reason</span><span class="qa-popup__wontfix-text"></span>';
                box.querySelector('.qa-popup__wontfix-text').textContent = newWontfixReason;
                // Insert right after the byline (if any), otherwise before the textarea.
                const byline = popupEl.querySelector('.qa-popup__byline');
                const text   = popupEl.querySelector('.qa-popup__text');
                if (byline && byline.parentNode) byline.parentNode.insertBefore(box, byline.nextSibling);
                else if (text)                  text.parentNode.insertBefore(box, text);
                else                            popupEl.appendChild(box);
            }
        } else if (existing) {
            existing.remove();
        }
    }

    return { open, close, isInside, refreshReplies, refreshStatus };
}
