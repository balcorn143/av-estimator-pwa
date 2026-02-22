import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';
import useFlexibleColumns from '../hooks/useFlexibleColumns';
import { generatePackageId, findAllPackageInstances } from '../utils/packages';

export default function PackagesView({ catalogPackages, projectPackages, onUpdateCatalogPackages, onUpdateProjectPackages, catalog, locations, onSyncInstances }) {
    const [selectedPkgId, setSelectedPkgId] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newScope, setNewScope] = useState('catalog');
    const [showAddComponent, setShowAddComponent] = useState(false);
    const [addComponentSearch, setAddComponentSearch] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [editingName, setEditingName] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');
    const [syncPrompt, setSyncPrompt] = useState(null); // { pkgId, pkgName, newVersion, instanceCount }

    // Resizable columns for package detail table
    const PKG_COLUMNS = [
        { id: 'qtyPerPkg', label: 'Qty/Pkg', width: 80 },
        { id: 'manufacturer', label: 'Manufacturer', width: 150 },
        { id: 'model', label: 'Model', width: 180 },
        { id: 'unitCost', label: 'Unit Cost', width: 100 },
        { id: 'labor', label: 'Labor', width: 80 },
        { id: 'ext', label: 'Ext.', width: 90 },
        { id: 'remove', label: '', width: 40, fixed: true },
    ];
    const { columns: pkgCols, startResize: startPkgResize } = useFlexibleColumns(PKG_COLUMNS);

    const allPackages = [...(catalogPackages || []), ...(projectPackages || [])];
    const selectedPkg = allPackages.find(p => p.id === selectedPkgId);
    const selectedScope = selectedPkg ? (selectedPkg.scope === 'project' ? 'project' : 'catalog') : null;

    // Find all instances of selected package across locations
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
        const scope = pkg.scope === 'project' ? 'project' : 'catalog';
        if (scope === 'catalog') {
            onUpdateCatalogPackages(prev => prev.filter(p => p.id !== pkgId));
        } else {
            onUpdateProjectPackages(prev => ({
                ...prev,
                packages: (prev.packages || []).filter(p => p.id !== pkgId),
            }));
        }
        if (selectedPkgId === pkgId) setSelectedPkgId(null);
        setConfirmDelete(null);
    };

    const promoteToCatalog = (pkgId) => {
        const pkg = (projectPackages || []).find(p => p.id === pkgId);
        if (!pkg) return;
        const promoted = { ...pkg, scope: 'catalog', updatedAt: new Date().toISOString() };
        onUpdateCatalogPackages(prev => [...prev, promoted]);
        onUpdateProjectPackages(prev => ({
            ...prev,
            packages: (prev.packages || []).filter(p => p.id !== pkgId),
        }));
    };

    const duplicatePackage = (pkgId) => {
        const pkg = allPackages.find(p => p.id === pkgId);
        if (!pkg) return;
        const newPkg = {
            ...pkg,
            id: generatePackageId(),
            name: pkg.name + ' (Copy)',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: (pkg.items || []).map(item => ({ ...item })),
        };
        const scope = pkg.scope === 'project' ? 'project' : 'catalog';
        if (scope === 'catalog') {
            onUpdateCatalogPackages(prev => [...prev, newPkg]);
        } else {
            onUpdateProjectPackages(prev => ({ ...prev, packages: [...(prev.packages || []), newPkg] }));
        }
        setSelectedPkgId(newPkg.id);
        setEditingName(newPkg.id);
        setEditNameValue(newPkg.name);
    };

    const triggerSyncPrompt = (pkgId) => {
        const pkg = [...(catalogPackages || []), ...(projectPackages || [])].find(p => p.id === pkgId);
        if (!pkg) return;
        const instances = findAllPackageInstances(locations || [], pkgId);
        // Only show prompt if there are existing instances that would be affected
        if (instances.length > 0) {
            setSyncPrompt({ pkgId, pkgName: pkg.name, newVersion: (pkg.version || 1) + 1, instanceCount: instances.length });
        }
    };

    const handleSyncAll = () => {
        if (!syncPrompt || !onSyncInstances) return;
        onSyncInstances(syncPrompt.pkgId, syncPrompt.newVersion);
        setSyncPrompt(null);
    };

    const removeComponent = (pkgId, itemIdx) => {
        triggerSyncPrompt(pkgId);
        updatePackage(pkgId, p => ({
            ...p,
            version: (p.version || 1) + 1,
            items: p.items.filter((_, i) => i !== itemIdx),
        }));
    };

    const updateComponentField = (pkgId, itemIdx, field, value) => {
        updatePackage(pkgId, p => ({
            ...p,
            items: p.items.map((item, i) => i === itemIdx ? { ...item, [field]: value } : item),
        }));
    };

    const addComponentFromCatalog = (catalogItem) => {
        if (!selectedPkgId) return;
        const newItem = {
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
            qtyPerPackage: 1,
            qty: 1,
        };
        triggerSyncPrompt(selectedPkgId);
        updatePackage(selectedPkgId, p => ({
            ...p,
            version: (p.version || 1) + 1,
            items: [...(p.items || []), newItem],
        }));
        setShowAddComponent(false);
        setAddComponentSearch('');
    };

    const filteredCatalog = addComponentSearch.length >= 2 ? (catalog || []).filter(item => {
        const q = addComponentSearch.toLowerCase();
        return (item.manufacturer || '').toLowerCase().includes(q) ||
            (item.model || '').toLowerCase().includes(q) ||
            (item.partNumber || '').toLowerCase().includes(q) ||
            (item.description || '').toLowerCase().includes(q);
    }).slice(0, 50) : [];

    const startRenamePkg = (pkg) => {
        setEditingName(pkg.id);
        setEditNameValue(pkg.name);
    };

    const finishRename = () => {
        if (editingName && editNameValue.trim()) {
            updatePackage(editingName, p => ({ ...p, name: editNameValue.trim() }));
        }
        setEditingName(null);
        setEditNameValue('');
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

    const pkgCost = selectedPkg ? (selectedPkg.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.unitCost || 0)), 0) : 0;
    const pkgLabor = selectedPkg ? (selectedPkg.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.laborHrsPerUnit || 0)), 0) : 0;

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
                            {(catalogPackages || []).length > 0 && renderPkgList(catalogPackages, 'Catalog Packages', 'catalog')}
                            {(projectPackages || []).length > 0 && renderPkgList(projectPackages, 'Project Packages', 'project')}
                        </>
                    )}
                </div>

                {/* Right panel: Package detail */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
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
                                        <span>v{selectedPkg.version || 1}</span>
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

                            {/* Components table */}
                            {(selectedPkg.items || []).length > 0 && (
                                <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                                    <table style={{ ...styles.table, tableLayout: 'fixed', width: pkgCols.reduce((s, c) => s + c.width, 0) + 'px' }}>
                                        <thead>
                                            <tr>
                                                {pkgCols.map((col, colIndex) => (
                                                    <th key={col.id} style={{ ...styles.th, width: col.width + 'px', position: 'relative' }}>
                                                        {col.label}
                                                        {!col.fixed && (
                                                            <div
                                                                style={styles.resizeHandle}
                                                                onMouseDown={e => startPkgResize(colIndex, e)}
                                                                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                            />
                                                        )}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedPkg.items.map((item, i) => {
                                                const qpp = item.qtyPerPackage || item.qty || 1;
                                                const ext = qpp * (item.unitCost || 0);
                                                return (
                                                    <tr key={i}>
                                                        {pkgCols.map(col => {
                                                            if (col.id === 'qtyPerPkg') return <td key={col.id} style={styles.td}><input type="number" min="1" value={qpp} onChange={e => updateComponentField(selectedPkg.id, i, 'qtyPerPackage', Math.max(1, parseInt(e.target.value) || 1))} onFocus={e => e.target.select()} style={{ ...styles.inputSmall, width: '100%', boxSizing: 'border-box' }} /></td>;
                                                            if (col.id === 'manufacturer') return <td key={col.id} style={styles.td}>{item.manufacturer}</td>;
                                                            if (col.id === 'model') return <td key={col.id} style={{ ...styles.td, fontWeight: '600' }}>{item.model}</td>;
                                                            if (col.id === 'unitCost') return <td key={col.id} style={styles.td}><input type="number" min="0" step="0.01" value={item.unitCost || 0} onChange={e => updateComponentField(selectedPkg.id, i, 'unitCost', parseFloat(e.target.value) || 0)} onFocus={e => e.target.select()} style={{ ...styles.inputSmall, width: '100%', boxSizing: 'border-box' }} /></td>;
                                                            if (col.id === 'labor') return <td key={col.id} style={styles.td}><input type="number" min="0" step="0.1" value={item.laborHrsPerUnit || 0} onChange={e => updateComponentField(selectedPkg.id, i, 'laborHrsPerUnit', parseFloat(e.target.value) || 0)} onFocus={e => e.target.select()} style={{ ...styles.inputSmall, width: '100%', boxSizing: 'border-box' }} /></td>;
                                                            if (col.id === 'ext') return <td key={col.id} style={{ ...styles.td, color: '#00ba7c', fontWeight: '600' }}>{fmtCost(ext)}</td>;
                                                            if (col.id === 'remove') return <td key={col.id} style={styles.td}><button style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }} onClick={() => removeComponent(selectedPkg.id, i)} title="Remove component">×</button></td>;
                                                            return null;
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
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
                                            ) : filteredCatalog.map((item, i) => (
                                                <div key={i} onClick={() => addComponentFromCatalog(item)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #2f3336', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}
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

            {/* Sync Prompt Modal */}
            {syncPrompt && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSyncPrompt(null)}>
                    <div style={{ ...styles.card, maxWidth: '440px', width: '90%', padding: '24px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icons.Package /> Update Package Instances?
                        </h3>
                        <p style={{ margin: '0 0 16px 0', color: '#8b98a5', fontSize: '14px', lineHeight: '1.5' }}>
                            You've modified <strong style={{ color: '#e7e9ea' }}>{syncPrompt.pkgName}</strong>.
                            There {syncPrompt.instanceCount === 1 ? 'is' : 'are'} <strong style={{ color: '#e7e9ea' }}>{syncPrompt.instanceCount}</strong> instance{syncPrompt.instanceCount !== 1 ? 's' : ''} of this package across your project locations.
                        </p>
                        <p style={{ margin: '0 0 20px 0', color: '#8b98a5', fontSize: '13px' }}>
                            Update all instances to use the new definition (v{syncPrompt.newVersion}), or skip to leave them on the previous version.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={styles.button('secondary')} onClick={() => setSyncPrompt(null)}>Skip</button>
                            <button style={styles.button('primary')} onClick={handleSyncAll}>Update All Instances</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
