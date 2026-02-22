import React from 'react'
const { useState, useEffect, useMemo, useRef } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { fmtCost, fmtQty, fmtHrs } from '../utils/formatters'
import { calculateTotals, itemMatchesSearch } from '../utils/catalog'
import { getLocationsWithItems } from '../utils/locations'
import { resolvePackageInstance } from '../utils/packages'
import { SYSTEM_OPTIONS } from '../constants'
import ColumnLayoutManager from './ColumnLayoutManager'
import useFlexibleColumns from '../hooks/useFlexibleColumns'

export default function AllLocationsView({
    locations,
    onUpdate,
    onSearch,
    clipboard,
    onCopy,
    onPaste,
    onSavePackage,
    catalog,
    onAddAccessoryToItem,
    onConvertToAccessory,
    onUngroupPackage,
    onMoveToPackage,
    expandedLocations,
    onToggleLocationExpand,
    onExpandAllLocations,
    onCollapseAllLocations,
    compactMode,
    onAddToCatalog,
    catalogPkgs,
    projectPkgs,
    filterMode, // 'unfinished' to show only placeholder items
    onReplaceItem,
    onReplacePackage,
    searchFilter
}) {
    const [selectedItems, setSelectedItems] = useState({}); // { locationId: [indices] }
    const [expandedItems, setExpandedItems] = useState({}); // { locationId: { itemIdx: bool } }
    const [expandedPackages, setExpandedPackages] = useState({}); // { locationId: { pkgName: bool } }
    const [contextMenu, setContextMenu] = useState(null);

    // Resizable columns
    const ALL_LOC_COLUMNS = [
        { id: 'checkbox', label: '', width: 40, fixed: true },
        { id: 'expand', label: '', width: 30, fixed: true },
        { id: 'qty', label: 'Qty', width: 75 },
        { id: 'notes', label: 'Notes', width: 120 },
        { id: 'system', label: 'System', width: 100 },
        { id: 'manufacturer', label: 'Manufacturer', width: 120 },
        { id: 'model', label: 'Model', width: 140 },
        { id: 'description', label: 'Description', width: 200 },
        { id: 'unitCost', label: 'Unit $', width: 80 },
        { id: 'unitLabor', label: 'Unit Hrs', width: 70 },
        { id: 'extCost', label: 'Ext. $', width: 90 },
        { id: 'extLabor', label: 'Ext. Hrs', width: 80 },
    ];
    const { columns: allLocCols, startResize: startAllLocResize, savedLayouts: allLocLayouts, saveLayout: saveAllLocLayout, loadLayout: loadAllLocLayout, deleteLayout: deleteAllLocLayout, resetColumns: resetAllLocColumns } = useFlexibleColumns(ALL_LOC_COLUMNS, 'workspace');

    // Compact mode styles
    const compactStyles = {
        td: compactMode ? { padding: '4px 8px', fontSize: '11px' } : {},
        th: compactMode ? { padding: '6px 8px', fontSize: '10px' } : {},
        input: compactMode ? { padding: '2px 6px', fontSize: '11px' } : {},
    };

    // Combined styles for easy use
    const tdStyle = { ...styles.td, ...compactStyles.td };
    const thStyle = { ...styles.th, ...compactStyles.th };
    const inputStyle = { ...styles.inputSmall, ...compactStyles.input };

    // Get only locations that have items directly in them (not empty parent folders)
    const allLocationsRaw = useMemo(() => getLocationsWithItems(locations), [locations]);
    // Apply filter mode and search filter — hide locations with no matching items
    const allLocations = useMemo(() => {
        let filtered = allLocationsRaw;
        if (filterMode === 'unfinished') {
            filtered = filtered.filter(loc => loc.items?.some(item => item.isPlaceholder));
        }
        if (searchFilter) {
            const term = searchFilter.toLowerCase();
            filtered = filtered.filter(loc => loc.items?.some(item => {
                if (item.type === 'package') {
                    return item.packageName?.toLowerCase().includes(term);
                }
                return itemMatchesSearch(item, searchFilter);
            }));
        }
        return filtered;
    }, [allLocationsRaw, filterMode, searchFilter]);

    // Calculate item totals
    const calculateItemTotal = (item) => {
        let cost = (item.qty || 0) * (item.unitCost || 0);
        let labor = (item.qty || 0) * (item.laborHrsPerUnit || 0);
        if (item.accessories) {
            item.accessories.forEach(acc => {
                cost += (acc.qty || 0) * (acc.unitCost || 0);
                labor += (acc.qty || 0) * (acc.laborHrsPerUnit || 0);
            });
        }
        return { cost, labor };
    };

    // Group items by package for a location
    const getGroupedItems = (location) => {
        const items = location.items || [];
        const packageInstances = [];
        const legacyPackages = {};
        const standalone = [];

        items.forEach((item, idx) => {
            if (item.type === 'package') {
                const resolved = resolvePackageInstance(item, catalogPkgs, projectPkgs);
                packageInstances.push({
                    instance: item, idx, resolved, name: item.packageName, qty: item.qty || 1,
                    isOutOfDate: resolved?.isOutOfDate || false, isMissing: resolved?.isMissing || false,
                    cost: resolved?.totalCost || 0, labor: resolved?.totalLabor || 0,
                    itemCount: resolved?.expandedItems?.length || 0, expandedItems: resolved?.expandedItems || [],
                });
            } else if (item.packageName) {
                if (!legacyPackages[item.packageName]) {
                    legacyPackages[item.packageName] = { name: item.packageName, items: [], indices: [] };
                }
                legacyPackages[item.packageName].items.push(item);
                legacyPackages[item.packageName].indices.push(idx);
            } else {
                standalone.push({ item, idx });
            }
        });

        // Calculate legacy package totals
        const legacyPkgList = Object.values(legacyPackages).map(pkg => {
            let cost = 0, labor = 0;
            pkg.items.forEach(item => { const t = calculateItemTotal(item); cost += t.cost; labor += t.labor; });
            const itemCount = pkg.items.reduce((count, item) => count + 1 + (item.accessories?.length || 0), 0);
            return { ...pkg, cost, labor, itemCount };
        });

        return { packages: packageInstances, legacyPackages: legacyPkgList, standalone };
    };

    // Change handlers
    const changeQty = (locationId, itemIdx, q) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            const newQty = Math.max(0, parseInt(q) || 0);
            const oldQty = newItems[itemIdx].qty || 1;
            newItems[itemIdx] = { ...newItems[itemIdx], qty: newQty };
            if (newItems[itemIdx].accessories) {
                const ratio = newQty / oldQty;
                newItems[itemIdx].accessories = newItems[itemIdx].accessories.map(acc => ({
                    ...acc,
                    qty: Math.round((acc.qty || 0) * ratio) || acc.qtyPer || 1
                }));
            }
            return newItems;
        });
    };

    const changeNotes = (locationId, itemIdx, notes) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], notes };
            return newItems;
        });
    };

    const changeSystem = (locationId, itemIdx, system) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], system };
            return newItems;
        });
    };

    const changeManufacturer = (locationId, itemIdx, manufacturer) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], manufacturer };
            return newItems;
        });
    };
    const changeModel = (locationId, itemIdx, model) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], model };
            return newItems;
        });
    };
    const changeDescription = (locationId, itemIdx, description) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], description };
            return newItems;
        });
    };

    const addEmptyItem = (locationId) => {
        const newItem = {
            id: 'placeholder-' + Date.now(),
            manufacturer: '',
            model: '',
            partNumber: '',
            description: '',
            category: '',
            subcategory: '',
            unitCost: 0,
            laborHrsPerUnit: 0,
            uom: 'EA',
            qty: 1,
            isPlaceholder: true,
        };
        onUpdate(locationId, (items) => [...items, newItem]);
    };

    const changeAccessoryQty = (locationId, itemIdx, accIdx, q) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = {
                ...newItems[itemIdx],
                accessories: newItems[itemIdx].accessories.map((a, i) => i === accIdx ? { ...a, qty: Math.max(0, parseInt(q) || 0) } : a)
            };
            return newItems;
        });
    };

    const changeAccessoryNotes = (locationId, itemIdx, accIdx, notes) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = {
                ...newItems[itemIdx],
                accessories: newItems[itemIdx].accessories.map((a, i) => i === accIdx ? { ...a, notes } : a)
            };
            return newItems;
        });
    };

    const removeAccessory = (locationId, itemIdx, accIdx) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = {
                ...newItems[itemIdx],
                accessories: newItems[itemIdx].accessories.filter((_, i) => i !== accIdx)
            };
            return newItems;
        });
    };

    // Local editing state for unit cost / labor inputs (prevents re-render loop)
    const [editingCost, setEditingCost] = useState({});
    const [editingLabor, setEditingLabor] = useState({});

    const focusUnitCost = (locationId, itemIdx, currentVal) => {
        setEditingCost(prev => ({ ...prev, [`${locationId}-${itemIdx}`]: String(currentVal || 0) }));
    };
    const changeUnitCost = (locationId, itemIdx, val) => {
        setEditingCost(prev => ({ ...prev, [`${locationId}-${itemIdx}`]: val }));
    };
    const blurUnitCost = (locationId, itemIdx) => {
        const key = `${locationId}-${itemIdx}`;
        const val = parseFloat(editingCost[key]) || 0;
        setEditingCost(prev => { const n = { ...prev }; delete n[key]; return n; });
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], unitCost: val };
            return newItems;
        });
    };

    const focusUnitLabor = (locationId, itemIdx, currentVal) => {
        setEditingLabor(prev => ({ ...prev, [`${locationId}-${itemIdx}`]: String(currentVal || 0) }));
    };
    const changeUnitLabor = (locationId, itemIdx, val) => {
        setEditingLabor(prev => ({ ...prev, [`${locationId}-${itemIdx}`]: val }));
    };
    const blurUnitLabor = (locationId, itemIdx) => {
        const key = `${locationId}-${itemIdx}`;
        const val = parseFloat(editingLabor[key]) || 0;
        setEditingLabor(prev => { const n = { ...prev }; delete n[key]; return n; });
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], laborHrsPerUnit: val };
            return newItems;
        });
    };

    // Accessory cost/labor editing
    const [editingAccCost, setEditingAccCost] = useState({});
    const [editingAccLabor, setEditingAccLabor] = useState({});

    const focusAccCost = (locationId, itemIdx, accIdx, currentVal) => {
        setEditingAccCost(prev => ({ ...prev, [`${locationId}-${itemIdx}-${accIdx}`]: String(currentVal || 0) }));
    };
    const changeAccCost = (locationId, itemIdx, accIdx, val) => {
        setEditingAccCost(prev => ({ ...prev, [`${locationId}-${itemIdx}-${accIdx}`]: val }));
    };
    const blurAccCost = (locationId, itemIdx, accIdx) => {
        const key = `${locationId}-${itemIdx}-${accIdx}`;
        const val = parseFloat(editingAccCost[key]) || 0;
        setEditingAccCost(prev => { const n = { ...prev }; delete n[key]; return n; });
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], accessories: newItems[itemIdx].accessories.map((a, ai) => ai === accIdx ? { ...a, unitCost: val } : a) };
            return newItems;
        });
    };

    const focusAccLabor = (locationId, itemIdx, accIdx, currentVal) => {
        setEditingAccLabor(prev => ({ ...prev, [`${locationId}-${itemIdx}-${accIdx}`]: String(currentVal || 0) }));
    };
    const changeAccLabor = (locationId, itemIdx, accIdx, val) => {
        setEditingAccLabor(prev => ({ ...prev, [`${locationId}-${itemIdx}-${accIdx}`]: val }));
    };
    const blurAccLabor = (locationId, itemIdx, accIdx) => {
        const key = `${locationId}-${itemIdx}-${accIdx}`;
        const val = parseFloat(editingAccLabor[key]) || 0;
        setEditingAccLabor(prev => { const n = { ...prev }; delete n[key]; return n; });
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            newItems[itemIdx] = { ...newItems[itemIdx], accessories: newItems[itemIdx].accessories.map((a, ai) => ai === accIdx ? { ...a, laborHrsPerUnit: val } : a) };
            return newItems;
        });
    };

    const removeItem = (locationId, itemIdx) => {
        onUpdate(locationId, (items) => items.filter((_, i) => i !== itemIdx));
        setSelectedItems(prev => ({ ...prev, [locationId]: (prev[locationId] || []).filter(i => i !== itemIdx) }));
    };

    const promoteAccessoryToItem = (locationId, itemIdx, accIdx) => {
        onUpdate(locationId, (items) => {
            const newItems = [...items];
            const parentItem = newItems[itemIdx];
            const accessory = parentItem.accessories[accIdx];

            // Create new standalone item from accessory
            const newItem = {
                ...accessory,
                accessories: [],
                packageName: parentItem.packageName, // Keep in same package if applicable
            };

            // Remove accessory from parent
            newItems[itemIdx] = {
                ...parentItem,
                accessories: parentItem.accessories.filter((_, i) => i !== accIdx)
            };

            // Insert new item after parent
            newItems.splice(itemIdx + 1, 0, newItem);
            return newItems;
        });
    };

    // Selection handlers
    const lastClickedRef = useRef({ locationId: null, idx: null });
    const toggleSelect = (locationId, idx, e) => {
        if (e && e.shiftKey && lastClickedRef.current.locationId === locationId && lastClickedRef.current.idx !== null) {
            // Shift+Click: select range within same location
            const start = Math.min(lastClickedRef.current.idx, idx);
            const end = Math.max(lastClickedRef.current.idx, idx);
            const range = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedItems(prev => {
                const current = prev[locationId] || [];
                const combined = new Set([...current, ...range]);
                return { ...prev, [locationId]: [...combined] };
            });
        } else {
            setSelectedItems(prev => {
                const current = prev[locationId] || [];
                return {
                    ...prev,
                    [locationId]: current.includes(idx) ? current.filter(i => i !== idx) : [...current, idx]
                };
            });
        }
        lastClickedRef.current = { locationId, idx };
    };

    const selectAllInLocation = (locationId, visibleIndices) => {
        setSelectedItems(prev => {
            const current = prev[locationId] || [];
            const allVisible = visibleIndices.every(i => current.includes(i));
            if (allVisible) {
                // Deselect visible items (keep any hidden selections)
                return { ...prev, [locationId]: current.filter(i => !visibleIndices.includes(i)) };
            }
            // Select all visible items (merge with existing selections)
            return { ...prev, [locationId]: [...new Set([...current, ...visibleIndices])] };
        });
    };

    // Expand/collapse handlers
    const toggleItemExpand = (locationId, idx) => {
        setExpandedItems(prev => ({
            ...prev,
            [locationId]: { ...(prev[locationId] || {}), [idx]: !(prev[locationId]?.[idx] ?? true) }
        }));
    };

    const togglePackageExpand = (locationId, pkgName) => {
        setExpandedPackages(prev => ({
            ...prev,
            [locationId]: { ...(prev[locationId] || {}), [pkgName]: !(prev[locationId]?.[pkgName] ?? true) }
        }));
    };

    // Copy/paste handlers
    const handleCopy = (locationId) => {
        const loc = allLocations.find(l => l.id === locationId);
        if (!loc) return;
        const indices = selectedItems[locationId] || [];
        onCopy(indices.map(idx => ({ ...loc.items[idx] })));
    };

    const handlePaste = (locationId) => {
        onPaste(locationId);
        setSelectedItems(prev => ({ ...prev, [locationId]: [] }));
    };

    const handleSavePackage = (locationId) => {
        const loc = allLocations.find(l => l.id === locationId);
        if (!loc) return;
        const indices = selectedItems[locationId] || [];
        if (indices.length > 0) {
            onSavePackage(indices.map(idx => ({ ...loc.items[idx] })), indices, locationId);
        }
    };

    // Context menu
    const handleContextMenu = (e, locationId, itemIdx, isAccessory = false, accIdx = null) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, locationId, itemIdx, isAccessory, accIdx });
    };

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu]);

    // Get total selected count
    const totalSelected = Object.values(selectedItems).reduce((sum, arr) => sum + arr.length, 0);

    if (allLocations.length === 0) {
        return (
            <div style={styles.emptyState}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>{filterMode === 'unfinished' ? '\u2705' : '\uD83C\uDFE2'}</div>
                <h3 style={{ color: '#8b98a5', fontSize: '20px' }}>{filterMode === 'unfinished' ? 'No unfinished items' : 'No locations created yet'}</h3>
                <p style={{ margin: '0', maxWidth: '400px' }}>{filterMode === 'unfinished' ? 'All placeholder items have been completed or none exist yet.' : 'Create locations in the sidebar to get started.'}</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {filterMode === 'unfinished' ? <><Icons.AlertTriangle /> Unfinished Items</> : <><Icons.Layers /> All Locations</>}
                    <span style={{ ...styles.badge('blue'), fontSize: '12px' }}>{allLocations.length} locations</span>
                </h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {clipboard.length > 0 && (
                        <span style={{ ...styles.badge('green'), padding: '6px 12px' }}>
                            <Icons.Clipboard /> {clipboard.length} copied
                        </span>
                    )}
                    <ColumnLayoutManager savedLayouts={allLocLayouts} onSave={saveAllLocLayout} onLoad={loadAllLocLayout} onDelete={deleteAllLocLayout} onReset={resetAllLocColumns} />
                    <button style={styles.smallButton} onClick={onExpandAllLocations} title="Expand all locations">
                        <Icons.ChevronsDown /> Expand All
                    </button>
                    <button style={styles.smallButton} onClick={onCollapseAllLocations} title="Collapse all locations">
                        <Icons.ChevronsUp /> Collapse All
                    </button>
                </div>
            </div>

            {/* Location sections */}
            {allLocations.map(location => {
                const isExpanded = expandedLocations[location.id] !== false;
                const groupedItems = getGroupedItems(location);
                const totals = calculateTotals(location, catalogPkgs, projectPkgs);
                const locationSelected = selectedItems[location.id] || [];
                const mainItemCount = (location.items || []).length;

                // Apply search filter
                const filteredPkgs = searchFilter
                    ? groupedItems.packages.filter(pkg =>
                        itemMatchesSearch({ manufacturer: pkg.name, model: '', description: '' }, searchFilter) ||
                        pkg.expandedItems?.some(item => itemMatchesSearch(item, searchFilter)))
                    : groupedItems.packages;
                const filteredLegacyPkgs = searchFilter
                    ? groupedItems.legacyPackages.filter(pkg =>
                        pkg.items.some(item => itemMatchesSearch(item, searchFilter)))
                    : groupedItems.legacyPackages;
                const filteredStandalone = searchFilter
                    ? groupedItems.standalone.filter(({ item }) => itemMatchesSearch(item, searchFilter))
                    : groupedItems.standalone;
                // Apply unfinished filter on top of search filter
                const visibleStandalone = filterMode === 'unfinished'
                    ? filteredStandalone.filter(({ item }) => item.isPlaceholder)
                    : filteredStandalone;
                const visiblePkgs = filterMode === 'unfinished' ? [] : filteredPkgs;
                const visibleLegacyPkgs = filterMode === 'unfinished' ? [] : filteredLegacyPkgs;
                // Compute visible indices for select-all
                const visibleIndices = [];
                visiblePkgs.forEach(pkg => visibleIndices.push(pkg.idx));
                visibleLegacyPkgs.forEach(pkg => pkg.indices.forEach(i => visibleIndices.push(i)));
                visibleStandalone.forEach(({ idx }) => visibleIndices.push(idx));

                return (
                    <div key={location.id} style={{ marginBottom: compactMode ? '8px' : '16px', backgroundColor: '#161b22', borderRadius: compactMode ? '8px' : '12px', border: '1px solid #30363d', overflow: 'hidden' }}>
                        {/* Location header */}
                        <div
                            style={{
                                padding: compactMode ? '8px 12px' : '16px 20px',
                                backgroundColor: '#1c2128',
                                borderBottom: isExpanded ? '1px solid #30363d' : 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: compactMode ? '8px' : '12px'
                            }}
                            onClick={() => onToggleLocationExpand(location.id)}
                        >
                            <button style={{ ...styles.iconButton, padding: compactMode ? '2px' : '4px' }}>
                                {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                            </button>
                            <Icons.Location />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '600', fontSize: compactMode ? '13px' : '15px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    {location.name}
                                    {compactMode && location.path !== location.name && (
                                        <span style={{ fontSize: '11px', color: '#6e767d', fontWeight: '400' }}>{location.path}</span>
                                    )}
                                </div>
                                {!compactMode && location.path !== location.name && (
                                    <div style={{ fontSize: '12px', color: '#6e767d', marginTop: '2px' }}>{location.path}</div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: compactMode ? '10px' : '16px', alignItems: 'center', flexShrink: 0 }}>
                                <span style={{ ...styles.badge('blue'), fontSize: compactMode ? '10px' : '11px', padding: compactMode ? '2px 6px' : '3px 10px' }}>{totals.itemCount} items</span>
                                <span style={{ color: '#00ba7c', fontWeight: '600', fontSize: compactMode ? '12px' : '14px' }}>{fmtCost(totals.cost)}</span>
                                <span style={{ color: '#8b98a5', fontSize: compactMode ? '11px' : '13px' }}>{fmtHrs(totals.labor)}</span>
                            </div>
                        </div>

                        {/* Location content */}
                        {isExpanded && (
                            <div style={{ padding: compactMode ? '8px' : '16px' }}>
                                {/* Toolbar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: compactMode ? '6px' : '12px', flexWrap: 'wrap' }}>
                                    {locationSelected.length > 0 && (
                                        <>
                                            <span style={{ fontSize: compactMode ? '11px' : '13px', color: '#8b98a5' }}>{locationSelected.length} selected</span>
                                            <button style={{ ...styles.smallButton, backgroundColor: '#1d2d3d', color: '#58a6ff', padding: compactMode ? '4px 8px' : undefined, fontSize: compactMode ? '11px' : undefined }} onClick={() => handleCopy(location.id)}>
                                                <Icons.Copy /> Copy
                                            </button>
                                            <button style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c', padding: compactMode ? '4px 8px' : undefined, fontSize: compactMode ? '11px' : undefined }} onClick={() => handleSavePackage(location.id)}>
                                                <Icons.Package /> Save as Package
                                            </button>
                                        </>
                                    )}
                                    {clipboard.length > 0 && (
                                        <button style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c', padding: compactMode ? '4px 8px' : undefined, fontSize: compactMode ? '11px' : undefined }} onClick={() => handlePaste(location.id)}>
                                            <Icons.Clipboard /> Paste ({clipboard.length})
                                        </button>
                                    )}
                                    <button style={{ ...styles.smallButton, marginLeft: 'auto', padding: compactMode ? '4px 8px' : undefined, fontSize: compactMode ? '11px' : undefined }} onClick={() => onSearch(location.id)}>
                                        <Icons.Plus /> Add Component
                                    </button>
                                    <button style={{ ...styles.smallButton, backgroundColor: '#2a1f0a', color: '#f59e0b', border: '1px solid #f59e0b40', padding: compactMode ? '4px 8px' : undefined, fontSize: compactMode ? '11px' : undefined }} onClick={() => addEmptyItem(location.id)} title="Add empty placeholder">
                                        <Icons.Plus /> Empty
                                    </button>
                                </div>

                                {/* Items table */}
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                {allLocCols.map((col, colIndex) => (
                                                    <th key={col.id} style={{ ...thStyle, ...styles.thResizable, width: col.width + 'px' }}>
                                                        {col.id === 'checkbox' ? (
                                                            <input
                                                                type="checkbox"
                                                                checked={visibleIndices.length > 0 && visibleIndices.every(i => locationSelected.includes(i))}
                                                                onChange={() => selectAllInLocation(location.id, visibleIndices)}
                                                            />
                                                        ) : col.label}
                                                        {!col.fixed && (
                                                            <div
                                                                style={styles.resizeHandle}
                                                                onMouseDown={e => startAllLocResize(colIndex, e)}
                                                                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                            />
                                                        )}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Package instances (new format) */}
                                            {visiblePkgs.map(pkg => {
                                                const pkgColor = styles.pkgColor(pkg.name);
                                                const isPkgExpanded = expandedPackages[location.id]?.[pkg.name] !== false;
                                                const isSelected = locationSelected.includes(pkg.idx);

                                                const changePkgQty = (val) => {
                                                    onUpdate(location.id, items => {
                                                        const newItems = [...items];
                                                        newItems[pkg.idx] = { ...newItems[pkg.idx], qty: Math.max(1, parseInt(val) || 1) };
                                                        return newItems;
                                                    });
                                                };

                                                return (
                                                    <React.Fragment key={`pkg-${pkg.idx}`}>
                                                        <tr style={{ backgroundColor: pkgColor.bg, borderLeft: `4px solid ${pkgColor.b}` }}>
                                                            <td style={tdStyle}><input type="checkbox" checked={isSelected} onChange={e => toggleSelect(location.id, pkg.idx, e)} /></td>
                                                            <td style={tdStyle}><button style={{ ...styles.iconButton, padding: '2px' }} onClick={() => togglePackageExpand(location.id, pkg.name)}>{isPkgExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}</button></td>
                                                            <td style={tdStyle}><input type="number" value={pkg.qty} onChange={e => changePkgQty(e.target.value)} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '60px', fontWeight: '700' }} min="1" /></td>
                                                            <td style={tdStyle}></td>
                                                            <td style={tdStyle}></td>
                                                            <td style={{ ...tdStyle, fontWeight: '700' }}><Icons.Package /> <span style={{ color: pkgColor.b }}>{pkg.name}</span> {pkg.isOutOfDate && <span style={{ color: '#f59e0b', fontSize: '11px' }}>&#x26A0;</span>}</td>
                                                            <td style={tdStyle}><span style={{ ...styles.badge('green'), fontSize: '10px' }}>{pkg.itemCount} items &times; {pkg.qty}</span></td>
                                                            <td style={tdStyle}>{pkg.instance.notes || ''}</td>
                                                            <td style={tdStyle}></td>
                                                            <td style={tdStyle}></td>
                                                            <td style={{ ...tdStyle, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(pkg.cost)}</td>
                                                            <td style={tdStyle}>{fmtHrs(pkg.labor)}</td>
                                                        </tr>
                                                        {isPkgExpanded && pkg.expandedItems.map((item, itemIdx) => (
                                                            <tr key={`pkg-item-${pkg.idx}-${itemIdx}`} style={{ backgroundColor: '#0d1117', borderLeft: `3px solid ${pkgColor.b}` }}
                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#182430'}
                                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0d1117'}>
                                                                <td style={tdStyle}></td>
                                                                <td style={tdStyle}></td>
                                                                <td style={{ ...tdStyle, color: '#8b98a5', fontSize: '12px' }}>{fmtQty(item.qty)}</td>
                                                                <td style={{ ...tdStyle, fontSize: '10px', color: '#6e767d' }}>{(item.qtyPerPackage || 1)}&times;{pkg.qty}</td>
                                                                <td style={tdStyle}></td>
                                                                <td style={{ ...tdStyle, fontSize: '12px', color: '#8b98a5' }}>&boxur; {item.manufacturer}</td>
                                                                <td style={{ ...tdStyle, color: '#1d9bf0', fontSize: '12px' }}>{item.model}</td>
                                                                <td style={{ ...tdStyle, fontSize: '12px', color: '#8b98a5' }}>{item.description}</td>
                                                                <td style={{ ...tdStyle, fontSize: '12px', color: '#6e767d' }}>{fmtCost(item.unitCost || 0)}</td>
                                                                <td style={{ ...tdStyle, fontSize: '12px', color: '#6e767d' }}>{fmtHrs(item.laborHrsPerUnit || 0)}</td>
                                                                <td style={{ ...tdStyle, fontSize: '12px', color: '#00ba7c' }}>{fmtCost((item.qty || 0) * (item.unitCost || 0))}</td>
                                                                <td style={{ ...tdStyle, fontSize: '12px', color: '#6e767d' }}>{fmtHrs((item.qty || 0) * (item.laborHrsPerUnit || 0))}</td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                );
                                            })}

                                            {/* Legacy packages (old format) */}
                                            {visibleLegacyPkgs.map(pkg => {
                                                const pkgColor = styles.pkgColor(pkg.name);
                                                const isPkgExpanded = expandedPackages[location.id]?.[pkg.name] !== false;
                                                return (
                                                    <React.Fragment key={`legacy-${pkg.name}`}>
                                                        <tr style={{ backgroundColor: pkgColor.bg, borderLeft: `4px solid ${pkgColor.b}` }}>
                                                            <td style={tdStyle}><input type="checkbox" checked={pkg.indices.every(idx => locationSelected.includes(idx))} onChange={() => {
                                                                const allSelected = pkg.indices.every(idx => locationSelected.includes(idx));
                                                                setSelectedItems(prev => ({ ...prev, [location.id]: allSelected ? (prev[location.id] || []).filter(i => !pkg.indices.includes(i)) : [...new Set([...(prev[location.id] || []), ...pkg.indices])] }));
                                                            }} /></td>
                                                            <td style={tdStyle}><button style={{ ...styles.iconButton, padding: '2px' }} onClick={() => togglePackageExpand(location.id, pkg.name)}>{isPkgExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}</button></td>
                                                            <td colSpan="5" style={{ ...tdStyle, fontWeight: '700' }}><Icons.Package /> <span style={{ color: pkgColor.b }}>{pkg.name}</span> <span style={{ fontSize: '10px', color: '#6e767d' }}>(legacy)</span></td>
                                                            <td style={tdStyle}></td>
                                                            <td style={tdStyle}></td>
                                                            <td style={tdStyle}></td>
                                                            <td style={{ ...tdStyle, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(pkg.cost)}</td>
                                                            <td style={tdStyle}>{fmtHrs(pkg.labor)}</td>
                                                        </tr>
                                                        {isPkgExpanded && pkg.items.map((item, pkgItemIdx) => {
                                                            const i = pkg.indices[pkgItemIdx];
                                                            const isItemSelected = locationSelected.includes(i);
                                                            const itemTotal = calculateItemTotal(item);
                                                            return (
                                                                <tr key={`legacy-item-${i}`} style={{ backgroundColor: isItemSelected ? '#1d3a5c' : '#0d1117', borderLeft: `3px solid ${pkgColor.b}` }} onContextMenu={e => handleContextMenu(e, location.id, i)}>
                                                                    <td style={{ ...tdStyle, paddingLeft: '24px' }}><input type="checkbox" checked={isItemSelected} onChange={e => toggleSelect(location.id, i, e)} /></td>
                                                                    <td style={tdStyle}></td>
                                                                    <td style={tdStyle}><input type="number" value={item.qty} onChange={e => changeQty(location.id, i, e.target.value)} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '60px' }} min="0" /></td>
                                                                    <td style={tdStyle}><input type="text" value={item.notes || ''} onChange={e => changeNotes(location.id, i, e.target.value)} placeholder="..." style={{ ...inputStyle, width: '100%', fontSize: '11px' }} /></td>
                                                                    <td style={tdStyle}><select value={item.system || ''} onChange={e => changeSystem(location.id, i, e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer', fontSize: '11px' }}><option value="">&#x2014;</option>{SYSTEM_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                                                                    <td style={{ ...tdStyle, fontSize: '12px', color: '#8b98a5' }}>&boxur; {item.manufacturer}</td>
                                                                    <td style={tdStyle}><strong>{item.model}</strong></td>
                                                                    <td style={{ ...tdStyle, fontSize: '12px' }}>{item.description}</td>
                                                                    <td style={tdStyle}><input type="number" step="0.01" min="0" value={editingCost[`${location.id}-${i}`] !== undefined ? editingCost[`${location.id}-${i}`] : (item.unitCost || 0)} onChange={e => changeUnitCost(location.id, i, e.target.value)} onBlur={() => blurUnitCost(location.id, i)} onFocus={e => { focusUnitCost(location.id, i, item.unitCost); e.target.select(); }} style={{ ...inputStyle, width: '70px', textAlign: 'right' }} /></td>
                                                                    <td style={tdStyle}><input type="number" step="0.25" min="0" value={editingLabor[`${location.id}-${i}`] !== undefined ? editingLabor[`${location.id}-${i}`] : (item.laborHrsPerUnit || 0)} onChange={e => changeUnitLabor(location.id, i, e.target.value)} onBlur={() => blurUnitLabor(location.id, i)} onFocus={e => { focusUnitLabor(location.id, i, item.laborHrsPerUnit); e.target.select(); }} style={{ ...inputStyle, width: '60px', textAlign: 'right' }} /></td>
                                                                    <td style={{ ...tdStyle, color: '#00ba7c', fontWeight: '600', fontSize: '12px' }}>{fmtCost(itemTotal.cost)}</td>
                                                                    <td style={{ ...tdStyle, fontSize: '12px' }}>{fmtHrs(itemTotal.labor)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })}

                                            {/* Standalone items */}
                                            {visibleStandalone.map(({ item, idx: i }) => {
                                                const isSelected = locationSelected.includes(i);
                                                const hasAccessories = item.accessories?.length > 0;
                                                const isExpanded = expandedItems[location.id]?.[i] !== false;
                                                const itemTotal = calculateItemTotal(item);

                                                return (
                                                    <React.Fragment key={i}>
                                                        <tr
                                                            style={{ backgroundColor: isSelected ? '#1d3a5c' : (item.isPlaceholder ? '#2a1f0a' : 'transparent'), borderLeft: item.isPlaceholder ? '3px solid #f59e0b' : undefined }}
                                                            onContextMenu={e => handleContextMenu(e, location.id, i)}
                                                            onMouseEnter={e => { if (!isSelected && !item.isPlaceholder) e.currentTarget.style.backgroundColor = '#1e2d3d'; }}
                                                            onMouseLeave={e => { if (!isSelected && !item.isPlaceholder) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                        >
                                                            <td style={tdStyle}>
                                                                <input type="checkbox" checked={isSelected} onChange={e => toggleSelect(location.id, i, e)} />
                                                            </td>
                                                            <td style={tdStyle}>
                                                                {hasAccessories && (
                                                                    <button style={{ ...styles.iconButton, padding: '2px' }} onClick={() => toggleItemExpand(location.id, i)}>
                                                                        {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                                                                    </button>
                                                                )}
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <input type="number" value={item.qty} onChange={e => changeQty(location.id, i, e.target.value)} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '60px' }} min="0" />
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <input type="text" value={item.notes || ''} onChange={e => changeNotes(location.id, i, e.target.value)} placeholder="..." style={{ ...inputStyle, width: '100%', fontSize: '11px' }} />
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <select value={item.system || ''} onChange={e => changeSystem(location.id, i, e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer', fontSize: '11px' }}><option value="">&#x2014;</option>{SYSTEM_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select>
                                                            </td>
                                                            <td style={{ ...tdStyle, fontSize: '12px' }}>
                                                                {(item.isPlaceholder || item.isCustom) ? <input type="text" value={item.manufacturer || ''} onChange={e => changeManufacturer(location.id, i, e.target.value)} placeholder="Manufacturer" style={{ ...inputStyle, width: '100%', fontSize: '12px' }} /> : item.manufacturer}
                                                            </td>
                                                            <td style={tdStyle}>
                                                                {(item.isPlaceholder || item.isCustom) ? <input type="text" value={item.model || ''} onChange={e => changeModel(location.id, i, e.target.value)} placeholder="Model / Name" style={{ ...inputStyle, width: '100%', fontWeight: '600' }} /> : <strong>{item.model}</strong>}
                                                            </td>
                                                            <td style={{ ...tdStyle, fontSize: '12px' }}>
                                                                {(item.isPlaceholder || item.isCustom) ? <input type="text" value={item.description || ''} onChange={e => changeDescription(location.id, i, e.target.value)} placeholder="Description" style={{ ...inputStyle, width: '100%', fontSize: '12px' }} /> : item.description}
                                                                {hasAccessories && <span style={{ ...styles.badge('orange'), marginLeft: '6px', fontSize: '9px' }}>{item.accessories.length}</span>}
                                                            </td>
                                                            <td style={tdStyle}><input type="number" step="0.01" min="0" value={editingCost[`${location.id}-${i}`] !== undefined ? editingCost[`${location.id}-${i}`] : (item.unitCost || 0)} onChange={e => changeUnitCost(location.id, i, e.target.value)} onBlur={() => blurUnitCost(location.id, i)} onFocus={e => { focusUnitCost(location.id, i, item.unitCost); e.target.select(); }} style={{ ...inputStyle, width: '70px', textAlign: 'right' }} /></td>
                                                            <td style={tdStyle}><input type="number" step="0.25" min="0" value={editingLabor[`${location.id}-${i}`] !== undefined ? editingLabor[`${location.id}-${i}`] : (item.laborHrsPerUnit || 0)} onChange={e => changeUnitLabor(location.id, i, e.target.value)} onBlur={() => blurUnitLabor(location.id, i)} onFocus={e => { focusUnitLabor(location.id, i, item.laborHrsPerUnit); e.target.select(); }} style={{ ...inputStyle, width: '60px', textAlign: 'right' }} /></td>
                                                            <td style={{ ...tdStyle, color: '#00ba7c', fontWeight: '600', fontSize: '12px' }}>{fmtCost(itemTotal.cost)}</td>
                                                            <td style={{ ...tdStyle, fontSize: '12px' }}>{fmtHrs(itemTotal.labor)}</td>
                                                        </tr>

                                                        {/* Accessories */}
                                                        {hasAccessories && isExpanded && item.accessories.map((acc, accIdx) => {
                                                            const accCostKey = `${location.id}-${i}-${accIdx}`;
                                                            const accLaborKey = `${location.id}-${i}-${accIdx}`;
                                                            return (
                                                            <tr key={`acc-${accIdx}`} style={{ backgroundColor: '#0d1117' }}
                                                                onContextMenu={e => handleContextMenu(e, location.id, i, true, accIdx)}
                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#182430'}
                                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0d1117'}>
                                                                <td style={tdStyle}></td>
                                                                <td style={tdStyle}></td>
                                                                <td style={{ ...tdStyle, paddingLeft: '24px' }}>
                                                                    <input type="number" value={acc.qty} onChange={e => changeAccessoryQty(location.id, i, accIdx, e.target.value)} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '60px' }} min="0" />
                                                                </td>
                                                                <td style={tdStyle}>
                                                                    <input type="text" value={acc.notes || ''} onChange={e => changeAccessoryNotes(location.id, i, accIdx, e.target.value)} placeholder="..." style={{ ...inputStyle, width: '100%', fontSize: '10px' }} />
                                                                </td>
                                                                <td style={tdStyle}></td>
                                                                <td style={{ ...tdStyle, fontSize: '11px', color: '#8b98a5' }}>&boxuR; {acc.manufacturer}</td>
                                                                <td style={{ ...tdStyle, fontSize: '11px', color: '#8b98a5' }}>{acc.model}</td>
                                                                <td style={{ ...tdStyle, fontSize: '11px', color: '#8b98a5' }}>{acc.description}</td>
                                                                <td style={tdStyle}><input type="number" step="0.01" min="0" value={editingAccCost[accCostKey] !== undefined ? editingAccCost[accCostKey] : (acc.unitCost || 0)} onChange={e => changeAccCost(location.id, i, accIdx, e.target.value)} onBlur={() => blurAccCost(location.id, i, accIdx)} onFocus={e => { focusAccCost(location.id, i, accIdx, acc.unitCost); e.target.select(); }} style={{ ...inputStyle, width: '70px', textAlign: 'right', fontSize: '10px' }} /></td>
                                                                <td style={tdStyle}><input type="number" step="0.25" min="0" value={editingAccLabor[accLaborKey] !== undefined ? editingAccLabor[accLaborKey] : (acc.laborHrsPerUnit || 0)} onChange={e => changeAccLabor(location.id, i, accIdx, e.target.value)} onBlur={() => blurAccLabor(location.id, i, accIdx)} onFocus={e => { focusAccLabor(location.id, i, accIdx, acc.laborHrsPerUnit); e.target.select(); }} style={{ ...inputStyle, width: '60px', textAlign: 'right', fontSize: '10px' }} /></td>
                                                                <td style={{ ...tdStyle, fontSize: '11px', color: '#6e9e6e' }}>{fmtCost((acc.qty || 0) * (acc.unitCost || 0))}</td>
                                                                <td style={{ ...tdStyle, fontSize: '11px' }}>
                                                                    <span style={{ color: '#8b98a5' }}>{fmtHrs((acc.qty || 0) * (acc.laborHrsPerUnit || 0))}</span>
                                                                    <button style={{ ...styles.iconButton, marginLeft: '4px', color: '#6e767d', padding: '2px' }} onClick={() => removeAccessory(location.id, i, accIdx)}>
                                                                        <Icons.X />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Context Menu */}
            {contextMenu && !contextMenu.isAccessory && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    backgroundColor: '#21262d',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '4px',
                    zIndex: 1000,
                    minWidth: '200px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                }}>
                    {(() => {
                        const location = allLocations.find(l => l.id === contextMenu.locationId);
                        const item = location?.items[contextMenu.itemIdx];
                        const itemCount = location?.items?.length || 0;
                        const groupedItems = location ? getGroupedItems(location) : { packages: [], standalone: [] };

                        return (
                            <>
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { onAddAccessoryToItem(contextMenu.locationId, contextMenu.itemIdx); setContextMenu(null); }}>
                                    <Icons.Plus /> Add Accessory
                                </button>
                                {itemCount > 1 && (
                                    <button
                                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                        onClick={() => { onConvertToAccessory(contextMenu.locationId, contextMenu.itemIdx); setContextMenu(null); }}>
                                        <Icons.ChevronDown /> Convert to Accessory
                                    </button>
                                )}
                                <div style={{ borderTop: '1px solid #30363d', margin: '4px 0' }} />
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { onCopy([{ ...item }]); setContextMenu(null); }}>
                                    <Icons.Copy /> Copy
                                </button>
                                {onReplaceItem && (
                                    <button
                                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                        onClick={() => { onReplaceItem(contextMenu.itemIdx, contextMenu.locationId); setContextMenu(null); }}>
                                        <Icons.Sync /> Replace Item
                                    </button>
                                )}
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { onSavePackage([{ ...item }], [contextMenu.itemIdx], contextMenu.locationId); setContextMenu(null); }}>
                                    <Icons.Package /> Save as New Package
                                </button>
                                {groupedItems.legacyPackages.length > 0 && (
                                    <>
                                        <div style={{ padding: '4px 12px', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase' }}>Move to Package</div>
                                        {groupedItems.legacyPackages.map(pkg => {
                                            const pkgColor = styles.pkgColor(pkg.name);
                                            return (
                                                <button
                                                    key={pkg.name}
                                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '6px 12px 6px 20px', fontSize: '12px' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    onClick={() => { onMoveToPackage(contextMenu.locationId, contextMenu.itemIdx, pkg.name); setContextMenu(null); }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: pkgColor.b, marginRight: '8px' }}></span>
                                                    {pkg.name}
                                                </button>
                                            );
                                        })}
                                    </>
                                )}
                                <div style={{ borderTop: '1px solid #30363d', margin: '4px 0' }} />
                                {onAddToCatalog && (
                                    <button
                                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#1d9bf0' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                        onClick={() => { onAddToCatalog(item); setContextMenu(null); }}>
                                        <Icons.Database /> Add to Catalog
                                    </button>
                                )}
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f85149' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { removeItem(contextMenu.locationId, contextMenu.itemIdx); setContextMenu(null); }}>
                                    <Icons.Trash /> Delete
                                </button>
                            </>
                        );
                    })()}
                </div>
            )}

            {/* Accessory Context Menu */}
            {contextMenu && contextMenu.isAccessory && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    backgroundColor: '#21262d',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    padding: '4px',
                    zIndex: 1000,
                    minWidth: '180px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                }}>
                    <button
                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => { promoteAccessoryToItem(contextMenu.locationId, contextMenu.itemIdx, contextMenu.accIdx); setContextMenu(null); }}>
                        <Icons.ChevronUp /> Promote to Item
                    </button>
                    <button
                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f85149' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => { removeAccessory(contextMenu.locationId, contextMenu.itemIdx, contextMenu.accIdx); setContextMenu(null); }}>
                        <Icons.Trash /> Remove Accessory
                    </button>
                </div>
            )}
        </div>
    );
}
