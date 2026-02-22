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
    const expandedItems = (def.items || []).map(item => ({
        ...item,
        qty: (item.qtyPerPackage || item.qty || 1) * multiplier,
    }));

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
        isOutOfDate: (def.version || 1) > (instance.packageVersion || 1),
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

// Migrate old-style packageName items to new package instance model
export function migrateProjectPackages(project, existingPackages) {
    if (project.packageMigrationVersion >= 1) return { project, newPackageDefs: [] };

    const newPackageDefs = [];
    let changed = false;

    const migrateLoc = (loc) => {
        if (!loc.items || loc.items.length === 0) return loc;

        const packageGroups = {};
        const otherItems = [];

        loc.items.forEach(item => {
            if (item.type === 'package') {
                otherItems.push(item); // Already migrated
            } else if (item.packageName) {
                if (!packageGroups[item.packageName]) packageGroups[item.packageName] = [];
                packageGroups[item.packageName].push(item);
                changed = true;
            } else {
                otherItems.push(item);
            }
        });

        // Convert each package group to a package instance
        const newItems = [...otherItems];
        Object.entries(packageGroups).forEach(([name, items]) => {
            // Try to find existing package definition
            let def = [...existingPackages, ...newPackageDefs].find(p => p.name === name);
            if (!def) {
                def = {
                    id: generatePackageId(),
                    name,
                    scope: 'catalog',
                    version: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    items: items.map(i => {
                        const { packageName: _, ...rest } = i;
                        return { ...rest, qtyPerPackage: i.qty || 1 };
                    }),
                };
                newPackageDefs.push(def);
            }
            newItems.push({
                type: 'package',
                packageId: def.id,
                packageName: name,
                packageVersion: def.version || 1,
                qty: 1,
                notes: '',
            });
        });

        return {
            ...loc,
            items: newItems,
            children: loc.children ? loc.children.map(migrateLoc) : loc.children,
        };
    };

    const migratedLocations = (project.locations || []).map(migrateLoc);

    return {
        project: changed ? { ...project, locations: migratedLocations, packageMigrationVersion: 1 } : { ...project, packageMigrationVersion: 1 },
        newPackageDefs,
    };
}

// Migrate existing package definitions to add new fields (scope, version, qtyPerPackage)
export function migratePackageDefinitions(packages) {
    return (packages || []).map(pkg => ({
        ...pkg,
        id: pkg.id || generatePackageId(),
        scope: pkg.scope || 'catalog',
        version: pkg.version || 1,
        createdAt: pkg.createdAt || new Date().toISOString(),
        updatedAt: pkg.updatedAt || new Date().toISOString(),
        items: (pkg.items || []).map(item => ({
            ...item,
            qtyPerPackage: item.qtyPerPackage || item.qty || 1,
        })),
    }));
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
