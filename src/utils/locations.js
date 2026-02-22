import { calculateTotals } from './catalog';

export function parseLocationInput(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const results = [];
    for (const line of lines) {
        const rangeMatch = line.match(/^(.+?)(\d+)-(\d+)$/);
        if (rangeMatch) {
            const prefix = rangeMatch[1];
            const start = parseInt(rangeMatch[2]);
            const end = parseInt(rangeMatch[3]);
            const padLength = rangeMatch[2].length;
            if (start <= end && (end - start) <= 100) {
                for (let i = start; i <= end; i++) {
                    results.push(prefix + String(i).padStart(padLength, '0'));
                }
            } else results.push(line);
        } else results.push(line);
    }
    return results;
}

// Get the path to a location (returns array of ancestor names, not including the location itself)
export function getLocationPath(locations, targetId, currentPath = []) {
    for (const loc of locations) {
        if (loc.id === targetId) {
            return currentPath;
        }
        if (loc.children) {
            const found = getLocationPath(loc.children, targetId, [...currentPath, loc.name]);
            if (found) return found;
        }
    }
    return null;
}

// Get all locations flattened with path info (includes empty locations)
export function getAllLocationsFlatted(locations, parentPath = '') {
    let result = [];
    for (const loc of locations) {
        const path = parentPath ? `${parentPath} > ${loc.name}` : loc.name;
        result.push({ ...loc, path, depth: parentPath.split(' > ').filter(Boolean).length });

        if (loc.children) {
            result = result.concat(getAllLocationsFlatted(loc.children, path));
        }
    }
    return result;
}

// Get all locations with items (flattened with path info)
export function getLocationsWithItems(locations, parentPath = '') {
    let result = [];
    for (const loc of locations) {
        const path = parentPath ? `${parentPath} > ${loc.name}` : loc.name;
        const hasItems = loc.items && loc.items.length > 0;
        const hasChildrenWithItems = loc.children && loc.children.some(c => {
            const check = (l) => (l.items?.length > 0) || (l.children?.some(check));
            return check(c);
        });

        if (hasItems) {
            result.push({ ...loc, path, depth: parentPath.split(' > ').filter(Boolean).length });
        }

        if (loc.children) {
            result = result.concat(getLocationsWithItems(loc.children, path));
        }
    }
    return result;
}

// Get available hierarchy levels from location tree
export function getHierarchyLevels(locations) {
    const levels = [{ depth: -1, label: 'Entire Project' }];
    const allFlat = getAllLocationsFlatted(locations);
    const maxDepth = allFlat.reduce((max, loc) => Math.max(max, loc.depth), 0);
    for (let d = 0; d <= maxDepth; d++) {
        const namesAtDepth = allFlat.filter(l => l.depth === d).map(l => l.name);
        const unique = [...new Set(namesAtDepth)];
        const examples = unique.slice(0, 3).join(', ');
        const extra = unique.length > 3 ? ', ...' : '';
        levels.push({ depth: d, label: `By: ${examples}${extra}` });
    }
    return levels;
}

// Group locations by hierarchy depth for reports
// Returns array of { name, path, locations: [leaf locations with items] }
export function getGroupedByHierarchy(locations, targetDepth, catalogPkgs, projectPkgs) {
    if (targetDepth === -1) {
        // Entire project = one group
        const locsWithItems = getLocationsWithItems(locations);
        return [{ name: 'Entire Project', path: '', locations: locsWithItems }];
    }
    // Collect nodes at the target depth
    const collectAtDepth = (locs, currentDepth, parentPath) => {
        let groups = [];
        for (const loc of locs) {
            const path = parentPath ? `${parentPath} > ${loc.name}` : loc.name;
            if (currentDepth === targetDepth) {
                // This node is at target depth - collect all descendant leaf locations
                const descendantLeaves = getLocationsWithItems([loc], parentPath);
                if (descendantLeaves.length > 0) {
                    groups.push({ name: path, path, locations: descendantLeaves });
                }
            } else if (loc.children && currentDepth < targetDepth) {
                groups = groups.concat(collectAtDepth(loc.children, currentDepth + 1, path));
            }
        }
        return groups;
    };
    return collectAtDepth(locations, 0, '');
}

export function cloneStructure(location, newName, includeItems = true) {
    return {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: newName,
        children: location.children ? location.children.map(child => cloneStructure(child, child.name, includeItems)) : [],
        items: includeItems && location.items ? location.items.map(item => ({
            ...item,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            accessories: item.accessories ? item.accessories.map(acc => ({
                ...acc,
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
            })) : []
        })) : []
    };
}

export function sortLocationsAlpha(locations) {
    return [...locations].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function filterLocations(locations, searchTerm) {
    if (!searchTerm) return locations;
    const term = searchTerm.toLowerCase();

    const matches = (loc) => {
        if (loc.name.toLowerCase().includes(term)) return true;
        if (loc.children) return loc.children.some(matches);
        return false;
    };

    const filterTree = (locs) => {
        return locs.filter(matches).map(loc => ({
            ...loc,
            children: loc.children ? filterTree(loc.children) : []
        }));
    };

    return filterTree(locations);
}
