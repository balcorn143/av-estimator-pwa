import React from 'react';
const { useState, useEffect } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost, fmtHrs } from '../utils/formatters';
import { PHASE_OPTIONS } from '../constants';
import useFlexibleColumns from '../hooks/useFlexibleColumns';
import ColumnLayoutManager from './ColumnLayoutManager';
import { generatePackageId, findAllPackageInstances } from '../utils/packages';

const PKG_COLUMNS = [
    { id: 'qtyPerPkg',    label: 'Qty/Pkg',     width: 75 },
    { id: 'manufacturer', label: 'Manufacturer', width: 130 },
    { id: 'model',        label: 'Model',        width: 150 },
    { id: 'description',  label: 'Description',  width: 200 },
    { id: 'unitCost',     label: 'Unit Cost',    width: 90 },
    { id: 'unitLabor',    label: 'Unit Labor',   width: 85 },
    { id: 'extCost',      label: 'Ext. Cost',    width: 90 },
    { id: 'extLabor',     label: 'Ext. Labor',   width: 85 },
    { id: 'phase',        label: 'Phase',        width: 170 },
    { id: 'vendor',       label: 'Vendor',       width: 110 },
    { id: 'notes',        label: 'Notes',        width: 140 },
    { id: 'remove',       label: '',             width: 36, fixed: true },
];

