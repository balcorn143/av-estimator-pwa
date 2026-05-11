// One-time client-side migration from the old localStorage-primary model to the
// new Supabase-authoritative model. Idempotent — safe to re-run.
//
// Three independent pieces:
//   1. Seed `catalog_items` for the user's team if empty (prefers localStorage,
//      falls back to base JSON + legacy `catalog_customizations`).
//   2. Push any localStorage-only projects up to Supabase.
//   3. Push localStorage packages/templates up to `user_settings` if the
//      remote row is empty.
//
// Each piece is independently idempotent; if any one throws, the migration
// flag is NOT set and the whole thing retries on next load.

import { supabase, CONFIG, getDataUrl } from '../config';
import { bulkUpsert as bulkUpsertCatalog, isCatalogEmpty } from './catalogStore';
import { loadProjects, upsertProject } from './projectStore';
import { loadSettings, upsertSettings } from './settingsStore';
import { migrateProjectPhases, migratePackagePhases } from './catalog';
import { migratePackageDefinitions } from './packages';

const MIGRATION_FLAG = 'av-estimator-migrated-v53';

// Build a catalog from the base JSON, applying any rows from the legacy
// `catalog_customizations` table. Used only when there's no localStorage to seed from.
async function buildCatalogFromLegacy(teamId) {
    const response = await fetch(getDataUrl(CONFIG.CATALOG_FILE));
    if (!response.ok) throw new Error('migration: failed to fetch base catalog');
    const base = await response.json();

    const { data: customs } = await supabase
        .from('catalog_customizations')
        .select('*')
        .eq('team_id', teamId)
        .limit(5000);

    if (!customs?.length) return base;

    const customMap = {};
    customs.forEach(c => { customMap[c.catalog_item_id] = c; });
    const merged = base.map(item => {
        const c = customMap[item.id];
        if (!c) return item;
        let m = { ...item, catalogNote: c.catalog_note, deleted: !!c.deleted };
        if (c.custom_fields) {
            try {
                const fields = typeof c.custom_fields === 'string' ? JSON.parse(c.custom_fields) : c.custom_fields;
                delete fields.category;
                delete fields.subcategory;
                m = { ...m, ...fields };
            } catch {}
        }
        return m;
    });
    // Append any custom items in catalog_customizations whose id wasn't in the base —
    // these are the user-added items the old system was losing.
    const baseIds = new Set(base.map(i => i.id));
    customs.forEach(c => {
        if (baseIds.has(c.catalog_item_id)) return;
        if (!c.custom_fields) return;
        try {
            const fields = typeof c.custom_fields === 'string' ? JSON.parse(c.custom_fields) : c.custom_fields;
            merged.push({
                id: c.catalog_item_id,
                ...fields,
                catalogNote: c.catalog_note,
                deleted: !!c.deleted,
            });
        } catch {}
    });
    return merged;
}

async function seedCatalogIfEmpty(teamId, userId) {
    if (!teamId) return; // no team → no catalog to seed
    const empty = await isCatalogEmpty(teamId);
    if (!empty) return;

    let seed = null;
    try {
        const raw = localStorage.getItem('av-estimator-catalog');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) seed = parsed;
        }
    } catch {}

    if (!seed) {
        seed = await buildCatalogFromLegacy(teamId);
    }

    const cleaned = seed.filter(i => i?.id);
    if (cleaned.length === 0) return;
    await bulkUpsertCatalog(teamId, cleaned, userId);
}

async function pushLocalProjects({ teamId, userId }) {
    if (!userId) return;
    let local = null;
    try {
        const raw = localStorage.getItem('av-estimator-data-v2');
        if (raw) local = JSON.parse(raw);
    } catch {}
    const localProjects = local?.projects;
    if (!Array.isArray(localProjects) || localProjects.length === 0) return;

    // Apply legacy migrations before push so Supabase only ever sees current shapes.
    const statusMap = { bidding: 'developing', won: 'active', 'in-progress': 'active' };
    const migrated = migrateProjectPhases(
        localProjects.map(p => (statusMap[p.status] ? { ...p, status: statusMap[p.status] } : p))
    );

    const remote = await loadProjects({ teamId, userId });
    const remoteIds = new Set(remote.map(p => p.id));
    const toPush = migrated.filter(p => p?.id && !remoteIds.has(p.id));
    for (const p of toPush) {
        await upsertProject(p, { teamId, userId });
    }
}

async function pushLocalSettings({ teamId, userId }) {
    if (!userId) return;
    let local = null;
    try {
        const raw = localStorage.getItem('av-estimator-data-v2');
        if (raw) local = JSON.parse(raw);
    } catch {}
    const localPackages = local?.packages;
    const localTemplates = local?.templates;
    const hasLocalPackages = Array.isArray(localPackages) && localPackages.length > 0;
    const hasLocalTemplates = localTemplates && Object.keys(localTemplates).length > 0;
    if (!hasLocalPackages && !hasLocalTemplates) return;

    const remote = await loadSettings({ teamId, userId });
    const remoteHasPackages = remote?.packages?.length > 0;
    const remoteHasTemplates = remote?.templates && Object.keys(remote.templates).length > 0;

    // Apply legacy package-shape and phase migrations to anything we're about to push.
    const migratedPackages = hasLocalPackages
        ? migratePackagePhases(migratePackageDefinitions(localPackages))
        : [];

    const next = {
        packages: remoteHasPackages ? remote.packages : (hasLocalPackages ? migratedPackages : []),
        templates: remoteHasTemplates ? remote.templates : (hasLocalTemplates ? localTemplates : {}),
    };
    // Skip the write if nothing local-only would be added.
    const wouldAdd = (!remoteHasPackages && hasLocalPackages) || (!remoteHasTemplates && hasLocalTemplates);
    if (!wouldAdd) return;
    await upsertSettings(next, { teamId, userId });
}

// Returns true on success (and sets the flag); false if anything threw.
// Call once per app load after we know who the user is and which team they're on.
export async function runMigration({ teamId, userId }) {
    if (!userId) return false;
    if (localStorage.getItem(MIGRATION_FLAG) === '1') return true;
    try {
        await seedCatalogIfEmpty(teamId, userId);
        await pushLocalProjects({ teamId, userId });
        await pushLocalSettings({ teamId, userId });
        localStorage.setItem(MIGRATION_FLAG, '1');
        return true;
    } catch (e) {
        console.error('Migration failed — will retry on next load', e);
        return false;
    }
}

export function isMigrated() {
    return localStorage.getItem(MIGRATION_FLAG) === '1';
}
