// Supabase Edge Function: qa-action
//
// Gatekeeper for privileged QA operations (UPDATE / DELETE / status changes).
// The client sends { password, action, payload }. We verify the password
// against env vars OWNER_PASSWORD / QA_PASSWORD (set in the Supabase
// dashboard — never in source or in the repo), then use the service_role
// key to perform the operation, bypassing the table's RLS policies.
//
// Endpoints:
//   POST /qa-action { password, action: 'verify' }
//     → returns { role: 'owner' | 'qa' }  (401 on bad password)
//
//   POST /qa-action { password, action: 'update_comment',
//                     payload: { id, text?, status? } }
//     → returns { ok: true, row: <updated> }
//
//   POST /qa-action { password, action: 'delete_comment',
//                     payload: { id } }
//     → returns { ok: true }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function verifyPassword(pwd: string): 'owner' | 'qa' | null {
    if (!pwd) return null;
    if (pwd === Deno.env.get('OWNER_PASSWORD')) return 'owner';
    if (pwd === Deno.env.get('QA_PASSWORD'))    return 'qa';
    return null;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    let body: {
        password?: string;
        author?: string;
        action?: string;
        payload?: any;
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }

    const { password, author, action, payload } = body;
    const role = verifyPassword(password || '');

    // 'verify' is the login check. It requires a valid password (no self-action
    // fallback — there's nothing to "log in" with for "Others").
    if (action === 'verify') {
        if (!role) return json({ error: 'Invalid password' }, 401);
        return json({ role });
    }

    // For DB operations: either a valid power-role password, or a self-action
    // (the caller's `author` matches the comment's stored author).
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Helper: fetch the target comment to check ownership for self-actions.
    async function getCommentAuthor(id: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('qa_comments')
            .select('author')
            .eq('id', id)
            .maybeSingle();
        if (error || !data) return null;
        return data.author ?? null;
    }

    // Permission helpers for this request.
    const isOwner = role === 'owner';
    const isPower = role === 'owner' || role === 'qa';

    try {
        switch (action) {
            case 'delete_comment': {
                if (!payload?.id) return json({ error: 'Missing id' }, 400);
                // Only Owner can delete arbitrary comments. QA + Other can
                // only delete their own (verified by matching author).
                if (!isOwner) {
                    if (!author) return json({ error: 'Not authorised' }, 403);
                    const ownerName = await getCommentAuthor(payload.id);
                    if (ownerName !== author) {
                        return json({ error: "Only Owner can delete others' comments" }, 403);
                    }
                }
                const { error } = await supabase
                    .from('qa_comments')
                    .delete()
                    .eq('id', payload.id);
                if (error) throw error;
                return json({ ok: true });
            }
            case 'update_comment': {
                if (!payload?.id) return json({ error: 'Missing id' }, 400);
                const { id, ...patch } = payload;
                const allowed: Record<string, unknown> = {};
                if ('text'           in patch) allowed.text           = patch.text;
                if ('status'         in patch) allowed.status         = patch.status;
                if ('wontfix_reason' in patch) allowed.wontfix_reason = patch.wontfix_reason;
                if (Object.keys(allowed).length === 0) {
                    return json({ error: 'No allowed fields to update' }, 400);
                }

                // Status changes need OWNER or QA.
                if ('status' in allowed && !isPower) {
                    return json({ error: 'Only Owner/QA can change status' }, 403);
                }
                // Text edits on others' comments need OWNER.
                if ('text' in allowed && !isOwner) {
                    if (!author) return json({ error: 'Not authorised' }, 403);
                    const ownerName = await getCommentAuthor(id);
                    if (ownerName !== author) {
                        return json({ error: "Only Owner can edit others' comments" }, 403);
                    }
                }

                const { data, error } = await supabase
                    .from('qa_comments')
                    .update(allowed)
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                return json({ ok: true, row: data });
            }
            default:
                return json({ error: 'Unknown action' }, 400);
        }
    } catch (err) {
        return json({ error: (err as Error).message || 'Internal error' }, 500);
    }
});
