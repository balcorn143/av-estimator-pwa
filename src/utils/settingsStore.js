// Server-authoritative settings store. Holds packages + templates per scope
// (team if present, else user) in the existing `user_settings` table.

import { supabase } from '../config';

// Load packages, templates, and uom_options for the active scope. Returns null
// if no row exists.
export async function loadSettings({ teamId, userId }) {
    if (!teamId && !userId) throw new Error('loadSettings: teamId or userId required');
    let q = supabase.from('user_settings').select('packages, templates, uom_options, updated_at');
    q = teamId ? q.eq('team_id', teamId) : q.eq('user_id', userId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        packages: data.packages || [],
        templates: data.templates || {},
        uomOptions: data.uom_options || null,
        updatedAt: data.updated_at,
    };
}

// Upsert packages, templates, and uom_options for the active scope.
export async function upsertSettings({ packages, templates, uomOptions }, { teamId, userId }) {
    if (!userId) throw new Error('upsertSettings: userId required');
    const payload = {
        user_id: userId,
        team_id: teamId || null,
        packages: packages || [],
        templates: templates || {},
        uom_options: uomOptions ?? null,
        updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('user_settings').upsert(payload);
    if (error) throw error;
}
