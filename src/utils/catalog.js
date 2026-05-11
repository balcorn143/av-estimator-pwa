import { resolvePackageInstance } from './packages';

// Generate unique catalog ID
export const generateCatalogId = () => 'cat-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

// Phase migration: normalize legacy <CODE>--<DESC> format to <DESC> <CODE>
const PHASE_CODE_MAP = {
    '27-40 00': 'Management 27-41 16',
    '27-41 00': 'Rough-In 27-41 00',
    '27-41 16': 'Management 27-41 16',
    '27-41 17': 'Programming 27-41 17',
    '27-41 23': 'Trim Out 27-41 23',
    '27-41 33': 'Finish 27-41 33',
};

export function migratePhase(phase) {
    if (!phase) return phase;
    // Already canonical — skip
    const canonical = Object.values(PHASE_CODE_MAP);
    if (canonical.includes(phase)) return phase;
    // Extract any CSI code (e.g. "27-41 33") from anywhere in the string
    const codeMatch = phase.match(/\b(\d{2}-\d{2} \d{2})\b/);
    if (codeMatch && PHASE_CODE_MAP[codeMatch[1]]) return PHASE_CODE_MAP[codeMatch[1]];
    return phase;
}

export function migrateCatalogPhases(catalog) {
    return catalog.map(item => item.phase ? { ...item, phase: migratePhase(item.phase) } : item);
}

export function migratePackagePhases(packages) {
    return (packages || []).map(pkg => ({
        ...pkg,
        items: (pkg.items || []).map(item => ({
            ...item,
            phase: migratePhase(item.phase),
            ...(item.accessories?.length ? { accessories: item.accessories.map(a => ({ ...a, phase: migratePhase(a.phase) })) } : {}),
        })),
    }));
}

export function migrateProjectPhases(projects) {
    const migrateItem = (item) => {
        const out = { ...item, phase: migratePhase(item.phase) };
        if (out.accessories?.length) out.accessories = out.accessories.map(a => ({ ...a, phase: migratePhase(a.phase) }));
        if (out.itemOverrides) {
            const ov = {};
            Object.entries(out.itemOverrides).forEach(([k, v]) => { ov[k] = v.phase !== undefined ? { ...v, phase: migratePhase(v.phase) } : v; });
            out.itemOverrides = ov;
        }
        return out;
    };
    const migrateLocs = (locs) => (locs || []).map(loc => ({
        ...loc,
        items: (loc.items || []).map(migrateItem),
        children: loc.children ? migrateLocs(loc.children) : loc.children,
    }));
    return (projects || []).map(p => ({
        ...p,
        locations: migrateLocs(p.locations),
        packages: migratePackagePhases(p.packages),
    }));
}

export function calculateTotals(location, catalogPkgs, projectPkgs) {
    let cost = 0, labor = 0, itemCount = 0;
    if (location.items) {
        for (const item of location.items) {
            if (item.type === 'package') {
                const resolved = resolvePackageInstance(item, catalogPkgs, projectPkgs);
                if (resolved && !resolved.isMissing) {
                    cost += resolved.totalCost;
                    labor += resolved.totalLabor;
                    itemCount += resolved.expandedItems.length;
                }
            } else {
                cost += (item.qty || 0) * (item.unitCost || 0);
                labor += (item.qty || 0) * (item.laborHrsPerUnit || 0);
                itemCount += 1;
                // Include accessories in totals
                if (item.accessories) {
                    for (const acc of item.accessories) {
                        cost += (acc.qty || 0) * (acc.unitCost || 0);
                        labor += (acc.qty || 0) * (acc.laborHrsPerUnit || 0);
                        itemCount += 1;
                    }
                }
            }
        }
    }
    if (location.children) {
        for (const child of location.children) {
            const t = calculateTotals(child, catalogPkgs, projectPkgs);
            cost += t.cost; labor += t.labor; itemCount += t.itemCount;
        }
    }
    return { cost, labor, itemCount };
}

// Check if an item matches a search term (searches across multiple fields)
export function itemMatchesSearch(item, term) {
    if (!term) return true;
    const t = term.toLowerCase();
    return (item.manufacturer?.toLowerCase().includes(t)) ||
           (item.model?.toLowerCase().includes(t)) ||
           (item.partNumber?.toLowerCase().includes(t)) ||
           (item.description?.toLowerCase().includes(t)) ||
           (item.category?.toLowerCase().includes(t)) ||
           (item.subcategory?.toLowerCase().includes(t)) ||
           (item.notes?.toLowerCase().includes(t));
}
