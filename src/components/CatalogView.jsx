import React from 'react';
const { useState, useMemo, useEffect, useRef } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';
import { UOM_OPTIONS, PHASE_OPTIONS } from '../constants';
import useFlexibleColumns from '../hooks/useFlexibleColumns';
import CatalogItemModal from './CatalogItemModal';
import ColumnLayoutManager from './ColumnLayoutManager';

const CATALOG_COLUMNS = [
    { id: 'checkbox', label: '', width: 36, fixed: true },
    { id: 'manufacturer', label: 'Manufacturer', width: 130 },
    { id: 'model', label: 'Model', width: 120 },
    { id: 'partNumber', label: 'Part #', width: 130 },
    { id: 'description', label: 'Description', width: 220 },
    { id: 'category', label: 'Category', width: 110 },
    { id: 'subcategory', label: 'Subcategory', width: 120 },
    { id: 'unitCost', label: 'Cost', width: 90 },
    { id: 'laborHrsPerUnit', label: 'Labor', width: 75 },
    { id: 'uom', label: 'UOM', width: 60 },
    { id: 'vendor', label: 'Vendor', width: 110 },
    { id: 'phase', label: 'Phase', width: 90 },
    { id: 'discontinued', label: 'Discontinued', width: 100 },
    { id: 'catalogNote', label: 'Note', width: 160 },
    { id: 'favorite', label: '\u2605', width: 40 },
    { id: 'actions', label: 'Actions', width: 80, fixed: true },
];

