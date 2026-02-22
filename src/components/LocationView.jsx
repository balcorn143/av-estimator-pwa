import React from 'react'
const { useState, useEffect, useMemo, useRef } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { fmtCost, fmtQty, fmtHrs, formatHours } from '../utils/formatters'
import { calculateTotals, itemMatchesSearch } from '../utils/catalog'
import { resolvePackageInstance } from '../utils/packages'
import { SYSTEM_OPTIONS, DEFAULT_COLUMNS } from '../constants'
import ColumnLayoutManager from './ColumnLayoutManager'
import useFlexibleColumns from '../hooks/useFlexibleColumns'

export default function LocationView({ location, depth, locationPath, onUpdate, onSearch, clipboard, onCopy, onPaste, onSavePackage, onSaveTemplate, onApplyTemplate, templates, catalog, onAddAccessoryToItem, onConvertToAccessory, onUngroupPackage, onMoveToPackage, compactMode, onAddToCatalog, catalogPkgs, projectPkgs, onReplaceItem, onReplacePackage, searchFilter }) {
    const [selectedItems, setSelectedItems] = useState([]);
    const [expandedItems, setExpandedItems] = useState({}); // Track which items are expanded (by index)
    const [expandedPackages, setExpandedPackages] = useState({}); // Track which packages are expanded
    const [allExpanded, setAllExpanded] = useState(true);
    const [contextMenu, setContextMenu] = useState(null); // { x, y, itemIdx, isAccessory, accIdx, isPackage, packageName }

    // Compact mode styles
    const compactStyles = {
        td: compactMode ? { padding: '4px 8px', fontSize: '11px' } : {},
        th: compactMode ? { padding: '6px 8px', fontSize: '10px' } : {},
        input: compactMode ? { padding: '2px 6px', fontSize: '11px' } : {},
    };

    // Flexible columns with resize and reorder
    const { columns, startResize, startDrag, onDragOver, onDragLeave, onDrop, onDragEnd, dragOverIndex, savedLayouts, saveLayout, loadLayout, deleteLayout, resetColumns } = useFlexibleColumns(DEFAULT_COLUMNS, 'workspace');

    // Calculate totals including accessories
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

    // Render a cell based on column ID for main items
    const renderItemCell = (col, item, itemIdx, { isSelected, hasAccessories, isExpanded, itemTotal, isPackageItem, pkgColor, changeQty, changeNotes, changeSystem, toggleSelect, toggleItemExpand }) => {
        const tdStyle = { ...styles.td, ...compactStyles.td };
        const inputStyle = { ...styles.inputSmall, ...compactStyles.input };
        switch (col.id) {
            case 'checkbox':
                return <td key={col.id} style={{ ...tdStyle, paddingLeft: isPackageItem ? '24px' : undefined }}><input type="checkbox" checked={isSelected} onChange={e => toggleSelect(itemIdx, e)} /></td>;
            case 'expand':
                return <td key={col.id} style={{ ...tdStyle, padding: compactMode ? '2px 4px' : '8px 4px' }}>{hasAccessories && (
                    <button style={{ ...styles.iconButton, padding: '2px' }} onClick={() => toggleItemExpand(itemIdx)}>
                        {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                    </button>
                )}</td>;
            case 'qty':
                return <td key={col.id} style={tdStyle}><input type="number" value={item.qty} onChange={e => changeQty(itemIdx, e.target.value)} onFocus={e => e.target.select()} style={{ ...inputStyle, width: compactMode ? '50px' : '60px' }} min="0" /></td>;
            case 'notes':
                return <td key={col.id} style={tdStyle}><input type="text" value={item.notes || ''} onChange={e => changeNotes(itemIdx, e.target.value)} placeholder="..." style={{ ...inputStyle, width: '100%', fontSize: compactMode ? '10px' : '11px' }} /></td>;
            case 'system':
                return <td key={col.id} style={tdStyle}><select value={item.system || ''} onChange={e => changeSystem(itemIdx, e.target.value)} style={{ ...inputStyle, width: '100%', cursor: 'pointer', fontSize: compactMode ? '10px' : '11px' }}><option value="">—</option>{SYSTEM_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></td>;
            case 'manufacturer':
                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '11px' : '12px', color: isPackageItem ? '#8b98a5' : undefined }}>
                    {isPackageItem && <span style={{ color: '#6e767d' }}>├ </span>}
                    {(item.isPlaceholder || item.isCustom) ? <input type="text" value={item.manufacturer || ''} onChange={e => changeManufacturer(itemIdx, e.target.value)} placeholder="Manufacturer" style={{ ...inputStyle, width: '100%', fontSize: compactMode ? '11px' : '12px' }} /> : item.manufacturer}
                </td>;
            case 'model':
                return <td key={col.id} style={tdStyle}>
                    {(item.isPlaceholder || item.isCustom) ? <input type="text" value={item.model || ''} onChange={e => changeModel(itemIdx, e.target.value)} placeholder="Model / Name" style={{ ...inputStyle, width: '100%', fontWeight: '600' }} /> : <strong>{item.model}</strong>}
                </td>;
            case 'description':
                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '11px' : '12px' }}>
                    {(item.isPlaceholder || item.isCustom) ? <input type="text" value={item.description || ''} onChange={e => changeDescription(itemIdx, e.target.value)} placeholder="Description" style={{ ...inputStyle, width: '100%', fontSize: compactMode ? '11px' : '12px' }} /> : item.description}
                    {hasAccessories && <span style={{ ...styles.badge('orange'), marginLeft: '6px', fontSize: '9px' }}>{item.accessories.length}</span>}
                </td>;
            case 'unitCost':
                return <td key={col.id} style={tdStyle}><input type="number" step="0.01" min="0" value={editingCost[itemIdx] !== undefined ? editingCost[itemIdx] : (item.unitCost || 0)} onChange={e => changeUnitCost(itemIdx, e.target.value)} onBlur={() => blurUnitCost(itemIdx)} onFocus={e => { focusUnitCost(itemIdx, item.unitCost); e.target.select(); }} style={{ ...inputStyle, width: compactMode ? '70px' : '80px', textAlign: 'right' }} /></td>;
            case 'unitLabor':
                return <td key={col.id} style={tdStyle}><input type="number" step="0.25" min="0" value={editingLabor[itemIdx] !== undefined ? editingLabor[itemIdx] : (item.laborHrsPerUnit || 0)} onChange={e => changeUnitLabor(itemIdx, e.target.value)} onBlur={() => blurUnitLabor(itemIdx)} onFocus={e => { focusUnitLabor(itemIdx, item.laborHrsPerUnit); e.target.select(); }} style={{ ...inputStyle, width: compactMode ? '55px' : '65px', textAlign: 'right' }} /></td>;
            case 'extCost':
                return <td key={col.id} style={{ ...tdStyle, color: '#00ba7c', fontWeight: '600', fontSize: compactMode ? '11px' : '12px' }}>{fmtCost(itemTotal.cost)}</td>;
            case 'extLabor':
                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '11px' : '12px' }}>{fmtHrs(itemTotal.labor)}</td>;
            default:
                return <td key={col.id} style={tdStyle}></td>;
        }
    };

    // Render a cell for accessories
    const renderAccessoryCell = (col, acc, itemIdx, accIdx, { pkgColor, changeAccessoryQty, changeAccessoryNotes, removeAccessory }) => {
        const tdStyle = { ...styles.td, ...compactStyles.td, fontSize: compactMode ? '10px' : '11px', color: '#6e767d' };
        const inputStyle = { ...styles.inputSmall, ...compactStyles.input };
        switch (col.id) {
            case 'checkbox':
                return <td key={col.id} style={tdStyle}></td>;
            case 'expand':
                return <td key={col.id} style={tdStyle}></td>;
            case 'qty':
                return <td key={col.id} style={{ ...tdStyle, paddingLeft: pkgColor ? '40px' : '24px' }}><input type="number" value={acc.qty} onChange={e => changeAccessoryQty(itemIdx, accIdx, e.target.value)} onFocus={e => e.target.select()} style={{ ...inputStyle, width: compactMode ? '50px' : '60px' }} min="0" /></td>;
            case 'notes':
                return <td key={col.id} style={tdStyle}><input type="text" value={acc.notes || ''} onChange={e => changeAccessoryNotes(itemIdx, accIdx, e.target.value)} placeholder="..." style={{ ...inputStyle, width: '100%', fontSize: compactMode ? '9px' : '10px' }} /></td>;
            case 'system':
                return <td key={col.id} style={tdStyle}></td>;
            case 'manufacturer':
                return <td key={col.id} style={tdStyle}><span style={{ color: '#4a5568' }}>└ </span>{acc.manufacturer}</td>;
            case 'model':
                return <td key={col.id} style={{ ...tdStyle, color: '#8b98a5' }}>{acc.model}</td>;
            case 'description':
                return <td key={col.id} style={tdStyle}>{acc.description}</td>;
            case 'unitCost': {
                const accKey = `${itemIdx}-${accIdx}`;
                return <td key={col.id} style={tdStyle}><input type="number" step="0.01" min="0" value={editingAccCost[accKey] !== undefined ? editingAccCost[accKey] : (acc.unitCost || 0)} onChange={e => changeAccessoryUnitCost(itemIdx, accIdx, e.target.value)} onBlur={() => blurAccessoryUnitCost(itemIdx, accIdx)} onFocus={e => { focusAccCost(itemIdx, accIdx, acc.unitCost); e.target.select(); }} style={{ ...inputStyle, width: compactMode ? '70px' : '80px', textAlign: 'right', fontSize: compactMode ? '10px' : '11px' }} /></td>;
            }
            case 'unitLabor': {
                const accKey = `${itemIdx}-${accIdx}`;
                return <td key={col.id} style={tdStyle}><input type="number" step="0.25" min="0" value={editingAccLabor[accKey] !== undefined ? editingAccLabor[accKey] : (acc.laborHrsPerUnit || 0)} onChange={e => changeAccessoryUnitLabor(itemIdx, accIdx, e.target.value)} onBlur={() => blurAccessoryUnitLabor(itemIdx, accIdx)} onFocus={e => { focusAccLabor(itemIdx, accIdx, acc.laborHrsPerUnit); e.target.select(); }} style={{ ...inputStyle, width: compactMode ? '55px' : '65px', textAlign: 'right', fontSize: compactMode ? '10px' : '11px' }} /></td>;
            }
            case 'extCost':
                return <td key={col.id} style={{ ...tdStyle, color: '#4a6e4a' }}>{fmtCost((acc.qty || 0) * (acc.unitCost || 0))}</td>;
            case 'extLabor':
                return <td key={col.id} style={tdStyle}>
                    <span>{fmtHrs((acc.qty || 0) * (acc.laborHrsPerUnit || 0))}</span>
                    <button style={{ ...styles.iconButton, marginLeft: '4px', color: '#4a5568', padding: '2px' }} onClick={() => removeAccessory(itemIdx, accIdx)}><Icons.X /></button>
                </td>;
            default:
                return <td key={col.id} style={tdStyle}></td>;
        }
    };

    // Render package header cells
    const renderPackageHeaderCell = (col, colIndex, pkg, { pkgColor, allPkgItemsSelected, somePkgItemsSelected, togglePkgSelect, isPkgExpanded, togglePackageExpand }) => {
        const tdStyle = { ...styles.td };
        // For the first few data columns, we span them for the package name
        const dataColStart = columns.findIndex(c => c.id === 'qty');
        const dataColEnd = columns.findIndex(c => c.id === 'unitCost');

        if (col.id === 'checkbox') {
            return <td key={col.id} style={tdStyle}><input type="checkbox" checked={allPkgItemsSelected} ref={el => { if (el) el.indeterminate = somePkgItemsSelected && !allPkgItemsSelected; }} onChange={togglePkgSelect} /></td>;
        }
        if (col.id === 'expand') {
            return <td key={col.id} style={{ ...tdStyle, padding: '8px 4px' }}><button style={{ ...styles.iconButton, padding: '2px' }} onClick={() => togglePackageExpand(pkg.name)}>{isPkgExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}</button></td>;
        }
        if (colIndex === dataColStart) {
            const spanCount = dataColEnd - dataColStart;
            return <td key={col.id} colSpan={spanCount} style={{ ...tdStyle, fontWeight: '700' }}><Icons.Package /> <span style={{ color: pkgColor.b }}>{pkg.name}</span><span style={{ ...styles.badge('green'), marginLeft: '8px', fontSize: '10px' }}>{pkg.itemCount} items</span></td>;
        }
        if (colIndex > dataColStart && colIndex < dataColEnd) {
            return null; // Spanned
        }
        if (col.id === 'unitCost' || col.id === 'unitLabor') {
            return <td key={col.id} style={tdStyle}></td>;
        }
        if (col.id === 'extCost') {
            return <td key={col.id} style={{ ...tdStyle, color: '#00ba7c', fontWeight: '700' }}>{fmtCost(pkg.cost)}</td>;
        }
        if (col.id === 'extLabor') {
            return <td key={col.id} style={{ ...tdStyle, fontWeight: '600' }}>{fmtHrs(pkg.labor)}</td>;
        }
        return <td key={col.id} style={tdStyle}></td>;
    };

    // Group items by package
    const groupedItems = useMemo(() => {
        const items = location.items || [];
        const packageInstances = [];
        const legacyPackages = {};
        const standalone = [];

        items.forEach((item, idx) => {
            if (item.type === 'package') {
                const resolved = resolvePackageInstance(item, catalogPkgs, projectPkgs);
                packageInstances.push({
                    instance: item,
                    idx,
                    resolved,
                    name: item.packageName,
                    qty: item.qty || 1,
                    isOutOfDate: resolved?.isOutOfDate || false,
                    isMissing: resolved?.isMissing || false,
                    cost: resolved?.totalCost || 0,
                    labor: resolved?.totalLabor || 0,
                    itemCount: resolved?.expandedItems?.length || 0,
                    expandedItems: resolved?.expandedItems || [],
                });
            } else if (item.packageName) {
                // Legacy format -- backward compat
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
        Object.values(legacyPackages).forEach(pkg => {
            pkg.cost = pkg.items.reduce((s, item) => s + calculateItemTotal(item).cost, 0);
            pkg.labor = pkg.items.reduce((s, item) => s + calculateItemTotal(item).labor, 0);
            pkg.itemCount = pkg.items.reduce((count, item) => count + 1 + (item.accessories?.length || 0), 0);
        });

        return { packages: packageInstances, legacyPackages: Object.values(legacyPackages), standalone };
    }, [location.items, catalogPkgs, projectPkgs]);

    // Apply search filter to visible items
    const filteredStandalone = useMemo(() => {
        if (!searchFilter) return groupedItems.standalone;
        return groupedItems.standalone.filter(({ item }) => itemMatchesSearch(item, searchFilter));
    }, [groupedItems.standalone, searchFilter]);
    const filteredPackages = useMemo(() => {
        if (!searchFilter) return groupedItems.packages;
        return groupedItems.packages.filter(pkg =>
            itemMatchesSearch({ manufacturer: pkg.name, model: '', description: '' }, searchFilter) ||
            pkg.expandedItems?.some(item => itemMatchesSearch(item, searchFilter))
        );
    }, [groupedItems.packages, searchFilter]);
    const filteredLegacyPackages = useMemo(() => {
        if (!searchFilter) return groupedItems.legacyPackages;
        return groupedItems.legacyPackages.filter(pkg =>
            pkg.items.some(item => itemMatchesSearch(item, searchFilter))
        );
    }, [groupedItems.legacyPackages, searchFilter]);
    // Collect all visible item indices for select-all
    const visibleIndices = useMemo(() => {
        const indices = [];
        filteredPackages.forEach(pkg => indices.push(pkg.idx));
        filteredLegacyPackages.forEach(pkg => pkg.indices.forEach(i => indices.push(i)));
        filteredStandalone.forEach(({ idx }) => indices.push(idx));
        return indices;
    }, [filteredPackages, filteredLegacyPackages, filteredStandalone]);

    const totals = calculateTotals(location, catalogPkgs, projectPkgs);
    // Count line items including accessories and package contents
    const directItems = (location.items || []).reduce((count, item) => {
        if (item.type === 'package') {
            const resolved = resolvePackageInstance(item, catalogPkgs, projectPkgs);
            return count + (resolved?.expandedItems?.length || 0);
        }
        return count + 1 + (item.accessories?.length || 0);
    }, 0);

    // Calculate direct totals including accessories
    const directCost = totals.cost - ((location.children || []).reduce((s, c) => s + calculateTotals(c, catalogPkgs, projectPkgs).cost, 0));
    const directLabor = totals.labor - ((location.children || []).reduce((s, c) => s + calculateTotals(c, catalogPkgs, projectPkgs).labor, 0));
    const subCount = (location.children || []).length;

    // Check if any items have accessories or packages
    const hasAnyAccessories = (location.items || []).some(item => item.accessories?.length > 0);
    const hasAnyPackages = groupedItems.packages.length > 0 || groupedItems.legacyPackages.length > 0;
    const hasExpandableContent = hasAnyAccessories || hasAnyPackages;

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu]);

    const handleContextMenu = (e, itemIdx, isAccessory = false, accIdx = null, isPackage = false, packageName = null) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, itemIdx, isAccessory, accIdx, isPackage, packageName });
    };

    const changeQty = (itemIdx, q) => {
        const items = [...location.items];
        const newQty = Math.max(0, parseInt(q) || 0);
        items[itemIdx] = { ...items[itemIdx], qty: newQty };
        // Also scale accessories proportionally if they exist
        if (items[itemIdx].accessories) {
            const oldQty = location.items[itemIdx].qty || 1;
            const ratio = newQty / oldQty;
            items[itemIdx].accessories = items[itemIdx].accessories.map(acc => ({
                ...acc,
                qty: Math.round((acc.qty || 0) * ratio) || acc.qtyPer || 1
            }));
        }
        onUpdate(location.id, items);
    };

    const changeNotes = (itemIdx, notes) => {
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], notes };
        onUpdate(location.id, items);
    };

    const changeSystem = (itemIdx, system) => {
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], system };
        onUpdate(location.id, items);
    };

    const changeManufacturer = (itemIdx, manufacturer) => {
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], manufacturer };
        onUpdate(location.id, items);
    };
    const changeModel = (itemIdx, model) => {
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], model };
        onUpdate(location.id, items);
    };
    const changeDescription = (itemIdx, description) => {
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], description };
        onUpdate(location.id, items);
    };

    const addEmptyItem = () => {
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
        onUpdate(location.id, [...(location.items || []), newItem]);
    };

    const [editingCost, setEditingCost] = useState({}); // { [itemIdx]: string }
    const [editingLabor, setEditingLabor] = useState({}); // { [itemIdx]: string }
    const [editingAccCost, setEditingAccCost] = useState({}); // { [`${itemIdx}-${accIdx}`]: string }
    const [editingAccLabor, setEditingAccLabor] = useState({}); // { [`${itemIdx}-${accIdx}`]: string }

    const focusUnitCost = (itemIdx, currentVal) => {
        setEditingCost(prev => ({ ...prev, [itemIdx]: String(currentVal || 0) }));
    };
    const changeUnitCost = (itemIdx, val) => {
        setEditingCost(prev => ({ ...prev, [itemIdx]: val }));
    };
    const blurUnitCost = (itemIdx) => {
        const val = parseFloat(editingCost[itemIdx]) || 0;
        setEditingCost(prev => { const n = { ...prev }; delete n[itemIdx]; return n; });
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], unitCost: val };
        onUpdate(location.id, items);
    };

    const focusUnitLabor = (itemIdx, currentVal) => {
        setEditingLabor(prev => ({ ...prev, [itemIdx]: String(currentVal || 0) }));
    };
    const changeUnitLabor = (itemIdx, val) => {
        setEditingLabor(prev => ({ ...prev, [itemIdx]: val }));
    };
    const blurUnitLabor = (itemIdx) => {
        const val = parseFloat(editingLabor[itemIdx]) || 0;
        setEditingLabor(prev => { const n = { ...prev }; delete n[itemIdx]; return n; });
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], laborHrsPerUnit: val };
        onUpdate(location.id, items);
    };

    const focusAccCost = (itemIdx, accIdx, currentVal) => {
        setEditingAccCost(prev => ({ ...prev, [`${itemIdx}-${accIdx}`]: String(currentVal || 0) }));
    };
    const changeAccessoryUnitCost = (itemIdx, accIdx, val) => {
        setEditingAccCost(prev => ({ ...prev, [`${itemIdx}-${accIdx}`]: val }));
    };
    const blurAccessoryUnitCost = (itemIdx, accIdx) => {
        const key = `${itemIdx}-${accIdx}`;
        const val = parseFloat(editingAccCost[key]) || 0;
        setEditingAccCost(prev => { const n = { ...prev }; delete n[key]; return n; });
        const items = [...location.items];
        const accessories = [...items[itemIdx].accessories];
        accessories[accIdx] = { ...accessories[accIdx], unitCost: val };
        items[itemIdx] = { ...items[itemIdx], accessories };
        onUpdate(location.id, items);
    };

    const focusAccLabor = (itemIdx, accIdx, currentVal) => {
        setEditingAccLabor(prev => ({ ...prev, [`${itemIdx}-${accIdx}`]: String(currentVal || 0) }));
    };
    const changeAccessoryUnitLabor = (itemIdx, accIdx, val) => {
        setEditingAccLabor(prev => ({ ...prev, [`${itemIdx}-${accIdx}`]: val }));
    };
    const blurAccessoryUnitLabor = (itemIdx, accIdx) => {
        const key = `${itemIdx}-${accIdx}`;
        const val = parseFloat(editingAccLabor[key]) || 0;
        setEditingAccLabor(prev => { const n = { ...prev }; delete n[key]; return n; });
        const items = [...location.items];
        const accessories = [...items[itemIdx].accessories];
        accessories[accIdx] = { ...accessories[accIdx], laborHrsPerUnit: val };
        items[itemIdx] = { ...items[itemIdx], accessories };
        onUpdate(location.id, items);
    };

    const changeAccessoryNotes = (itemIdx, accIdx, notes) => {
        const items = [...location.items];
        items[itemIdx] = { ...items[itemIdx], accessories: items[itemIdx].accessories.map((a, i) => i === accIdx ? { ...a, notes } : a) };
        onUpdate(location.id, items);
    };

    const changeAccessoryQty = (itemIdx, accIdx, q) => {
        const items = [...location.items];
        const accessories = [...items[itemIdx].accessories];
        accessories[accIdx] = { ...accessories[accIdx], qty: Math.max(0, parseInt(q) || 0) };
        items[itemIdx] = { ...items[itemIdx], accessories };
        onUpdate(location.id, items);
    };

    const removeAccessory = (itemIdx, accIdx) => {
        const items = [...location.items];
        items[itemIdx] = {
            ...items[itemIdx],
            accessories: items[itemIdx].accessories.filter((_, i) => i !== accIdx)
        };
        onUpdate(location.id, items);
    };

    const deleteItem = (idx) => {
        onUpdate(location.id, location.items.filter((_, i) => i !== idx));
        setSelectedItems(prev => prev.filter(i => i !== idx));
    };

    const convertToAccessory = (itemIdx, parentIdx) => {
        if (itemIdx === parentIdx) return;
        const items = [...location.items];
        const itemToConvert = items[itemIdx];
        const parentItem = items[parentIdx];

        // Add as accessory to parent
        const newAccessory = {
            ...itemToConvert,
            qtyPer: itemToConvert.qty
        };
        items[parentIdx] = {
            ...parentItem,
            accessories: [...(parentItem.accessories || []), newAccessory]
        };

        // Remove from main list
        const newItems = items.filter((_, i) => i !== itemIdx);
        onUpdate(location.id, newItems);
    };

    const promoteAccessoryToItem = (itemIdx, accIdx) => {
        const items = [...location.items];
        const accessory = items[itemIdx].accessories[accIdx];

        // Remove from accessories
        items[itemIdx] = {
            ...items[itemIdx],
            accessories: items[itemIdx].accessories.filter((_, i) => i !== accIdx)
        };

        // Add as standalone item
        const newItem = { ...accessory };
        delete newItem.qtyPer;
        items.push(newItem);

        onUpdate(location.id, items);
    };

    const del = (indices) => {
        onUpdate(location.id, location.items.filter((_, idx) => !indices.includes(idx)));
        setSelectedItems([]);
    };

    const mainItemCount = (location.items || []).length; // Just main items, not accessories
    const lastClickedIdx = useRef(null);
    const toggleSelect = (idx, e) => {
        if (e && e.shiftKey && lastClickedIdx.current !== null) {
            // Shift+Click: select range between last clicked and current
            const start = Math.min(lastClickedIdx.current, idx);
            const end = Math.max(lastClickedIdx.current, idx);
            const range = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedItems(prev => {
                const combined = new Set([...prev, ...range]);
                return [...combined];
            });
        } else if (e && (e.ctrlKey || e.metaKey)) {
            // Ctrl+Click: toggle individual
            setSelectedItems(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
        } else {
            // Normal click on checkbox: toggle individual
            setSelectedItems(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
        }
        lastClickedIdx.current = idx;
    };
    const selectAll = () => {
        if (searchFilter) {
            // When filtering, only select/deselect visible items
            const allVisible = visibleIndices.every(i => selectedItems.includes(i));
            if (allVisible) {
                setSelectedItems(prev => prev.filter(i => !visibleIndices.includes(i)));
            } else {
                setSelectedItems(prev => [...new Set([...prev, ...visibleIndices])]);
            }
        } else {
            setSelectedItems(selectedItems.length === mainItemCount ? [] : location.items.map((_, i) => i));
        }
    };
    const handleCopy = () => { onCopy(selectedItems.map(idx => ({ ...location.items[idx] }))); };
    const handlePaste = () => { onPaste(location.id); setSelectedItems([]); };
    const handleSavePackage = () => {
        if (selectedItems.length > 0) {
            onSavePackage(selectedItems.map(idx => ({ ...location.items[idx] })), selectedItems);
        }
    };

    const toggleItemExpand = (idx) => {
        setExpandedItems(prev => ({ ...prev, [idx]: !(prev[idx] ?? true) }));
    };

    const togglePackageExpand = (pkgName) => {
        setExpandedPackages(prev => ({ ...prev, [pkgName]: !(prev[pkgName] ?? true) }));
    };

    const expandAll = () => {
        const expandedI = {};
        const expandedP = {};
        location.items?.forEach((item, idx) => {
            expandedI[idx] = true;
        });
        groupedItems.packages.forEach(pkg => { expandedP[pkg.name] = true; });
        groupedItems.legacyPackages.forEach(pkg => { expandedP[pkg.name] = true; });
        setExpandedItems(expandedI);
        setExpandedPackages(expandedP);
        setAllExpanded(true);
    };

    const collapseAll = () => {
        const collapsedI = {};
        const collapsedP = {};
        location.items?.forEach((item, idx) => {
            collapsedI[idx] = false;
        });
        groupedItems.packages.forEach(pkg => { collapsedP[pkg.name] = false; });
        groupedItems.legacyPackages.forEach(pkg => { collapsedP[pkg.name] = false; });
        setExpandedItems(collapsedI);
        setExpandedPackages(collapsedP);
        setAllExpanded(false);
    };

    // Initialize expanded state
    useEffect(() => {
        if (allExpanded) expandAll();
    }, [location.items]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedItems.length > 0) { e.preventDefault(); handleCopy(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard.length > 0) { e.preventDefault(); handlePaste(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedItems, clipboard, location.items]);

    return (
        <div>
            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ marginTop: '4px' }}>{depth === 0 ? <Icons.Location /> : <Icons.Sublocation />}</div>
                        <div>
                            {locationPath && locationPath.length > 0 && (
                                <div style={{ fontSize: '13px', color: '#6e767d', marginBottom: '4px' }}>
                                    {locationPath.join(' > ')}
                                </div>
                            )}
                            <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '700' }}>{location.name}</h2>
                        </div>
                    </div>
                    {directItems > 0 && <button style={{ ...styles.smallButton, backgroundColor: '#2d1a3d', color: '#a78bfa' }} onClick={onSaveTemplate}><Icons.Template /> Save as Template</button>}
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ backgroundColor: '#1a2e1a', padding: '16px 20px', borderRadius: '12px', border: '1px solid #2d4a2d' }}>
                        <div style={{ fontSize: '12px', color: '#6e9e6e', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Material</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#00ba7c' }}>{fmtCost(directCost)}</div>
                        {subCount > 0 && <div style={{ fontSize: '12px', color: '#6e9e6e', marginTop: '4px' }}>+{fmtCost(totals.cost - directCost)} sublocations</div>}
                    </div>
                    <div style={{ backgroundColor: '#1a2a3e', padding: '16px 20px', borderRadius: '12px', border: '1px solid #2d4a6e' }}>
                        <div style={{ fontSize: '12px', color: '#6e8eae', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Labor</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#1d9bf0' }}>{fmtHrs(directLabor)}</div>
                        {subCount > 0 && <div style={{ fontSize: '12px', color: '#6e8eae', marginTop: '4px' }}>+{fmtHrs(totals.labor - directLabor)} sublocations</div>}
                    </div>
                    <div style={{ backgroundColor: '#1a1f26', padding: '16px 20px', borderRadius: '12px', border: '1px solid #2f3336' }}>
                        <div style={{ fontSize: '12px', color: '#6e767d', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Line Items</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: '#e7e9ea' }}>{directItems}</div>
                        {subCount > 0 && <div style={{ fontSize: '12px', color: '#6e767d', marginTop: '4px' }}>{subCount} sublocations</div>}
                    </div>
                </div>
            </div>

            {subCount > 0 && (
                <div style={{ ...styles.card, marginBottom: '24px' }}>
                    <div style={styles.cardTitle}><Icons.Layers /> Sublocations ({subCount})</div>
                    <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                        {location.children.map(child => {
                            const t = calculateTotals(child, catalogPkgs, projectPkgs);
                            return (
                                <div key={child.id} style={{ backgroundColor: '#0f1419', padding: '12px', borderRadius: '8px', border: '1px solid #2f3336' }}>
                                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{child.name}</div>
                                    <div style={{ fontSize: '12px', color: '#6e767d', display: 'flex', gap: '12px' }}>
                                        <span style={{ color: '#00ba7c' }}>{fmtCost(t.cost)}</span>
                                        <span style={{ color: '#1d9bf0' }}>{formatHours(t.labor)}</span>
                                        <span>{t.itemCount} items</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {location.items?.length > 0 ? (
                <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #2f3336', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ ...styles.cardTitle, marginBottom: 0 }}>
                            <Icons.Package /> Components ({directItems})
                            {(groupedItems.packages.length + groupedItems.legacyPackages.length) > 0 && <span style={styles.badge('green')}>{groupedItems.packages.length + groupedItems.legacyPackages.length} packages</span>}
                            {selectedItems.length > 0 && <span style={styles.badge('blue')}>{selectedItems.length} selected</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <ColumnLayoutManager savedLayouts={savedLayouts} onSave={saveLayout} onLoad={loadLayout} onDelete={deleteLayout} onReset={resetColumns} />
                            {hasExpandableContent && (
                                <>
                                    <button style={styles.smallButton} onClick={expandAll} title="Expand All"><Icons.ChevronsDown /> Expand</button>
                                    <button style={styles.smallButton} onClick={collapseAll} title="Collapse All"><Icons.ChevronsUp /> Collapse</button>
                                </>
                            )}
                            {selectedItems.length > 0 && (
                                <>
                                    <button style={styles.smallButton} onClick={handleCopy}><Icons.Copy /> Copy</button>
                                    <button style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c' }} onClick={handleSavePackage}><Icons.Package /> Save as Package</button>
                                    <button style={{ ...styles.smallButton, backgroundColor: '#5c2626', color: '#f87171' }} onClick={() => del(selectedItems)}><Icons.Trash /> Delete</button>
                                </>
                            )}
                            {clipboard.length > 0 && <button style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c' }} onClick={handlePaste}><Icons.Clipboard /> Paste ({clipboard.length})</button>}
                            {templates && templates.length > 0 && <button style={{ ...styles.smallButton, backgroundColor: '#2d1a3d', color: '#a78bfa' }} onClick={onApplyTemplate}><Icons.Template /> Apply Template</button>}
                            <button style={styles.button('primary')} onClick={onSearch}><Icons.Plus /> Add</button>
                            <button style={{ ...styles.smallButton, backgroundColor: '#2a1f0a', color: '#f59e0b', border: '1px solid #f59e0b40' }} onClick={addEmptyItem} title="Add empty placeholder line item"><Icons.Plus /> Empty Item</button>
                        </div>
                    </div>
                    <div style={{ maxHeight: '50vh', overflowY: 'auto', overflowX: 'auto' }}>
                        <table style={{ ...styles.table, minWidth: columns.reduce((a, c) => a + c.width, 0) }}>
                            <colgroup>
                                {columns.map((col, i) => <col key={col.id} style={{ width: col.width }} />)}
                            </colgroup>
                            <thead>
                                <tr>
                                    {columns.map((col, colIndex) => (
                                        <th
                                            key={col.id}
                                            style={{
                                                ...styles.th,
                                                ...styles.thResizable,
                                                ...compactStyles.th,
                                                cursor: col.fixed ? 'default' : 'grab',
                                                backgroundColor: dragOverIndex === colIndex ? '#2d4a6e' : '#1a1f26'
                                            }}
                                            draggable={!col.fixed}
                                            onDragStart={e => startDrag(colIndex, e)}
                                            onDragOver={e => onDragOver(colIndex, e)}
                                            onDragLeave={onDragLeave}
                                            onDrop={e => onDrop(colIndex, e)}
                                            onDragEnd={onDragEnd}
                                        >
                                            {col.id === 'checkbox' ? (
                                                <input type="checkbox" checked={searchFilter ? (visibleIndices.length > 0 && visibleIndices.every(i => selectedItems.includes(i))) : (selectedItems.length === mainItemCount && mainItemCount > 0)} onChange={selectAll} />
                                            ) : col.label}
                                            {!col.fixed && (
                                                <div
                                                    style={styles.resizeHandle}
                                                    onMouseDown={e => startResize(colIndex, e)}
                                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                />
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Render packages first */}
                                {/* Package instances (new format) */}
                                {filteredPackages.map(pkg => {
                                    const pkgColor = styles.pkgColor(pkg.name);
                                    const isPkgExpanded = expandedPackages[pkg.name] !== false;
                                    const isSelected = selectedItems.includes(pkg.idx);
                                    const togglePkgSelect = (e) => toggleSelect(pkg.idx, e);

                                    // Handler to change package instance qty
                                    const changePkgQty = (val) => {
                                        const items = [...location.items];
                                        items[pkg.idx] = { ...items[pkg.idx], qty: Math.max(1, parseInt(val) || 1) };
                                        onUpdate(location.id, items);
                                    };

                                    return (
                                        <React.Fragment key={`pkg-${pkg.idx}`}>
                                            {/* Package header row */}
                                            <tr
                                                style={{ backgroundColor: pkgColor.bg, borderLeft: `4px solid ${pkgColor.b}`, cursor: 'context-menu' }}
                                                onContextMenu={e => handleContextMenu(e, pkg.idx, false, null, true, pkg.name)}>
                                                {columns.map((col, colIndex) => {
                                                    const tdS = { ...styles.td, ...compactStyles.td, width: col.width + 'px' };
                                                    if (col.id === 'checkbox') return <td key={col.id} style={tdS}><input type="checkbox" checked={isSelected} onChange={e => togglePkgSelect(e)} /></td>;
                                                    if (col.id === 'expand') return <td key={col.id} style={tdS}><button style={{ ...styles.iconButton, padding: '2px' }} onClick={() => togglePackageExpand(pkg.name)}>{isPkgExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}</button></td>;
                                                    if (col.id === 'qty') return <td key={col.id} style={tdS}><input type="number" value={pkg.qty} onChange={e => changePkgQty(e.target.value)} onFocus={e => e.target.select()} style={{ ...styles.inputSmall, ...compactStyles.input, width: '60px', fontWeight: '700' }} min="1" /></td>;
                                                    if (col.id === 'manufacturer' || col.id === 'notes') return <td key={col.id} style={{ ...tdS, fontWeight: '700' }} colSpan={col.id === 'notes' ? 1 : undefined}>
                                                        {col.id === 'notes' ? '' : <><Icons.Package /> <span style={{ color: pkgColor.b }}>{pkg.name}</span> {pkg.isOutOfDate && <span style={{ color: '#f59e0b', fontSize: '11px' }} title="Package definition has been updated">outdated</span>} {pkg.isMissing && <span style={{ color: '#f87171', fontSize: '11px' }}>missing</span>}</>}
                                                    </td>;
                                                    if (col.id === 'model') return <td key={col.id} style={tdS}><span style={{ ...styles.badge('green'), fontSize: '10px' }}>{pkg.itemCount} items x {pkg.qty}</span></td>;
                                                    if (col.id === 'description') return <td key={col.id} style={tdS}>{pkg.instance.notes || ''}</td>;
                                                    if (col.id === 'extCost') return <td key={col.id} style={{ ...tdS, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(pkg.cost)}</td>;
                                                    if (col.id === 'extLabor' || col.id === 'labor') return <td key={col.id} style={tdS}>{fmtHrs(pkg.labor)}</td>;
                                                    return <td key={col.id} style={tdS}></td>;
                                                })}
                                            </tr>

                                            {/* Expanded package items (read-only, computed from definition) */}
                                            {isPkgExpanded && pkg.expandedItems.map((item, itemIdx) => (
                                                <tr key={`pkg-item-${pkg.idx}-${itemIdx}`} style={{ backgroundColor: '#0d1117', borderLeft: `3px solid ${pkgColor.b}` }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#182430'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0d1117'}>
                                                    {columns.map(col => {
                                                        const tdS = { ...styles.td, ...compactStyles.td, width: col.width + 'px', color: '#8b98a5', fontSize: '12px' };
                                                        if (col.id === 'checkbox') return <td key={col.id} style={tdS}></td>;
                                                        if (col.id === 'expand') return <td key={col.id} style={tdS}></td>;
                                                        if (col.id === 'qty') return <td key={col.id} style={tdS}>{fmtQty(item.qty)}</td>;
                                                        if (col.id === 'notes') return <td key={col.id} style={tdS}><span style={{ fontSize: '10px', color: '#6e767d' }}>{(item.qtyPerPackage || 1)}x{pkg.qty}</span></td>;
                                                        if (col.id === 'manufacturer') return <td key={col.id} style={tdS}>{item.manufacturer}</td>;
                                                        if (col.id === 'model') return <td key={col.id} style={{ ...tdS, color: '#1d9bf0' }}>{item.model}</td>;
                                                        if (col.id === 'description') return <td key={col.id} style={tdS}>{item.description}</td>;
                                                        if (col.id === 'unitCost') return <td key={col.id} style={tdS}>{fmtCost(item.unitCost || 0)}</td>;
                                                        if (col.id === 'unitLabor') return <td key={col.id} style={tdS}>{fmtHrs(item.laborHrsPerUnit || 0)}</td>;
                                                        if (col.id === 'extCost') return <td key={col.id} style={{ ...tdS, color: '#00ba7c' }}>{fmtCost((item.qty || 0) * (item.unitCost || 0))}</td>;
                                                        if (col.id === 'extLabor' || col.id === 'labor') return <td key={col.id} style={tdS}>{fmtHrs((item.qty || 0) * (item.laborHrsPerUnit || 0))}</td>;
                                                        return <td key={col.id} style={tdS}></td>;
                                                    })}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}

                                {/* Legacy packages (old format, backward compat) */}
                                {filteredLegacyPackages.map(pkg => {
                                    const pkgColor = styles.pkgColor(pkg.name);
                                    const isPkgExpanded = expandedPackages[pkg.name] !== false;
                                    const allPkgItemsSelected = pkg.indices.every(idx => selectedItems.includes(idx));

                                    const toggleLegacyPkgSelect = () => {
                                        if (allPkgItemsSelected) {
                                            setSelectedItems(prev => prev.filter(idx => !pkg.indices.includes(idx)));
                                        } else {
                                            setSelectedItems(prev => [...new Set([...prev, ...pkg.indices])]);
                                        }
                                    };

                                    return (
                                        <React.Fragment key={`legacy-pkg-${pkg.name}`}>
                                            <tr style={{ backgroundColor: pkgColor.bg, borderLeft: `4px solid ${pkgColor.b}` }}>
                                                {columns.map((col) => {
                                                    const tdS = { ...styles.td, ...compactStyles.td, width: col.width + 'px' };
                                                    if (col.id === 'checkbox') return <td key={col.id} style={tdS}><input type="checkbox" checked={allPkgItemsSelected} onChange={toggleLegacyPkgSelect} /></td>;
                                                    if (col.id === 'expand') return <td key={col.id} style={tdS}><button style={{ ...styles.iconButton, padding: '2px' }} onClick={() => togglePackageExpand(pkg.name)}>{isPkgExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}</button></td>;
                                                    if (col.id === 'manufacturer') return <td key={col.id} style={{ ...tdS, fontWeight: '700' }}><Icons.Package /> <span style={{ color: pkgColor.b }}>{pkg.name}</span> <span style={{ fontSize: '10px', color: '#6e767d' }}>(legacy)</span></td>;
                                                    if (col.id === 'extCost') return <td key={col.id} style={{ ...tdS, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(pkg.cost)}</td>;
                                                    if (col.id === 'extLabor' || col.id === 'labor') return <td key={col.id} style={tdS}>{fmtHrs(pkg.labor)}</td>;
                                                    return <td key={col.id} style={tdS}></td>;
                                                })}
                                            </tr>
                                            {isPkgExpanded && pkg.items.map((item, pkgItemIdx) => {
                                                const i = pkg.indices[pkgItemIdx];
                                                const isItemSelected = selectedItems.includes(i);
                                                const itemTotal = calculateItemTotal(item);
                                                return (
                                                    <tr key={`legacy-pkg-item-${i}`} style={{ backgroundColor: isItemSelected ? '#1d3a5c' : '#0d1117', borderLeft: `3px solid ${pkgColor.b}` }}
                                                        onMouseEnter={e => { if (!isItemSelected) e.currentTarget.style.backgroundColor = '#182430'; }}
                                                        onMouseLeave={e => { if (!isItemSelected) e.currentTarget.style.backgroundColor = '#0d1117'; }}>
                                                        {columns.map(col => renderItemCell(col, item, i, {
                                                            isSelected: isItemSelected, hasAccessories: item.accessories?.length > 0, isExpanded: expandedItems[i] !== false, itemTotal,
                                                            isPackageItem: true, pkgColor,
                                                            changeQty, changeNotes, changeSystem, toggleSelect, toggleItemExpand
                                                        }))}
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}

                                {/* Render standalone items */}
                                {filteredStandalone.map(({ item, idx: i }) => {
                                    const isSelected = selectedItems.includes(i);
                                    const hasAccessories = item.accessories?.length > 0;
                                    const isExpanded = expandedItems[i] !== false;
                                    const itemTotal = calculateItemTotal(item);

                                    return (
                                        <React.Fragment key={i}>
                                            {/* Main item row */}
                                            <tr
                                                style={{ backgroundColor: isSelected ? '#1d3a5c' : (item.isPlaceholder ? '#2a1f0a' : 'transparent'), borderLeft: item.isPlaceholder ? '3px solid #f59e0b' : undefined, cursor: 'context-menu' }}
                                                onContextMenu={e => handleContextMenu(e, i, false, null)}
                                                onMouseEnter={e => { if (!isSelected && !item.isPlaceholder) e.currentTarget.style.backgroundColor = '#1e2d3d'; }}
                                                onMouseLeave={e => { if (!isSelected && !item.isPlaceholder) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                                {columns.map(col => renderItemCell(col, item, i, {
                                                    isSelected, hasAccessories, isExpanded, itemTotal,
                                                    isPackageItem: false, pkgColor: null,
                                                    changeQty, changeNotes, changeSystem, toggleSelect, toggleItemExpand
                                                }))}
                                            </tr>

                                            {/* Accessory rows */}
                                            {hasAccessories && isExpanded && item.accessories.map((acc, accIdx) => (
                                                <tr
                                                    key={`${i}-acc-${accIdx}`}
                                                    style={{ backgroundColor: '#0d1117', cursor: 'context-menu' }}
                                                    onContextMenu={e => handleContextMenu(e, i, true, accIdx)}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#182430'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0d1117'}>
                                                    {columns.map(col => renderAccessoryCell(col, acc, i, accIdx, { pkgColor: null, changeAccessoryQty, changeAccessoryNotes, removeAccessory }))}
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ backgroundColor: '#151a21' }}>
                                    <td colSpan={columns.length - 2} style={{ ...styles.td, fontWeight: '700' }}>TOTAL (this location)</td>
                                    <td style={{ ...styles.td, fontWeight: '700', color: '#00ba7c' }}>{fmtCost(directCost)}</td>
                                    <td style={{ ...styles.td, fontWeight: '700', color: '#1d9bf0' }}>{fmtHrs(directLabor)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            ) : (
                <div style={{ ...styles.card, textAlign: 'center', padding: '40px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#8b98a5', fontSize: '16px' }}>No components in this location</h3>
                    <p style={{ margin: '0 0 16px 0', color: '#6e767d', fontSize: '14px' }}>Add components, paste from clipboard, or apply a template</p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {clipboard.length > 0 && <button style={styles.button('success')} onClick={handlePaste}><Icons.Clipboard /> Paste ({clipboard.length})</button>}
                        {templates && templates.length > 0 && <button style={styles.button('purple')} onClick={onApplyTemplate}><Icons.Template /> Apply Template</button>}
                        <button style={styles.button('primary')} onClick={onSearch}><Icons.Plus /> Add Components</button>
                        <button style={{ ...styles.button('primary'), backgroundColor: '#2a1f0a', color: '#f59e0b', border: '1px solid #f59e0b40' }} onClick={addEmptyItem}><Icons.Plus /> Empty Item</button>
                    </div>
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    left: contextMenu.x,
                    top: contextMenu.y,
                    backgroundColor: '#1a1f26',
                    border: '1px solid #2f3336',
                    borderRadius: '8px',
                    padding: '4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    minWidth: '180px'
                }}>
                    {contextMenu.isPackage ? (
                        // Package context menu
                        <>
                            {onReplacePackage && (
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { onReplacePackage(contextMenu.packageName, contextMenu.itemIdx); setContextMenu(null); }}>
                                    <Icons.Sync /> Replace Package
                                </button>
                            )}
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { onUngroupPackage(contextMenu.packageName); setContextMenu(null); }}>
                                <Icons.Layers /> Ungroup Package
                            </button>
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f87171' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => {
                                    // New-style: find by name, delete single instance
                                    const newPkg = groupedItems.packages.find(p => p.name === contextMenu.packageName);
                                    if (newPkg) { del([newPkg.idx]); }
                                    else {
                                        // Legacy: find by name, delete all items
                                        const legacyPkg = groupedItems.legacyPackages.find(p => p.name === contextMenu.packageName);
                                        if (legacyPkg) del(legacyPkg.indices);
                                    }
                                    setContextMenu(null);
                                }}>
                                <Icons.Trash /> Delete Package
                            </button>
                        </>
                    ) : contextMenu.isAccessory ? (
                        // Accessory context menu
                        <>
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { promoteAccessoryToItem(contextMenu.itemIdx, contextMenu.accIdx); setContextMenu(null); }}>
                                <Icons.ChevronUp /> Promote to Item
                            </button>
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f87171' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { removeAccessory(contextMenu.itemIdx, contextMenu.accIdx); setContextMenu(null); }}>
                                <Icons.Trash /> Remove Accessory
                            </button>
                        </>
                    ) : (
                        // Main item context menu
                        <>
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { onAddAccessoryToItem(contextMenu.itemIdx); setContextMenu(null); }}>
                                <Icons.Plus /> Add Accessory
                            </button>
                            {directItems > 1 && (
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { onConvertToAccessory(contextMenu.itemIdx); setContextMenu(null); }}>
                                    <Icons.ChevronDown /> Convert to Accessory
                                </button>
                            )}
                            <div style={{ borderTop: '1px solid #2f3336', margin: '4px 0' }} />
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { onCopy([{ ...location.items[contextMenu.itemIdx] }]); setContextMenu(null); }}>
                                <Icons.Copy /> Copy
                            </button>
                            {onReplaceItem && (
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { onReplaceItem(contextMenu.itemIdx); setContextMenu(null); }}>
                                    <Icons.Sync /> Replace Item
                                </button>
                            )}
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { onSavePackage([{ ...location.items[contextMenu.itemIdx] }], [contextMenu.itemIdx]); setContextMenu(null); }}>
                                <Icons.Package /> Save as New Package
                            </button>
                            {/* Show existing legacy packages to move item into */}
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
                                                onClick={() => { onMoveToPackage(contextMenu.itemIdx, pkg.name); setContextMenu(null); }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: pkgColor.b, marginRight: '8px' }}></span>
                                                {pkg.name}
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                            <div style={{ borderTop: '1px solid #2f3336', margin: '4px 0' }} />
                            {onAddToCatalog && (
                                <button
                                    style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#1d9bf0' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => { onAddToCatalog(location.items[contextMenu.itemIdx]); setContextMenu(null); }}>
                                    <Icons.Database /> Add to Catalog
                                </button>
                            )}
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f87171' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { deleteItem(contextMenu.itemIdx); setContextMenu(null); }}>
                                <Icons.Trash /> Delete
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
