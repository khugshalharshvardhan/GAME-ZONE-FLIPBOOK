// QA storage layer.
//   • Identity (name, role, and the Owner/QA password) is per-browser in localStorage.
//   • Comments live in Supabase. A small cache lets the renderer stay synchronous;
//     mutations refresh the cache after the network round-trip.
//
// Comment shape: { id, selector, x, y, text, page, screen, author,
//                  parentId, status, createdAt }

import {
    fetchComments,
    insertComment,
    updateCommentRow,
    deleteCommentRow,
    verifyPassword,
} from './qa-supabase.js';

const AUTHOR_KEY    = 'qa-author-name';
const ROLE_KEY      = 'qa-role';
const PASSWORD_KEY  = 'qa-password';

// ── Author identity ─────────────────────────────────────────────────
export function getAuthor() {
    try { return localStorage.getItem(AUTHOR_KEY) || ''; } catch { return ''; }
}
export function setAuthor(name) {
    try { name ? localStorage.setItem(AUTHOR_KEY, name) : localStorage.removeItem(AUTHOR_KEY); }
    catch (e) { console.warn('[QA] cannot save author', e); }
}

// ── Role identity ───────────────────────────────────────────────────
export function getRole() {
    try { return localStorage.getItem(ROLE_KEY) || ''; } catch { return ''; }
}
export function setRole(role) {
    try { role ? localStorage.setItem(ROLE_KEY, role) : localStorage.removeItem(ROLE_KEY); }
    catch (e) { console.warn('[QA] cannot save role', e); }
}

// ── Password (Owner/QA only) ────────────────────────────────────────
function getPassword() {
    try { return localStorage.getItem(PASSWORD_KEY) || ''; } catch { return ''; }
}
export function setPassword(pwd) {
    try { pwd ? localStorage.setItem(PASSWORD_KEY, pwd) : localStorage.removeItem(PASSWORD_KEY); }
    catch (e) { console.warn('[QA] cannot save password', e); }
}
export function hasSavedPassword() {
    return !!getPassword();
}

export function clearSession() {
    setAuthor('');
    setRole('');
    setPassword('');
}

export const isPowerRole = (role) => role === 'owner' || role === 'qa';

export { verifyPassword };

// ── Permission helpers ──────────────────────────────────────────────
// Only OWNER can edit/delete arbitrary comments. QA and Other can only
// touch their own. Status changes are open to OWNER + QA; everyone can reply.
export function canEditComment(comment) {
    const role = getRole();
    if (role === 'owner') return true;
    return comment && comment.author === getAuthor();
}
export function canChangeStatus() {
    return isPowerRole(getRole()); // owner or qa
}
export function canReply() {
    return !!getAuthor();
}

// ── Comment cache + Supabase sync ───────────────────────────────────
let cachedComments = [];

export async function refreshComments() {
    cachedComments = await fetchComments({ page: location.pathname });
    return cachedComments;
}

// Top-level comments only — replies are nested.
export function getCommentsForCurrentScreen(screen) {
    return cachedComments.filter(c => c.screen === screen && !c.parentId);
}

export function findCommentById(id) {
    return cachedComments.find(c => c.id === id) || null;
}

export function getReplies(commentId) {
    return cachedComments
        .filter(c => c.parentId === commentId)
        .sort((a, b) => a.createdAt - b.createdAt);
}

export async function addComment({ selector, x, y, text, screen, parentId }) {
    const entry = await insertComment({
        selector, x, y, text,
        page:   location.pathname,
        screen: screen || 'Other',
        author: getAuthor() || 'Anonymous',
        parentId,
    });
    if (entry) cachedComments.push(entry);
    return entry;
}

// Privileged mutations now return { ok, error?, row? } so callers can show a toast.
export async function updateComment(id, patch) {
    const role = getRole();
    const result = await updateCommentRow(id, patch, {
        password: isPowerRole(role) ? getPassword() : undefined,
        author:   getAuthor() || undefined,
    });
    if (result.ok && result.row) {
        const idx = cachedComments.findIndex(c => c.id === id);
        if (idx !== -1) cachedComments[idx] = result.row;
    }
    return result;
}

export async function deleteComment(id) {
    const role = getRole();
    const result = await deleteCommentRow(id, {
        password: isPowerRole(role) ? getPassword() : undefined,
        author:   getAuthor() || undefined,
    });
    if (result.ok) {
        // Also drop any cached replies tied to this comment.
        cachedComments = cachedComments.filter(c => c.id !== id && c.parentId !== id);
    }
    return result;
}