export default function CatalogView({ catalog, onUpdateCatalog, onRefreshCatalog, onSaveCatalog, syncStatus, catalogDirty, compactMode }) {
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [showAddItem, setShowAddItem] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [sortField, setSortField] = useState('manufacturer');
    const [sortDir, setSortDir] = useState('asc');
    const [editMode, setEditMode] = useState(false);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState(new Set());
    const lastClickedRef = useRef(null);
    const [contextMenu, setContextMenu] = useState(null); // { x, y }
    const [bulkEditField, setBulkEditField] = useState(null); // field key to edit
    const [bulkEditValue, setBulkEditValue] = useState('');

    const { columns: catalogCols, startResize: startCatResize, savedLayouts: catLayouts, saveLayout: saveCatLayout, loadLayout: loadCatLayout, deleteLayout: deleteCatLayout, resetColumns: resetCatColumns } = useFlexibleColumns(CATALOG_COLUMNS, 'catalog');

    // Inline edit handler - updates a single field on a catalog item
    const updateCatalogField = (itemId, field, value) => {
        onUpdateCatalog(catalog.map(c => c.id === itemId ? { ...c, [field]: value, modifiedAt: new Date().toISOString() } : c));
    };

    // Compact styles
    const thStyle = { ...styles.th, ...styles.thResizable, cursor: 'pointer', userSelect: 'none', ...(compactMode ? { padding: '6px 8px', fontSize: '10px' } : {}) };
    const tdStyle = { ...styles.td, ...(compactMode ? { padding: '4px 8px', fontSize: '11px' } : {}) };

    // Get unique categories
    const categories = useMemo(() => {
        const cats = [...new Set(catalog.map(c => c.category))].sort();
        return cats;
    }, [catalog]);

    // Filter and sort catalog
    const filtered = useMemo(() => {
        let items = catalog.filter(c => !c.deleted);

        if (categoryFilter) {
            items = items.filter(c => c.category === categoryFilter);
        }

        if (search.length >= 2) {
            const term = search.toLowerCase();
            items = items.filter(c =>
                (c.manufacturer + c.model + c.partNumber + c.description).toLowerCase().includes(term)
            );
        }

        items.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            // Handle booleans (discontinued)
            if (typeof aVal === 'boolean') { aVal = aVal ? 1 : 0; bVal = bVal ? 1 : 0; }
            // Handle nullish
            if (aVal == null) aVal = '';
            if (bVal == null) bVal = '';
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [catalog, search, categoryFilter, sortField, sortDir]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const handleSave = (item) => {
        const exists = catalog.find(c => c.id === item.id);
        if (exists) {
            onUpdateCatalog(catalog.map(c => c.id === item.id ? item : c));
        } else {
            onUpdateCatalog([...catalog, item]);
        }
    };

    const handleDelete = (item) => {
        // Mark as deleted rather than removing (for sync purposes)
        onUpdateCatalog(catalog.map(c => c.id === item.id ? { ...c, deleted: true, modifiedAt: new Date().toISOString() } : c));
        setConfirmDelete(null);
    };

    // Multi-select toggle with shift-click range support
    const toggleSelect = (itemId, e) => {
        if (e?.shiftKey && lastClickedRef.current) {
            const idxA = filtered.findIndex(c => c.id === lastClickedRef.current);
            const idxB = filtered.findIndex(c => c.id === itemId);
            if (idxA !== -1 && idxB !== -1) {
                const start = Math.min(idxA, idxB);
                const end = Math.max(idxA, idxB);
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    for (let i = start; i <= end; i++) next.add(filtered[i].id);
                    return next;
                });
            }
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
                return next;
            });
        }
        lastClickedRef.current = itemId;
    };

    const selectAll = () => {
        const visibleIds = filtered.slice(0, 200).map(c => c.id);
        const allSelected = visibleIds.every(id => selectedIds.has(id));
        if (allSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(visibleIds));
        }
    };

    // Right-click context menu
    const handleContextMenu = (e) => {
        if (selectedIds.size === 0) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    // Close context menu on click outside
    useEffect(() => {
        const close = () => setContextMenu(null);
        if (contextMenu) window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [contextMenu]);

    // Bulk edit field definitions
    const BULK_FIELDS = [
        { key: 'category', label: 'Category', type: 'text' },
        { key: 'subcategory', label: 'Subcategory', type: 'text' },
        { key: 'unitCost', label: 'Unit Cost', type: 'number' },
        { key: 'laborHrsPerUnit', label: 'Labor Hours', type: 'number' },
        { key: 'uom', label: 'UOM', type: 'select', options: UOM_OPTIONS },
        { key: 'vendor', label: 'Vendor', type: 'text' },
        { key: 'phase', label: 'Phase', type: 'select', options: ['', ...PHASE_OPTIONS.map(p => p.label)] },
        { key: 'discontinued', label: 'Discontinued', type: 'boolean' },
    ];

    const applyBulkEdit = () => {
        if (!bulkEditField) return;
        const field = BULK_FIELDS.find(f => f.key === bulkEditField);
        if (!field) return;
        let val = bulkEditValue;
        if (field.type === 'number') val = parseFloat(val) || 0;
        if (field.type === 'boolean') val = val === 'true' || val === true;
        const now = new Date().toISOString();
        onUpdateCatalog(catalog.map(c =>
            selectedIds.has(c.id) ? { ...c, [bulkEditField]: val, modifiedAt: now } : c
        ));
        setBulkEditField(null);
        setBulkEditValue('');
    };

    // Bulk delete
    const bulkDelete = () => {
        const now = new Date().toISOString();
        onUpdateCatalog(catalog.map(c =>
            selectedIds.has(c.id) ? { ...c, deleted: true, modifiedAt: now } : c
        ));
        setSelectedIds(new Set());
        setContextMenu(null);
    };

    const SortIcon = ({ field }) => {
        if (sortField !== field) return null;
        return sortDir === 'asc' ? <Icons.ChevronUp /> : <Icons.ChevronDown />;
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: catalogDirty ? '8px' : '24px' }}>
                <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Icons.Database /> Component Catalog
                    <span style={styles.badge('blue')}>{filtered.length} items</span>
                </h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {syncStatus && (
                        <span style={{ fontSize: '12px', color: syncStatus === 'synced' ? '#00ba7c' : syncStatus === 'offline' || syncStatus === 'local' ? '#f59e0b' : '#8b98a5', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {syncStatus === 'synced' ? <><Icons.Cloud /> Synced</> :
                             syncStatus === 'offline' || syncStatus === 'local' ? <><Icons.CloudOff /> Local</> :
                             syncStatus === 'loading' ? <><Icons.Sync /> Loading...</> :
                             <><Icons.Sync /> {syncStatus}</>}
                        </span>
                    )}
                    <ColumnLayoutManager savedLayouts={catLayouts} onSave={saveCatLayout} onLoad={loadCatLayout} onDelete={deleteCatLayout} onReset={resetCatColumns} />
                    <button
                        style={{ ...styles.smallButton, backgroundColor: editMode ? '#3d2e1a' : '#2f3336', color: editMode ? '#ffad1f' : '#8b98a5' }}
                        onClick={() => setEditMode(!editMode)}
                        title={editMode ? 'Lock fields (read-only)' : 'Unlock fields for inline editing'}
                    >
                        {editMode ? <><Icons.Lock /> Lock</> : <><Icons.Unlock /> Unlock</>}
                    </button>
                    <button style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c' }} onClick={onRefreshCatalog}>
                        <Icons.Sync /> Refresh
                    </button>
                    <button style={styles.button('primary')} onClick={() => setShowAddItem(true)}>
                        <Icons.Plus /> Add Item
                    </button>
                </div>
            </div>
            {catalogDirty && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <button
                        style={{ ...styles.button('primary'), padding: '10px 32px', fontSize: '15px', fontWeight: '700', animation: 'pulse 2s infinite', boxShadow: '0 0 16px rgba(29,155,240,0.5)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={onSaveCatalog}
                    >
                        <Icons.Save /> Save Changes
                    </button>
                </div>
            )}

            <div style={styles.card}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <input
                        type="text"
                        placeholder="Search components..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ ...styles.input, flex: 1 }}
                    />
                    <select
                        value={categoryFilter}
                        onChange={e => setCategoryFilter(e.target.value)}
                        style={{ ...styles.input, width: '200px', cursor: 'pointer' }}
                    >
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'auto' }}>
                    <table style={styles.table}>
                        <colgroup>
                            {catalogCols.map(col => <col key={col.id} style={{ width: col.width }} />)}
                        </colgroup>
                        <thead>
                            <tr>
                                {catalogCols.map((col, colIndex) => (
                                    <th
                                        key={col.id}
                                        style={{ ...thStyle, cursor: col.fixed ? 'default' : 'pointer' }}
                                        onClick={() => col.id === 'checkbox' ? selectAll() : (!col.fixed && handleSort(col.id))}
                                    >
                                        {col.id === 'checkbox' ? <input type="checkbox" checked={filtered.slice(0, 200).length > 0 && filtered.slice(0, 200).every(c => selectedIds.has(c.id))} onChange={selectAll} /> : col.label} {col.id !== 'checkbox' && !col.fixed && <SortIcon field={col.id} />}
                                        <div
                                            style={styles.resizeHandle}
                                            onMouseDown={e => startCatResize(colIndex, e)}
                                            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                            onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.slice(0, 200).map(item => (
                                <tr key={item.id} style={{ opacity: item.discontinued ? 0.5 : 1, backgroundColor: selectedIds.has(item.id) ? '#1d3a5c' : undefined }} onContextMenu={e => { if (selectedIds.has(item.id)) handleContextMenu(e); }}
                                    onMouseEnter={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.backgroundColor = '#1e2d3d'; }}
                                    onMouseLeave={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.backgroundColor = ''; }}>
                                    {catalogCols.map(col => {
                                        const inlineInput = { ...styles.inputSmall, width: '100%', padding: '2px 4px', fontSize: compactMode ? '10px' : '11px' };
                                        switch (col.id) {
                                            case 'checkbox':
                                                return <td key={col.id} style={{ ...tdStyle, textAlign: 'center' }}><input type="checkbox" checked={selectedIds.has(item.id)} onChange={e => toggleSelect(item.id, e)} /></td>;
                                            case 'favorite':
                                                return <td key={col.id} style={{ ...tdStyle, textAlign: 'center', cursor: 'pointer', color: item.favorite ? '#f59e0b' : '#4a5568' }} onClick={() => updateCatalogField(item.id, 'favorite', !item.favorite)}><Icons.Star filled={!!item.favorite} /></td>;
                                            case 'manufacturer':
                                                return <td key={col.id} style={tdStyle}>{editMode ? <input type="text" value={item.manufacturer} onChange={e => updateCatalogField(item.id, 'manufacturer', e.target.value)} style={inlineInput} /> : item.manufacturer}</td>;
                                            case 'model':
                                                return <td key={col.id} style={tdStyle}>{editMode ? <input type="text" value={item.model} onChange={e => updateCatalogField(item.id, 'model', e.target.value)} style={inlineInput} /> : <strong>{item.model}</strong>}</td>;
                                            case 'partNumber':
                                                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '10px' : '11px', color: '#8b98a5' }}>{editMode ? <input type="text" value={item.partNumber || ''} onChange={e => updateCatalogField(item.id, 'partNumber', e.target.value)} style={inlineInput} /> : item.partNumber}</td>;
                                            case 'description':
                                                return <td key={col.id} style={tdStyle}>{editMode ? <input type="text" value={item.description || ''} onChange={e => updateCatalogField(item.id, 'description', e.target.value)} style={inlineInput} /> : item.description}</td>;
                                            case 'category':
                                                return <td key={col.id} style={tdStyle}><span style={{ ...styles.badge('blue'), fontSize: compactMode ? '10px' : '12px', padding: compactMode ? '2px 6px' : '3px 10px' }}>{item.category}</span></td>;
                                            case 'subcategory':
                                                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '10px' : '11px', color: '#8b98a5' }}>{editMode ? <input type="text" value={item.subcategory || ''} onChange={e => updateCatalogField(item.id, 'subcategory', e.target.value)} style={inlineInput} /> : (item.subcategory || '')}</td>;
                                            case 'unitCost':
                                                return <td key={col.id} style={{ ...tdStyle, color: '#00ba7c' }}>{editMode ? <input type="number" step="0.01" min="0" value={item.unitCost || 0} onChange={e => updateCatalogField(item.id, 'unitCost', parseFloat(e.target.value) || 0)} style={{ ...inlineInput, textAlign: 'right' }} /> : fmtCost(item.unitCost)}</td>;
                                            case 'laborHrsPerUnit':
                                                return <td key={col.id} style={tdStyle}>{editMode ? <input type="number" step="0.25" min="0" value={item.laborHrsPerUnit || 0} onChange={e => updateCatalogField(item.id, 'laborHrsPerUnit', parseFloat(e.target.value) || 0)} style={{ ...inlineInput, textAlign: 'right' }} /> : (item.laborHrsPerUnit + 'h')}</td>;
                                            case 'uom':
                                                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '10px' : '11px', color: '#8b98a5' }}>{editMode ? <select value={item.uom || 'EA'} onChange={e => updateCatalogField(item.id, 'uom', e.target.value)} style={{ ...inlineInput, cursor: 'pointer' }}>{UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select> : (item.uom || 'EA')}</td>;
                                            case 'vendor':
                                                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '10px' : '11px' }}>{editMode ? <input type="text" value={item.vendor || ''} onChange={e => updateCatalogField(item.id, 'vendor', e.target.value)} style={inlineInput} /> : (item.vendor || '')}</td>;
                                            case 'phase':
                                                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '10px' : '11px' }}>{editMode ? <select value={item.phase || ''} onChange={e => updateCatalogField(item.id, 'phase', e.target.value)} style={{ ...inlineInput, cursor: 'pointer' }}><option value="">—</option>{PHASE_OPTIONS.map(p => <option key={p.value} value={p.label}>{p.label}</option>)}</select> : (item.phase ? <span style={styles.badge('purple')}>{item.phase}</span> : '')}</td>;
                                            case 'discontinued':
                                                return <td key={col.id} style={{ ...tdStyle, textAlign: 'center' }}>{editMode ? <input type="checkbox" checked={!!item.discontinued} onChange={e => updateCatalogField(item.id, 'discontinued', e.target.checked)} /> : (item.discontinued ? <span style={{ ...styles.badge('red'), fontSize: '9px' }}>Yes</span> : '')}</td>;
                                            case 'catalogNote':
                                                return <td key={col.id} style={{ ...tdStyle, fontSize: compactMode ? '10px' : '11px', color: '#8b98a5' }}>{editMode ? <input type="text" value={item.catalogNote || ''} onChange={e => updateCatalogField(item.id, 'catalogNote', e.target.value)} style={inlineInput} placeholder="Note..." /> : (item.catalogNote || '')}</td>;
                                            case 'actions':
                                                return <td key={col.id} style={tdStyle}><div style={{ display: 'flex', gap: '4px' }}><button style={{ ...styles.iconButton, color: '#8b98a5' }} onClick={() => setEditItem(item)} title="Edit"><Icons.Edit /></button><button style={{ ...styles.iconButton, color: '#f87171' }} onClick={() => setConfirmDelete(item)} title="Delete"><Icons.Trash /></button></div></td>;
                                            default:
                                                return <td key={col.id} style={tdStyle}></td>;
                                        }
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filtered.length > 200 && (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#6e767d', fontSize: '13px' }}>
                            Showing 200 of {filtered.length} items. Use search to narrow results.
                        </div>
                    )}
                </div>
            </div>

            {/* Add/Edit Item Modal */}
            {(showAddItem || editItem) && (
                <CatalogItemModal
                    item={editItem}
                    onClose={() => { setShowAddItem(false); setEditItem(null); }}
                    onSave={handleSave}
                    categories={catalog}
                    catalog={catalog}
                />
            )}

            {/* Delete Confirmation */}
            {confirmDelete && (
                <div style={styles.modal} onClick={() => setConfirmDelete(null)}>
                    <div style={{ ...styles.modalContent, width: '400px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#f87171' }}>Delete Catalog Item?</h2>
                        <p style={{ color: '#8b98a5', marginBottom: '20px' }}>
                            Are you sure you want to delete <strong style={{ color: '#e7e9ea' }}>{confirmDelete.manufacturer} {confirmDelete.model}</strong>?
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button style={styles.button('secondary')} onClick={() => setConfirmDelete(null)}>Cancel</button>
                            <button style={styles.button('danger')} onClick={() => handleDelete(confirmDelete)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Selection count bar */}
            {selectedIds.size > 0 && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#1d3a5c', border: '1px solid #1d9bf0', borderRadius: '10px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '16px', zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                    <span style={{ fontWeight: '600', color: '#1d9bf0' }}>{selectedIds.size} selected</span>
                    <span style={{ color: '#6e767d', fontSize: '12px' }}>Right-click for bulk edit</span>
                    <button style={{ ...styles.smallButton, backgroundColor: '#2f3336', color: '#8b98a5' }} onClick={() => setSelectedIds(new Set())}>Clear</button>
                </div>
            )}

            {/* Context menu */}
            {contextMenu && (
                <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '8px', padding: '4px 0', zIndex: 2000, boxShadow: '0 8px 24px rgba(0,0,0,0.6)', minWidth: '200px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ padding: '6px 12px', fontSize: '11px', color: '#6e767d', borderBottom: '1px solid #2f3336', marginBottom: '2px' }}>Bulk Update {selectedIds.size} Items</div>
                    {BULK_FIELDS.map(f => (
                        <div key={f.key} style={{ padding: '8px 16px', cursor: 'pointer', color: '#e7e9ea', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => { setBulkEditField(f.key); setBulkEditValue(f.type === 'boolean' ? 'true' : ''); setContextMenu(null); }}
                        >
                            Set {f.label}
                        </div>
                    ))}
                    <div style={{ borderTop: '1px solid #2f3336', marginTop: '2px' }}></div>
                    <div style={{ padding: '8px 16px', cursor: 'pointer', color: '#f87171', fontSize: '13px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={bulkDelete}
                    >
                        <Icons.Trash /> Delete {selectedIds.size} Items
                    </div>
                </div>
            )}

            {/* Bulk Edit Modal */}
            {bulkEditField && (() => {
                const field = BULK_FIELDS.find(f => f.key === bulkEditField);
                if (!field) return null;
                return (
                    <div style={styles.modal} onClick={() => setBulkEditField(null)}>
                        <div style={{ ...styles.modalContent, width: '420px' }} onClick={e => e.stopPropagation()}>
                            <h2 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Set {field.label} for {selectedIds.size} Items</h2>
                            {field.type === 'text' && (
                                <input type="text" value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} placeholder={`Enter ${field.label}...`} style={styles.input} autoFocus />
                            )}
                            {field.type === 'number' && (
                                <input type="number" step={field.key === 'unitCost' ? '0.01' : '0.25'} min="0" value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} placeholder="0" style={styles.input} autoFocus />
                            )}
                            {field.type === 'select' && (
                                <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} style={{ ...styles.input, cursor: 'pointer' }} autoFocus>
                                    {field.key === 'phase' && <option value="">— None —</option>}
                                    {field.options.map(o => <option key={o} value={o}>{o || '— None —'}</option>)}
                                </select>
                            )}
                            {field.type === 'boolean' && (
                                <select value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} style={{ ...styles.input, cursor: 'pointer' }} autoFocus>
                                    <option value="true">Yes — Mark as Discontinued</option>
                                    <option value="false">No — Mark as Active</option>
                                </select>
                            )}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                                <button style={styles.button('secondary')} onClick={() => setBulkEditField(null)}>Cancel</button>
                                <button style={styles.button('primary')} onClick={applyBulkEdit}>Apply to {selectedIds.size} Items</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
