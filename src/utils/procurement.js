// Procurement utilities. The procurement section is the PM's "running BOM":
// it tracks what was ordered, what's arrived, and what's outstanding. The
// design BOM (project.locations[].items) is the starting point but procurement
// state can diverge — substitutions, field-adds, partial receipts, etc.

import { getFlattenedItems } from './packages';

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// A line is uniquely identified across syncs by its catalogId (preferred)
// or its mfr+model+partNumber tuple (for items not linked to the catalog).
function matchKeyOf(item) {
    if (item.catalogId) return `cat:${item.catalogId}`;
    return `mmp:${item.manufacturer || ''}|${item.model || ''}|${item.partNumber || ''}`;
}

// Derive status from quantities. Stops the PM from having to keep ordered/
// received and status manually in lockstep. Manual-only statuses (shipped,
// backordered, returned) get preserved on edit; everything else recomputes.
const AUTO_STATUSES = new Set(['pending', 'ordered', 'partial', 'received']);
const MANUAL_STATUSES = new Set(['shipped', 'backordered', 'returned']);

export function deriveStatus({ orderedQty = 0, receivedQty = 0 }) {
    if (orderedQty === 0) return 'pending';
    if (receivedQty >= orderedQty) return 'received';
    if (receivedQty > 0) return 'partial';
    return 'ordered';
}

// Recompute status on qty edit unless the user has explicitly picked a
// manual-only status. Manual statuses stick until the user changes them.
export function maybeAutoStatus(line) {
    if (MANUAL_STATUSES.has(line.status)) return line.status;
    return deriveStatus(line);
}

// Rebuild procurement state from the current BOM. Preserves all per-line
// procurement data (orderedQty, receivedQty, status, PO #, notes) for any
// line still matchable in the BOM. Lines that were removed from the BOM but
// have receiving history are kept with designQty=0 so the PM doesn't lose
// audit trail; field-adds are always preserved untouched.
export function syncFromBom(project, catalogPackages) {
    const existing = project?.procurement?.vendors || {};

    // Aggregate BOM into vendor → matchKey → { item, designQty }
    const bomMap = {};
    const addToBom = (vendorKey, item) => {
        if (!bomMap[vendorKey]) bomMap[vendorKey] = {};
        const mk = matchKeyOf(item);
        if (!bomMap[vendorKey][mk]) bomMap[vendorKey][mk] = { item, designQty: 0 };
        bomMap[vendorKey][mk].designQty += item.qty || 0;
    };
    const traverse = (locs) => {
        for (const loc of locs || []) {
            const flat = getFlattenedItems(loc, catalogPackages || [], project.packages || []);
            for (const item of flat) {
                const vendor = (item.vendor || item.manufacturer || 'Unknown').trim() || 'Unknown';
                addToBom(vendor, item);
                if (item.accessories) {
                    for (const acc of item.accessories) {
                        const accVendor = (acc.vendor || acc.manufacturer || vendor).trim() || vendor;
                        addToBom(accVendor, acc);
                    }
                }
            }
            if (loc.children) traverse(loc.children);
        }
    };
    traverse(project.locations || []);

    const vendors = {};

    // Start with existing vendor records (preserves notes/poNumbers/lines).
    Object.entries(existing).forEach(([vendorKey, ev]) => {
        vendors[vendorKey] = {
            ...ev,
            lines: (ev.lines || []).map(l => {
                if (l.sourceType === 'field-add') return l;
                const mk = matchKeyOf(l);
                const bomEntry = bomMap[vendorKey]?.[mk];
                // BOM still has the line — update designQty.
                if (bomEntry) {
                    return { ...l, designQty: bomEntry.designQty, unitCost: bomEntry.item.unitCost ?? l.unitCost };
                }
                // BOM no longer has the line. Keep it (designQty=0) so any
                // receiving/PO history isn't lost — PM can delete manually.
                return { ...l, designQty: 0 };
            }),
        };
    });

    // Append BOM lines that don't yet exist in procurement.
    Object.entries(bomMap).forEach(([vendorKey, items]) => {
        if (!vendors[vendorKey]) {
            vendors[vendorKey] = {
                vendor: vendorKey,
                poNumbers: '',
                notes: '',
                lines: [],
            };
        }
        const existingMatchKeys = new Set(
            (vendors[vendorKey].lines || [])
                .filter(l => l.sourceType !== 'field-add')
                .map(l => matchKeyOf(l))
        );
        Object.entries(items).forEach(([mk, { item, designQty }]) => {
            if (existingMatchKeys.has(mk)) return;
            vendors[vendorKey].lines.push({
                id: genId(),
                catalogId: item.catalogId || null,
                manufacturer: item.manufacturer || '',
                model: item.model || '',
                partNumber: item.partNumber || '',
                description: item.description || '',
                unitCost: item.unitCost || 0,
                designQty,
                orderedQty: designQty,
                receivedQty: 0,
                status: 'pending',
                poNumber: '',
                expectedDate: '',
                notes: '',
                sourceType: 'bom',
            });
        });
    });

    // Sort lines within each vendor for stable display.
    Object.values(vendors).forEach(v => {
        v.lines.sort((a, b) => `${a.manufacturer}|${a.model}`.localeCompare(`${b.manufacturer}|${b.model}`));
    });

    return {
        ...(project?.procurement || {}),
        vendors,
        lastSyncedAt: new Date().toISOString(),
    };
}