export default function PackagesView({ catalogPackages, projectPackages, onUpdateCatalogPackages, onUpdateProjectPackages, catalog, locations, compactMode, initialSelectedPkgId, onInitialPkgConsumed }) {
    const [selectedPkgId, setSelectedPkgId] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newScope, setNewScope] = useState('catalog');
    const [showAddComponent, setShowAddComponent] = useState(false);
    const [addComponentSearch, setAddComponentSearch] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [editingName, setEditingName] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [editingQpp, setEditingQpp] = useState({});
    const [editingCost, setEditingCost] = useState({});
    const [editingLabor, setEditingLabor] = useState({});
    const [sortField, setSortField] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    const handleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };
    const SortIcon = ({ field }) => {
        if (sortField !== field) return null;
        return sortDir === 'asc' ? <Icons.ChevronUp /> : <Icons.ChevronDown />;
    };

    // Select package when navigated from workspace context menu
    useEffect(() => {
        if (initialSelectedPkgId) {
            setSelectedPkgId(initialSelectedPkgId);
            if (onInitialPkgConsumed) onInitialPkgConsumed();
        }
    }, [initialSelectedPkgId]);

    const compactStyles = {
        td: compactMode ? { padding: '4px 8px', fontSize: '11px' } : {},
        th: compactMode ? { padding: '6px 8px', fontSize: '10px' } : {},
        input: compactMode ? { padding: '2px 6px', fontSize: '11px' } : {},
    };

    const {
        columns: pkgCols,
        startResize: startPkgResize,
        startDrag, onDragOver, onDragLeave, onDrop, onDragEnd, dragOverIndex,
        savedLayouts: pkgLayouts,
        saveLayout: savePkgLayout,
        loadLayout: loadPkgLayout,
        deleteLayout: deletePkgLayout,
        resetColumns: resetPkgColumns,
    } = useFlexibleColumns(PKG_COLUMNS, 'packages');

    const sortAlpha = (pkgs) => [...pkgs].sort((a, b) => a.name.localeCompare(b.name));
    const allPackages = [...(catalogPackages || []), ...(projectPackages || [])];
    const selectedPkg = allPackages.find(p => p.id === selectedPkgId);
    const selectedScope = selectedPkg ? (selectedPkg.scope === 'project' ? 'project' : 'catalog') : null;
    const instanceCount = selectedPkgId ? findAllPackageInstances(locations || [], selectedPkgId).length : 0;

    const createPackage = () => {
        if (!newName.trim()) return;
        const pkg = {
            id: generatePackageId(),
            name: newName.trim(),
            scope: newScope,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [],
        };
        if (newScope === 'catalog') {
            onUpdateCatalogPackages(prev => [...prev, pkg]);
        } else {
            onUpdateProjectPackages(prev => ({ ...prev, packages: [...(prev.packages || []), pkg] }));
        }
        setSelectedPkgId(pkg.id);
        setNewName('');
        setShowCreate(false);
    };

    const updatePackage = (pkgId, updater) => {
        const pkg = allPackages.find(p => p.id === pkgId);
        if (!pkg) return;
        const scope = pkg.scope === 'project' ? 'project' : 'catalog';
        if (scope === 'catalog') {
            onUpdateCatalogPackages(prev => prev.map(p => p.id === pkgId ? { ...(typeof updater === 'function' ? updater(p) : updater), updatedAt: new Date().toISOString() } : p));
        } else {
            onUpdateProjectPackages(prev => ({
                ...prev,
                packages: (prev.packages || []).map(p => p.id === pkgId ? { ...(typeof updater === 'function' ? updater(p) : updater), updatedAt: new Date().toISOString() } : p),
            }));
        }
    };

    const deletePackage = (pkgId) => {
        const pkg = allPackages.find(p => p.id === pkgId);
        if (!pkg) return;
        if (pkg.scope === 'project') {
            onUpdateProjectPackages(prev => ({ ...prev, packages: (prev.packages || []).filter(p => p.id !== pkgId) }));
        } else {
            onUpdateCatalogPackages(prev => prev.filter(p => p.id !== pkgId));
        }
        if (selectedPkgId === pkgId) setSelectedPkgId(null);
        setConfirmDelete(null);
    };

    const promoteToCatalog = (pkgId) => {
        const pkg = (projectPackages || []).find(p => p.id === pkgId);
        if (!pkg) return;
        onUpdateCatalogPackages(prev => [...prev, { ...pkg, scope: 'catalog', updatedAt: new Date().toISOString() }]);
        onUpdateProjectPackages(prev => ({ ...prev, packages: (prev.packages || []).filter(p => p.id !== pkgId) }));
    };

    const duplicatePackage = (pkgId) => {
        const pkg = allPackages.find(p => p.id === pkgId);
        if (!pkg) return;
        const newPkg = { ...pkg, id: generatePackageId(), name: pkg.name + ' (Copy)', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: (pkg.items || []).map(item => ({ ...item })) };
        if (pkg.scope === 'project') {
            onUpdateProjectPackages(prev => ({ ...prev, packages: [...(prev.packages || []), newPkg] }));
        } else {
            onUpdateCatalogPackages(prev => [...prev, newPkg]);
        }
        setSelectedPkgId(newPkg.id);
        setEditingName(newPkg.id);
        setEditNameValue(newPkg.name);
    };

    const removeComponent = (pkgId, itemIdx) => {
        updatePackage(pkgId, p => ({ ...p, items: p.items.filter((_, i) => i !== itemIdx) }));
    };

    const updateComponentField = (pkgId, itemIdx, field, value) => {
        updatePackage(pkgId, p => ({ ...p, items: p.items.map((item, i) => i === itemIdx ? { ...item, [field]: value } : item) }));
    };

    const addComponentFromCatalog = (catalogItem) => {
        if (!selectedPkgId) return;
        updatePackage(selectedPkgId, p => ({
            ...p,
            items: [...(p.items || []), {
                manufacturer: catalogItem.manufacturer || '',
                model: catalogItem.model || '',
                partNumber: catalogItem.partNumber || '',
                description: catalogItem.description || '',
                category: catalogItem.category || '',
                subcategory: catalogItem.subcategory || '',
                unitCost: catalogItem.unitCost || 0,
                laborHrsPerUnit: catalogItem.laborHrsPerUnit || 0,
                uom: catalogItem.uom || 'EA',
                vendor: catalogItem.vendor || '',
                phase: catalogItem.phase || '',
                qtyPerPackage: 1,
                qty: 1,
            }],
        }));
        setShowAddComponent(false);
        setAddComponentSearch('');
    };

    const filteredCatalog = addComponentSearch.length >= 2 ? (catalog || []).filter(item => {
        const q = addComponentSearch.toLowerCase();
        return (item.manufacturer || '').toLowerCase().includes(q) || (item.model || '').toLowerCase().includes(q) || (item.partNumber || '').toLowerCase().includes(q) || (item.description || '').toLowerCase().includes(q);
    }).slice(0, 50) : [];

    const startRenamePkg = (pkg) => { setEditingName(pkg.id); setEditNameValue(pkg.name); };
    const finishRename = () => {
        if (editingName && editNameValue.trim()) updatePackage(editingName, p => ({ ...p, name: editNameValue.trim() }));
        setEditingName(null); setEditNameValue('');
    };

    const pkgCost = selectedPkg ? (selectedPkg.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.unitCost || 0)), 0) : 0;
    const pkgLabor = selectedPkg ? (selectedPkg.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.laborHrsPerUnit || 0)), 0) : 0;

    const sortedItems = (items) => {
        if (!sortField) return items;
        return [...items].sort((a, b) => {
            const qppA = a.qtyPerPackage || a.qty || 1;
            const qppB = b.qtyPerPackage || b.qty || 1;
            let aVal, bVal;
            if (sortField === 'qtyPerPkg') { aVal = qppA; bVal = qppB; }
            else if (sortField === 'extCost') { aVal = qppA * (a.unitCost || 0); bVal = qppB * (b.unitCost || 0); }
            else if (sortField === 'extLabor') { aVal = qppA * (a.laborHrsPerUnit || 0); bVal = qppB * (b.laborHrsPerUnit || 0); }
            else if (sortField === 'unitCost') { aVal = a.unitCost || 0; bVal = b.unitCost || 0; }
            else if (sortField === 'unitLabor') { aVal = a.laborHrsPerUnit || 0; bVal = b.laborHrsPerUnit || 0; }
            else { aVal = (a[sortField] || '').toLowerCase(); bVal = (b[sortField] || '').toLowerCase(); }
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const renderPkgList = (pkgs, label, scope) => (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #2f3336' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#8b98a5' }}>{label}</span>
                <span style={styles.badge(scope === 'catalog' ? 'blue' : 'green')}>{pkgs.length}</span>
            </div>
            {pkgs.map(pkg => {
                const c = styles.pkgColor(pkg.name);
                const cost = (pkg.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.unitCost || 0)), 0);
                const isSelected = selectedPkgId === pkg.id;
                return (
                    <div key={pkg.id} onClick={() => setSelectedPkgId(pkg.id)}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderLeft: `3px solid ${isSelected ? c.b : 'transparent'}`, backgroundColor: isSelected ? '#1a1f2e' : 'transparent', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s' }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#161b22'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: c.b, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            {editingName === pkg.id ? (
                                <input type="text" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} onBlur={finishRename} onKeyDown={e => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { setEditingName(null); setEditNameValue(''); } }} style={{ ...styles.input, padding: '2px 6px', fontSize: '13px', width: '100%' }} autoFocus />
                            ) : (
                                <div style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pkg.name}</div>
                            )}
                            <div style={{ fontSize: '11px', color: '#6e767d', marginTop: '2px' }}>{(pkg.items || []).length} items · {fmtCost(cost)}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px' }}><Icons.Package /> Packages <span style={styles.badge('green')}>{allPackages.length}</span></h2>
                <button style={styles.button('primary')} onClick={() => setShowCreate(true)}><Icons.Plus /> New Package</button>
            </div>

            {showCreate && (
                <div style={{ ...styles.card, marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Create New Package</h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                        <input type="text" placeholder="Package name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createPackage(); }} style={{ ...styles.input, flex: 1 }} autoFocus />
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                            <input type="radio" name="pkg-scope" checked={newScope === 'catalog'} onChange={() => setNewScope('catalog')} /> Catalog (global)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                            <input type="radio" name="pkg-scope" checked={newScope === 'project'} onChange={() => setNewScope('project')} /> Project-specific
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button style={styles.button('secondary')} onClick={() => { setShowCreate(false); setNewName(''); }}>Cancel</button>
                        <button style={styles.button('primary')} onClick={createPackage} disabled={!newName.trim()}>Create</button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '0', border: '1px solid #2f3336', borderRadius: '12px', overflow: 'hidden', minHeight: '500px', backgroundColor: '#0d1117' }}>
                {/* Left panel: Package list */}
                <div style={{ width: '260px', borderRight: '1px solid #2f3336', overflowY: 'auto', flexShrink: 0 }}>
                    {(catalogPackages || []).length === 0 && (projectPackages || []).length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e767d' }}>
                            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📦</div>
                            <div style={{ fontSize: '13px' }}>No packages yet</div>
                            <div style={{ fontSize: '12px', marginTop: '4px' }}>Click "New Package" to get started</div>
                        </div>
                    ) : (
                        <>
                            {(catalogPackages || []).length > 0 && renderPkgList(sortAlpha(catalogPackages), 'Catalog Packages', 'catalog')}
                            {(projectPackages || []).length > 0 && renderPkgList(sortAlpha(projectPackages), 'Project Packages', 'project')}
                        </>
                    )}
                </div>

                {/* Right panel: Package detail */}
                <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                    {!selectedPkg ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6e767d' }}>
                            <Icons.Package />
                            <div style={{ fontSize: '14px', marginTop: '12px' }}>Select a package to view details</div>
                        </div>
                    ) : (
                        <div>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                <div>
                                    <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: styles.pkgColor(selectedPkg.name).b }} />
                                        {selectedPkg.name}
                                    </h3>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#8b98a5' }}>
                                        <span style={styles.badge(selectedScope === 'catalog' ? 'blue' : 'green')}>{selectedScope === 'catalog' ? 'Catalog' : 'Project'}</span>
                                        <span>Used in {instanceCount} location{instanceCount !== 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button style={styles.button('secondary')} onClick={() => startRenamePkg(selectedPkg)} title="Rename"><Icons.Edit /></button>
                                    <button style={styles.button('secondary')} onClick={() => duplicatePackage(selectedPkg.id)} title="Duplicate package"><Icons.Copy /></button>
                                    {selectedScope === 'project' && (
                                        <button style={{ ...styles.button('secondary'), fontSize: '11px' }} onClick={() => promoteToCatalog(selectedPkg.id)} title="Promote to catalog package">
                                            Promote to Catalog
                                        </button>
                                    )}
                                    <button style={{ ...styles.button('secondary'), color: '#f87171', borderColor: '#f8717140' }} onClick={() => setConfirmDelete(selectedPkg.id)} title="Delete package"><Icons.Trash /></button>
                                </div>
                            </div>

                            {/* Stats bar */}
                            <div style={{ display: 'flex', gap: '20px', padding: '12px 16px', backgroundColor: '#161b22', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                                <div><span style={{ color: '#8b98a5' }}>Components: </span><strong>{(selectedPkg.items || []).length}</strong></div>
                                <div><span style={{ color: '#8b98a5' }}>Unit Cost: </span><strong style={{ color: '#00ba7c' }}>{fmtCost(pkgCost)}</strong></div>
                                <div><span style={{ color: '#8b98a5' }}>Labor: </span><strong>{pkgLabor.toFixed(1)} hrs</strong></div>
                            </div>

                            {/* Column Layout Manager + table */}
                            {(selectedPkg.items || []).length > 0 && (
                                <>
                                    <div style={{ marginBottom: '8px' }}>
                                        <ColumnLayoutManager savedLayouts={pkgLayouts} onSave={savePkgLayout} onLoad={loadPkgLayout} onDelete={deletePkgLayout} onReset={resetPkgColumns} />
                                    </div>
                                    <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                                        <table style={{ ...styles.table, minWidth: pkgCols.reduce((s, c) => s + c.width, 0) }}>
                                            <colgroup>
                                                {pkgCols.map(col => <col key={col.id} style={{ width: col.width + 'px' }} />)}
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    {pkgCols.map((col, colIndex) => (
                                                        <th
                                                            key={col.id}
                                                            style={{
                                                                ...styles.th, ...styles.thResizable, ...compactStyles.th,
                                                                width: col.width + 'px',
                                                                cursor: col.fixed ? 'default' : 'grab',
                                                                backgroundColor: dragOverIndex === colIndex ? '#2d4a6e' : '#1a1f26',
                                                            }}
                                                            draggable={!col.fixed}
                                                            onDragStart={e => startDrag(colIndex, e)}
                                                            onDragOver={e => onDragOver(colIndex, e)}
                                                            onDragLeave={onDragLeave}
                                                            onDrop={e => onDrop(colIndex, e)}
                                                            onDragEnd={onDragEnd}
                                                            onClick={() => { if (!col.fixed && col.id !== 'remove') handleSort(col.id); }}
                                                        >
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{col.label}<SortIcon field={col.id} /></span>
                                                            {!col.fixed && (
                                                                <div
                                                                    style={styles.resizeHandle}
                                                                    onMouseDown={e => { e.stopPropagation(); startPkgResize(colIndex, e); }}
                                                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                                />
                                                            )}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedItems(selectedPkg.items.map((item, origIdx) => ({ ...item, _origIdx: origIdx }))).map((item) => {
                                                    const i = item._origIdx;
                                                    const qpp = item.qtyPerPackage || item.qty || 1;
                                                    const eKey = `${selectedPkg.id}-${i}`;
                                                    const tdS = { ...styles.td, ...compactStyles.td };
                                                    const inpS = { ...styles.inputSmall, ...compactStyles.input, width: '100%', boxSizing: 'border-box' };
                                                    return (
                                                        <tr key={i}
                                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e2d3d'}
                                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                            {pkgCols.map(col => {
                                                                switch (col.id) {
                                                                    case 'qtyPerPkg':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <input type="text" inputMode="decimal"
                                                                                value={editingQpp[eKey] !== undefined ? editingQpp[eKey] : qpp}
                                                                                onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setEditingQpp(prev => ({ ...prev, [eKey]: e.target.value })); }}
                                                                                onFocus={e => { setEditingQpp(prev => ({ ...prev, [eKey]: String(qpp) })); e.target.select(); }}
                                                                                onBlur={() => { const raw = editingQpp[eKey]; setEditingQpp(prev => { const n = { ...prev }; delete n[eKey]; return n; }); if (raw !== undefined) updateComponentField(selectedPkg.id, i, 'qtyPerPackage', Math.max(0, parseFloat(raw) || 0)); }}
                                                                                style={{ ...inpS, width: '60px' }}
                                                                            />
                                                                        </td>;
                                                                    case 'manufacturer':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <input type="text" value={item.manufacturer || ''} onChange={e => updateComponentField(selectedPkg.id, i, 'manufacturer', e.target.value)} placeholder="Manufacturer" style={inpS} />
                                                                        </td>;
                                                                    case 'model':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <input type="text" value={item.model || ''} onChange={e => updateComponentField(selectedPkg.id, i, 'model', e.target.value)} placeholder="Model" style={{ ...inpS, fontWeight: '600' }} />
                                                                        </td>;
                                                                    case 'description':
                                                                        return <td key={col.id} style={{ ...tdS, fontSize: compactMode ? '11px' : '12px' }}>
                                                                            <input type="text" value={item.description || ''} onChange={e => updateComponentField(selectedPkg.id, i, 'description', e.target.value)} placeholder="Description" style={{ ...inpS, fontSize: compactMode ? '11px' : '12px' }} />
                                                                        </td>;
                                                                    case 'unitCost':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <input type="text" inputMode="decimal"
                                                                                value={editingCost[eKey] !== undefined ? editingCost[eKey] : (item.unitCost || 0)}
                                                                                onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setEditingCost(prev => ({ ...prev, [eKey]: e.target.value })); }}
                                                                                onFocus={e => { setEditingCost(prev => ({ ...prev, [eKey]: String(item.unitCost || 0) })); e.target.select(); }}
                                                                                onBlur={() => { const raw = editingCost[eKey]; setEditingCost(prev => { const n = { ...prev }; delete n[eKey]; return n; }); if (raw !== undefined) updateComponentField(selectedPkg.id, i, 'unitCost', parseFloat(raw) || 0); }}
                                                                                style={{ ...inpS, width: '80px', textAlign: 'right' }}
                                                                            />
                                                                        </td>;
                                                                    case 'unitLabor':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <input type="text" inputMode="decimal"
                                                                                value={editingLabor[eKey] !== undefined ? editingLabor[eKey] : (item.laborHrsPerUnit || 0)}
                                                                                onChange={e => { if (/^\d*\.?\d*$/.test(e.target.value)) setEditingLabor(prev => ({ ...prev, [eKey]: e.target.value })); }}
                                                                                onFocus={e => { setEditingLabor(prev => ({ ...prev, [eKey]: String(item.laborHrsPerUnit || 0) })); e.target.select(); }}
                                                                                onBlur={() => { const raw = editingLabor[eKey]; setEditingLabor(prev => { const n = { ...prev }; delete n[eKey]; return n; }); if (raw !== undefined) updateComponentField(selectedPkg.id, i, 'laborHrsPerUnit', parseFloat(raw) || 0); }}
                                                                                style={{ ...inpS, width: '65px', textAlign: 'right' }}
                                                                            />
                                                                        </td>;
                                                                    case 'extCost':
                                                                        return <td key={col.id} style={{ ...tdS, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(qpp * (item.unitCost || 0))}</td>;
                                                                    case 'extLabor':
                                                                        return <td key={col.id} style={tdS}>{fmtHrs(qpp * (item.laborHrsPerUnit || 0))}</td>;
                                                                    case 'phase':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <select value={item.phase || ''} onChange={e => updateComponentField(selectedPkg.id, i, 'phase', e.target.value)} style={{ ...inpS, cursor: 'pointer' }}>
                                                                                <option value="">—</option>
                                                                                {PHASE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                                                            </select>
                                                                        </td>;
                                                                    case 'vendor':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <input type="text" value={item.vendor || ''} onChange={e => updateComponentField(selectedPkg.id, i, 'vendor', e.target.value)} placeholder="Vendor" style={inpS} />
                                                                        </td>;
                                                                    case 'notes':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <input type="text" value={item.notes || ''} onChange={e => updateComponentField(selectedPkg.id, i, 'notes', e.target.value)} placeholder="..." style={{ ...inpS, fontSize: compactMode ? '10px' : '11px' }} />
                                                                        </td>;
                                                                    case 'remove':
                                                                        return <td key={col.id} style={tdS}>
                                                                            <button style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px' }} onClick={() => removeComponent(selectedPkg.id, i)} title="Remove">×</button>
                                                                        </td>;
                                                                    default:
                                                                        return <td key={col.id} style={tdS}></td>;
                                                                }
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {/* Add Component */}
                            {showAddComponent ? (
                                <div style={{ ...styles.card, padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <h4 style={{ margin: 0, fontSize: '14px' }}>Add Component from Catalog</h4>
                                        <button style={{ background: 'none', border: 'none', color: '#8b98a5', cursor: 'pointer', fontSize: '18px' }} onClick={() => { setShowAddComponent(false); setAddComponentSearch(''); }}>×</button>
                                    </div>
                                    <input type="text" placeholder="Search catalog by name, model, or part number..." value={addComponentSearch} onChange={e => setAddComponentSearch(e.target.value)} style={{ ...styles.input, marginBottom: '8px' }} autoFocus />
                                    {addComponentSearch.length >= 2 && (
                                        <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                                            {filteredCatalog.length === 0 ? (
                                                <div style={{ padding: '16px', textAlign: 'center', color: '#6e767d', fontSize: '13px' }}>No results</div>
                                            ) : filteredCatalog.map((item, idx) => (
                                                <div key={idx} onClick={() => addComponentFromCatalog(item)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #2f3336', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#161b22'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <div>
                                                        <span style={{ color: '#8b98a5' }}>{item.manufacturer}</span>{' '}
                                                        <strong>{item.model}</strong>
                                                        {item.partNumber && <span style={{ color: '#6e767d', marginLeft: '8px', fontSize: '11px' }}>{item.partNumber}</span>}
                                                    </div>
                                                    <span style={{ color: '#00ba7c', fontWeight: '600' }}>{fmtCost(item.unitCost || 0)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button style={styles.button('secondary')} onClick={() => setShowAddComponent(true)}>
                                    <Icons.Plus /> Add Component
                                </button>
                            )}

                            {/* Delete confirmation */}
                            {confirmDelete === selectedPkg.id && (
                                <div style={{ ...styles.card, marginTop: '16px', borderColor: '#f8717140', padding: '16px' }}>
                                    <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                                        Delete <strong>{selectedPkg.name}</strong>?
                                        {instanceCount > 0 && <span style={{ color: '#f59e0b' }}> This package is used in {instanceCount} location{instanceCount !== 1 ? 's' : ''}. Those instances will show as "missing".</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                        <button style={styles.button('secondary')} onClick={() => setConfirmDelete(null)}>Cancel</button>
                                        <button style={{ ...styles.button('primary'), backgroundColor: '#f87171' }} onClick={() => deletePackage(selectedPkg.id)}>Delete</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
