// Server-authoritative team_packages store. Mirrors catalogStore.js — every
// read/write hits Supabase directly. No localStorage. No JSON-blob round-trip.
// Each package is one row keyed by (team_id, package_id) so concurrent edits
// on different packages do not collide.

import { supabase } from '../config';

const PAGE_SIZE = 1000;

// Normalize a folder path: trim, strip leading/trailing slashes, collapse
// duplicate slashes, drop blank segments. Empty/null → null (Uncategorized).
const normalizeFolder = (folder) => {
    if (folder == null) return null;
    const cleaned = String(folder)
        .split('/')
        .map(s => s.trim())
        .filter(Boolean)
        .join('/');
    return cleaned || null;
};

const toDb = (pkg, teamId, userId) => ({
    team_id: teamId,
    package_id: pkg.id,
    name: pkg.name || 'Unnamed Package',
    scope: 'catalog',
    version: pkg.version ?? 1,
    items: pkg.items || [],
    folder: normalizeFolder(pkg.folder),
    deleted: !!pkg.deleted,
    updated_by: userId ?? null,
});

export const rowToPackage = (row) => ({
    id: row.package_id,
    name: row.name || '',
    scope: 'catalog',
    version: Number(row.version) || 1,
    items: Array.isArray(row.items) ? row.items : [],
    folder: row.folder || null,
    deleted: !!row.deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

// Load every (non-deleted) package for a team. Paginated so growth past 1000
// is safe.
export async function loadPackages(teamId, { includeDeleted = false } = {}) {
    if (!teamId) throw new Error('loadPackages: teamId required');
    const out = [];
    let from = 0;
    for (;;) {
        let q = supabase
            .from('team_packages')
            .select('*')
            .eq('team_id', teamId)
            .order('package_id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (!includeDeleted) q = q.eq('deleted', false);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        out.push(...data.map(rowToPackage));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return out;
}

// Upsert a single package. Returns the canonical row.
export async function upsertPackage(teamId, pkg, userId) {
    if (!teamId) throw new Error('upsertPackage: teamId required');
    if (!pkg?.id) throw new Error('upsertPackage: pkg.id required');
    const { data, error } = await supabase
        .from('team_packages')
        .upsert(toDb(pkg, teamId, userId), { onConflict: 'team_id,package_id' })
        .select()
        .single();
    if (error) throw error;
    return rowToPackage(data);
}

// Bulk upsert — for migrations or multi-edit operations.
export async function bulkUpsertPackages(teamId, pkgs, userId) {
    if (!teamId) throw new Error('bulkUpsertPackages: teamId required');
    if (!pkgs?.length) return [];
    const out = [];
    for (let i = 0; i < pkgs.length; i += PAGE_SIZE) {
        const chunk = pkgs.slice(i, i + PAGE_SIZE).map(p => toDb(p, teamId, userId));
        const { data, error } = await supabase
            .from('team_packages')
            .upsert(chunk, { onConflict: 'team_id,package_id' })
            .select();
        if (error) throw error;
        out.push(...(data || []).map(rowToPackage));
    }
    return out;
}

// Hard delete — packages are infrequently deleted and undo'ing a delete is
// out of scope. If you want soft-delete later, swap to UPDATE deleted=true.
export async function deletePackage(teamId, packageId) {
    if (!teamId) throw new Error('deletePackage: teamId required');
    if (!packageId) throw new Error('deletePackage: packageId required');
    const { error } = await supabase
        .from('team_packages')
        .delete()
        .eq('team_id', teamId)
        .eq('package_id', packageId);
    if (error) throw error;
}