// Project-level totals for the header summary.
export function getProcurementSummary(procurement) {
    let totalLines = 0;
    let receivedLines = 0;
    let totalDesignCost = 0;
    let totalOrderedCost = 0;
    let totalReceivedCost = 0;
    let backorders = 0;
    let pending = 0;
    Object.values(procurement?.vendors || {}).forEach(v => {
        (v.lines || []).forEach(l => {
            totalLines++;
            if ((l.orderedQty || 0) > 0 && (l.receivedQty || 0) >= (l.orderedQty || 0)) receivedLines++;
            totalDesignCost += (l.designQty || 0) * (l.unitCost || 0);
            totalOrderedCost += (l.orderedQty || 0) * (l.unitCost || 0);
            totalReceivedCost += (l.receivedQty || 0) * (l.unitCost || 0);
            if (l.status === 'backordered') backorders++;
            if (l.status === 'pending') pending++;
        });
    });
    return { totalLines, receivedLines, totalDesignCost, totalOrderedCost, totalReceivedCost, backorders, pending };
}

// Per-vendor totals for the vendor header chips.
export function getVendorSummary(vendorData) {
    let designCost = 0, orderedCost = 0, receivedCost = 0;
    let receivedLines = 0, backorders = 0, pending = 0;
    const lineCount = (vendorData.lines || []).length;
    (vendorData.lines || []).forEach(l => {
        designCost += (l.designQty || 0) * (l.unitCost || 0);
        orderedCost += (l.orderedQty || 0) * (l.unitCost || 0);
        receivedCost += (l.receivedQty || 0) * (l.unitCost || 0);
        if ((l.orderedQty || 0) > 0 && (l.receivedQty || 0) >= (l.orderedQty || 0)) receivedLines++;
        if (l.status === 'backordered') backorders++;
        if (l.status === 'pending') pending++;
    });
    return { lineCount, designCost, orderedCost, receivedCost, receivedLines, backorders, pending };
}

// Construct a brand-new field-add line (item not in the design BOM — rentals,
// freight, on-the-fly substitutions, etc.)
export function makeFieldAddLine({ vendor } = {}) {
    return {
        id: genId(),
        catalogId: null,
        manufacturer: '',
        model: '',
        partNumber: '',
        description: '',
        unitCost: 0,
        designQty: 0,
        orderedQty: 0,
        receivedQty: 0,
        status: 'pending',
        poNumber: '',
        expectedDate: '',
        notes: '',
        sourceType: 'field-add',
    };
}

export { matchKeyOf };
