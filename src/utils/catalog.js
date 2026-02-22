import { resolvePackageInstance } from './packages';

// Generate unique catalog ID
export const generateCatalogId = () => 'cat-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

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
