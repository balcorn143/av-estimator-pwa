// Team-scoped settings store: templates + uom_options live on one row per
// team. Replaces the per-user user_settings approach that produced duplicate
// rows and silent overwrites.

import { supabase } from '../config';

export async function loadTeamSettings(teamId) {
    if (!teamId) throw new Error('loadTeamSettings: teamId required');
    const { data, error } = await supabase
        .from('team_settings')
        .select('templates, uom_options, updated_at')
        .eq('team_id', teamId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
        templates: data.templates ?? [],
        uomOptions: data.uom_options ?? null,
        updatedAt: data.updated_at,
    };
}

export async function upsertTeamSettings({ templates, uomOptions }, { teamId, userId }) {
    if (!teamId) throw new Error('upsertTeamSettings: teamId required');
    const payload = {
        team_id: teamId,
        templates: templates ?? [],
        uom_options: uomOptions ?? null,
        updated_by: userId ?? null,
    };
    const { error } = await supabase
        .from('team_settings')
        .upsert(payload, { onConflict: 'team_id' });
    if (error) throw error;
}
