// Server-authoritative project store. Projects are stored as a JSON blob in the
// `data` column, scoped by team_id when on a team, else user_id.

import { supabase } from '../config';

// Load all projects for the active scope (team if present, else user).
export async function loadProjects({ teamId, userId }) {
    if (!teamId && !userId) throw new Error('loadProjects: teamId or userId required');
    let q = supabase
        .from('projects')
        .select('id, data, updated_at, checked_out_by, checked_out_at, checked_out_email');
    q = teamId ? q.eq('team_id', teamId) : q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(row => ({
        ...row.data,
        id: row.id,
        updatedAt: row.updated_at,
        checkedOutBy: row.checked_out_by,
        checkedOutAt: row.checked_out_at,
        checkedOutEmail: row.checked_out_email,
    }));
}

// Upsert a single project. The project's full state lives in `data`.
export async function upsertProject(project, { teamId, userId }) {
    if (!project?.id) throw new Error('upsertProject: project.id required');
    if (!userId) throw new Error('upsertProject: userId required');
    const payload = {
        id: project.id,
        user_id: userId,
        team_id: teamId || null,
        data: project,
        updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('projects').upsert(payload);
    if (error) throw error;
}

// Hard delete a project.
export async function deleteProject(projectId) {
    if (!projectId) throw new Error('deleteProject: projectId required');
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw error;
}
