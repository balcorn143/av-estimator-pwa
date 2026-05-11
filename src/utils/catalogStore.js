// Server-authoritative catalog store. All reads/writes hit Supabase directly.
// No localStorage. No delta merge. The DB is the catalog.

import { supabase } from '../config';

const PAGE_SIZE = 1000;

const toDb = (item, teamId, userId) => ({
    team_id: teamId,
    item_id: item.id,
    manufacturer: item.manufacturer ?? null,
    model: item.model ?? null,
    part_number: item.partNumber ?? null,
    description: item.description ?? null,
    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
    unit_cost: item.unitCost ?? 0,
    labor_hrs_per_unit: item.laborHrsPerUnit ?? 0,
    uom: item.uom ?? null,
    vendor: item.vendor ?? null,
    phase: item.phase ?? null,
    notes: item.notes ?? null,
    catalog_note: item.catalogNote ?? null,
    discontinued: !!item.discontinued,
    deleted: !!item.deleted,
    updated_by: userId ?? null,
});

export const rowToItem = (row) => ({
    id: row.item_id,
    manufacturer: row.manufacturer || '',
    model: row.model || '',
    partNumber: row.part_number || '',
    description: row.description || '',
    category: row.category || '',
    subcategory: row.subcategory || '',
    unitCost: Number(row.unit_cost) || 0,
    laborHrsPerUnit: Number(row.labor_hrs_per_unit) || 0,
    uom: row.uom || '',
    vendor: row.vendor || '',
    phase: row.phase || '',
    notes: row.notes || '',
    catalogNote: row.catalog_note || '',
    discontinued: !!row.discontinued,
    deleted: !!row.deleted,
    modifiedAt: row.updated_at,
});

// Load the entire catalog for a team. Paginates so growth past 1000 items is safe.
// By default excludes soft-deleted rows.
export async function loadCatalog(teamId, { includeDeleted = false } = {}) {
    if (!teamId) throw new Error('loadCatalog: teamId required');
    const out = [];
    let from = 0;
    for (;;) {
        let q = supabase
            .from('catalog_items')
            .select('*')
            .eq('team_id', teamId)
            .order('item_id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (!includeDeleted) q = q.eq('deleted', false);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        out.push(...data.map(rowToItem));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return out;
}

// Upsert a single item. Returns the canonical row from the DB.
export async function upsertItem(teamId, item, userId) {
    if (!teamId) throw new Error('upsertItem: teamId required');
    if (!item?.id) throw new Error('upsertItem: item.id required');
    const { data, error } = await supabase
        .from('catalog_items')
        .upsert(toDb(item, teamId, userId), { onConflict: 'team_id,item_id' })
        .select()
        .single();
    if (error) throw error;
    return rowToItem(data);
}

// Bulk upsert — used by CSV import, multi-select edits, and the one-time migration.
export async function bulkUpsert(teamId, items, userId) {
    if (!teamId) throw new Error('bulkUpsert: teamId required');
    if (!items?.length) return [];
    const out = [];
    for (let i = 0; i < items.length; i += PAGE_SIZE) {
        const chunk = items.slice(i, i + PAGE_SIZE).map(it => toDb(it, teamId, userId));
        const { data, error } = await supabase
            .from('catalog_items')
            .upsert(chunk, { onConflict: 'team_id,item_id' })
            .select();
        if (error) throw error;
        out.push(...(data || []).map(rowToItem));
    }
    return out;
}

// Soft delete — sets deleted=true. Item stays in the table for audit/restore.
export async function deleteItem(teamId, itemId, userId) {
    if (!teamId) throw new Error('deleteItem: teamId required');
    if (!itemId) throw new Error('deleteItem: itemId required');
    const { error } = await supabase
        .from('catalog_items')
        .update({ deleted: true, updated_by: userId ?? null })
        .eq('team_id', teamId)
        .eq('item_id', itemId);
    if (error) throw error;
}

// Bulk soft delete.
export async function bulkDelete(teamId, itemIds, userId) {
    if (!teamId) throw new Error('bulkDelete: teamId required');
    if (!itemIds?.length) return;
    const { error } = await supabase
        .from('catalog_items')
        .update({ deleted: true, updated_by: userId ?? null })
        .eq('team_id', teamId)
        .in('item_id', itemIds);
    if (error) throw error;
}

// True if this team has no catalog rows yet — triggers first-run seeding.
export async function isCatalogEmpty(teamId) {
    if (!teamId) throw new Error('isCatalogEmpty: teamId required');
    const { count, error } = await supabase
        .from('catalog_items')
        .select('item_id', { count: 'exact', head: true })
        .eq('team_id', teamId);
    if (error) throw error;
    return (count ?? 0) === 0;
}
