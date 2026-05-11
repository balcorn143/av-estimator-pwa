// Generate a unique package ID
export function generatePackageId() {
    return 'pkg-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Resolve a package instance to its expanded items using catalog/project package definitions
export function resolvePackageInstance(instance, catalogPkgs, projectPkgs) {
    if (!instance || instance.type !== 'package') return null;
    const allPkgs = [...(projectPkgs || []), ...(catalogPkgs || [])];
    const def = allPkgs.find(p => p.id === instance.packageId);
    if (!def) return { definition: null, isOutOfDate: false, isMissing: true, expandedItems: [], totalCost: 0, totalLabor: 0 };

    const multiplier = instance.qty || 1;
    const overrides = instance.itemOverrides || {};
    const pkgSystem = instance.system || '';
    const expandedItems = (def.items || []).map((item, idx) => {
        const override = overrides[idx];
        const qtyPer = override?.qtyPerPackage !== undefined ? override.qtyPerPackage : (item.qtyPerPackage || item.qty || 1);
        const hasSystemOverride = override?.system !== undefined;
        const system = hasSystemOverride ? override.system : (pkgSystem || item.system);
        const hasPhaseOverride = override?.phase !== undefined;
        const phase = hasPhaseOverride ? override.phase : item.phase;
        const hasUnitCostOverride = override?.unitCost !== undefined;
        const unitCost = hasUnitCostOverride ? override.unitCost : item.unitCost;
        const hasLaborOverride = override?.laborHrsPerUnit !== undefined;
        const laborHrsPerUnit = hasLaborOverride ? override.laborHrsPerUnit : item.laborHrsPerUnit;
        const hasManufacturerOverride = override?.manufacturer !== undefined;
        const manufacturer = hasManufacturerOverride ? override.manufacturer : item.manufacturer;
        const hasModelOverride = override?.model !== undefined;
        const model = hasModelOverride ? override.model : item.model;
        const hasDescriptionOverride = override?.description !== undefined;
        const description = hasDescriptionOverride ? override.description : item.description;
        const hasNotesOverride = override?.notes !== undefined;
        const notes = hasNotesOverride ? override.notes : (item.notes || '');
        return {
            ...item,
            qty: qtyPer * multiplier,
            qtyPerPackage: qtyPer,
            unitCost,
            laborHrsPerUnit,
            manufacturer,
            model,
            description,
            notes,
            _hasOverride: override?.qtyPerPackage !== undefined,
            _hasSystemOverride: hasSystemOverride,
            _hasPhaseOverride: hasPhaseOverride,
            _hasUnitCostOverride: hasUnitCostOverride,
            _hasLaborOverride: hasLaborOverride,
            _hasCatalogFieldOverride: hasManufacturerOverride || hasModelOverride || hasDescriptionOverride || hasNotesOverride,
            ...(system !== undefined ? { system } : {}),
            phase,
        };
    });

    let totalCost = 0, totalLabor = 0;
    expandedItems.forEach(item => {
        totalCost += (item.qty || 0) * (item.unitCost || 0);
        totalLabor += (item.qty || 0) * (item.laborHrsPerUnit || 0);
        if (item.accessories) {
            item.accessories.forEach(acc => {
                const accQty = (acc.qtyPer || acc.qty || 0) * multiplier;
                totalCost += accQty * (acc.unitCost || 0);
                totalLabor += accQty * (acc.laborHrsPerUnit || 0);
            });
        }
    });

    return {
        definition: def,
        isOutOfDate: false,
        isMissing: false,
        expandedItems,
        totalCost,
        totalLabor,
    };
}

// Find all instances of a package across all locations (recursive)
export function findAllPackageInstances(locations, packageId) {
    const results = [];
    const search = (locs, path) => {
        for (const loc of (locs || [])) {
            (loc.items || []).forEach((item, idx) => {
                if (item.type === 'package' && item.packageId === packageId) {
                    results.push({ locationId: loc.id, locationName: loc.name, path: [...path, loc.name], itemIdx: idx, instance: item });
                }
            });
            if (loc.children) search(loc.children, [...path, loc.name]);
        }
    };
    search(locations, []);
    return results;
}

// Flatten a location's items, expanding package instances into individual items (for exports/BOM)
export function getFlattenedItems(location, catalogPkgs, projectPkgs) {
    const result = [];
    for (const item of (location.items || [])) {
        if (item.type === 'package') {
            const resolved = resolvePackageInstance(item, catalogPkgs, projectPkgs);
            if (resolved && !resolved.isMissing) {
                resolved.expandedItems.forEach(ei => {
                    // Push expanded item with accessories intact (qty already multiplied by resolvePackageInstance)
                    // Accessories also need qty multiplied by package qty
                    const multiplier = item.qty || 1;
                    const expandedAccessories = ei.accessories ? ei.accessories.map(acc => ({
                        ...acc,
                        qty: (acc.qtyPer || acc.qty || 0) * multiplier,
                    })) : undefined;
                    result.push({ ...ei, accessories: expandedAccessories });
                });
            }
        } else {
            result.push(item);
        }
    }
    return result;
}
