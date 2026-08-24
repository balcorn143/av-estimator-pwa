import React from 'react';
const { useState, useEffect, useMemo, useCallback, useRef } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost, fmtHrs } from '../utils/formatters';
import { PHASE_OPTIONS } from '../constants';
import useFlexibleColumns from '../hooks/useFlexibleColumns';
import ColumnLayoutManager from './ColumnLayoutManager';
import { generatePackageId, findAllPackageInstances } from '../utils/packages';

const LEFT_PANEL_KEY = 'packages-left-panel-width';
const SECTION_COLLAPSE_KEY = 'packages-section-collapsed';
const FOLDER_COLLAPSE_KEY = 'packages-folder-collapsed';
const SORT_KEY = 'packages-sort';

// Parse a saved width clamp into bounds. 220 is the minimum where folder
// indentation + actions still look acceptable; 800 keeps the right panel
// usable on smaller windows.
const clampWidth = (n) => Math.max(220, Math.min(800, n));

// Build a tree of folders + packages from a flat list. Folder paths are
// forward-slash delimited (e.g., "Cisco/Conference Bars"). Packages without
// a folder land in root.packages; sub-folders nest via subfolders[name].
const buildFolderTree = (pkgs) => {
    const root = { name: '', path: '', subfolders: {}, packages: [] };
    (pkgs || []).forEach(pkg => {
        const folder = (pkg.folder || '').trim();
        if (!folder) { root.packages.push(pkg); return; }
        const segments = folder.split('/').map(s => s.trim()).filter(Boolean);
        if (segments.length === 0) { root.packages.push(pkg); return; }
        let node = root;
        let path = '';
        for (const seg of segments) {
            path = path ? `${path}/${seg}` : seg;
            if (!node.subfolders[seg]) {
                node.subfolders[seg] = { name: seg, path, subfolders: {}, packages: [] };
            }
            node = node.subfolders[seg];
        }
        node.packages.push(pkg);
    });
    return root;
};

const countInTree = (node) => {
    let n = (node.packages || []).length;
    for (const child of Object.values(node.subfolders || {})) n += countInTree(child);
    return n;
};

// Sort is just direction — name only, A→Z or Z→A. Matches the locations
// pane (single SortAZ icon button there); we expose both directions because
// the user asked for explicit Z→A in addition.
const sortPackages = (pkgs, dir) => {
    const factor = dir === 'desc' ? -1 : 1;
    return [...pkgs].sort((a, b) => {
        const av = (a.name || '').toLowerCase();
        const bv = (b.name || '').toLowerCase();
        if (av < bv) return -factor;
        if (av > bv) return factor;
        return 0;
    });
};

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

export default function PackagesView({
    catalogPackages,
    projectPackages,
    // New granular handlers — each catalog-package mutation hits Supabase
    // immediately so two teammates can't race on a JSON-blob upsert.
    onUpsertCatalogPackage,
    onDeleteCatalogPackage,
    // Project packages still live inside projects.data (one editor at a time
    // via the checkout mechanism), so they keep the functional-setter shape.
    onUpdateProjectPackages,
    catalog,
    locations,
    compactMode,
    initialSelectedPkgId,
    onInitialPkgConsumed,
}) {
    const [selectedPkgId, setSelectedPkgId] = useState(null);
    const [hoveredPkgId, setHoveredPkgId] = useState(null);
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
    // sortField/sortDir drive in-package item sorting (the table on the right).
    // Package-list ordering uses pkgSortDir below.
    const [sortField, setSortField] = useState(null);
    const [sortDir, setSortDir] = useState('asc');

    // Left panel — resizable, with persisted width, collapsible sections and
    // folders, and per-list sort. All persisted to localStorage so the user's
    // layout survives reloads.
    const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
        const saved = localStorage.getItem(LEFT_PANEL_KEY);
        return saved ? clampWidth(parseInt(saved, 10) || 280) : 280;
    });
    const leftPanelResizing = useRef(false);
    const startLeftPanelResize = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        leftPanelResizing.current = true;
        const startX = e.clientX;
        const startWidth = leftPanelWidth;
        const onMouseMove = (ev) => {
            const next = clampWidth(startWidth + (ev.clientX - startX));
            setLeftPanelWidth(next);
        };
        const onMouseUp = () => {
            leftPanelResizing.current = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            setLeftPanelWidth(w => { localStorage.setItem(LEFT_PANEL_KEY, String(w)); return w; });
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [leftPanelWidth]);

    const [collapsedSections, setCollapsedSections] = useState(() => {
        try { return JSON.parse(localStorage.getItem(SECTION_COLLAPSE_KEY)) || {}; } catch { return {}; }
    });
    const toggleSection = (key) => setCollapsedSections(prev => {
        const next = { ...prev, [key]: !prev[key] };
        localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(next));
        return next;
    });

    const [collapsedFolders, setCollapsedFolders] = useState(() => {
        try { return JSON.parse(localStorage.getItem(FOLDER_COLLAPSE_KEY)) || {}; } catch { return {}; }
    });
    const toggleFolder = (path) => setCollapsedFolders(prev => {
        const next = { ...prev, [path]: !prev[path] };
        localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify(next));
        return next;
    });

    // Sort direction only ('asc' | 'desc'). Default A→Z. Persisted.
    const [pkgSortDir, setPkgSortDir] = useState(() => {
        const saved = localStorage.getItem(SORT_KEY);
        return saved === 'desc' ? 'desc' : 'asc';
    });
    const updateSortDir = (dir) => { setPkgSortDir(dir); localStorage.setItem(SORT_KEY, dir); };

    // Expand/collapse-all helpers operate on both section + folder collapse
    // state at once, mirroring the locations pane's "expand all / collapse
    // all" affordances.
    const expandAllPackages = () => {
        setCollapsedSections({});
        setCollapsedFolders({});
        localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify({}));
        localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify({}));
    };
    const collapseAllPackages = () => {
        const sections = { catalog: true, project: true };
        const folders = {};
        const walk = (node) => {
            Object.values(node.subfolders || {}).forEach(child => {
                folders[child.path] = true;
                walk(child);
            });
        };
        walk(buildFolderTree(catalogPackages || []));
        setCollapsedSections(sections);
        setCollapsedFolders(folders);
        localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(sections));
        localStorage.setItem(FOLDER_COLLAPSE_KEY, JSON.stringify(folders));
    };

    // Local edit buffer for the right-panel folder input so typing doesn't
    // fire a Supabase write on every keystroke. Commits on blur / Enter.
    const [folderEditValue, setFolderEditValue] = useState(null);
    useEffect(() => { setFolderEditValue(null); }, [selectedPkgId]);

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
    // Every folder path mentioned anywhere in the catalog list — used by the
    // datalist autocomplete on the right-panel folder input so the user can
    // pick an existing folder instead of retyping it.
    const allFolders = useMemo(() => {
        const set = new Set();
        (catalogPackages || []).forEach(pkg => {
            if (!pkg.folder) return;
            const segs = pkg.folder.split('/').map(s => s.trim()).filter(Boolean);
            let path = '';
            for (const s of segs) { path = path ? `${path}/${s}` : s; set.add(path); }
        });
        return [...set].sort();
    }, [catalogPackages]);
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
            onUpsertCatalogPackage(pkg);
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
        const updated = {
            ...(typeof updater === 'function' ? updater(pkg) : updater),
            updatedAt: new Date().toISOString(),
        };
        const scope = pkg.scope === 'project' ? 'project' : 'catalog';
        if (scope === 'catalog') {
            onUpsertCatalogPackage(updated);
        } else {
            onUpdateProjectPackages(prev => ({
                ...prev,
                packages: (prev.packages || []).map(p => p.id === pkgId ? updated : p),
            }));
        }
    };

    const deletePackage = (pkgId) => {
        const pkg = allPackages.find(p => p.id === pkgId);
        if (!pkg) return;
        if (pkg.scope === 'project') {
            onUpdateProjectPackages(prev => ({ ...prev, packages: (prev.packages || []).filter(p => p.id !== pkgId) }));
        } else {
            onDeleteCatalogPackage(pkgId);
        }
        if (selectedPkgId === pkgId) setSelectedPkgId(null);
        setConfirmDelete(null);
    };

    const promoteToCatalog = (pkgId) => {
        const pkg = (projectPackages || []).find(p => p.id === pkgId);
        if (!pkg) return;
        onUpsertCatalogPackage({ ...pkg, scope: 'catalog', updatedAt: new Date().toISOString() });
        onUpdateProjectPackages(prev => ({ ...prev, packages: (prev.packages || []).filter(p => p.id !== pkgId) }));
    };

    const duplicatePackage = (pkgId) => {
        const pkg = allPackages.find(p => p.id === pkgId);
        if (!pkg) return;
        const newPkg = { ...pkg, id: generatePackageId(), name: pkg.name + ' (Copy)', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), items: (pkg.items || []).map(item => ({ ...item })) };
        if (pkg.scope === 'project') {
            onUpdateProjectPackages(prev => ({ ...prev, packages: [...(prev.packages || []), newPkg] }));
        } else {
            onUpsertCatalogPackage(newPkg);
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

    // Compact action button used inside each row in the package list.
    // stopPropagation so clicking it doesn't also select the row underneath.
    const RowAction = ({ onClick, title, color, children }) => (
        <button
            onClick={e => { e.stopPropagation(); onClick(); }}
            title={title}
            style={{
                padding: '4px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: color || '#8b98a5',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#2f3336'; e.currentTarget.style.color = color || '#e7e9ea'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = color || '#8b98a5'; }}
        >
            {children}
        </button>
    );

    // One row in the left list. depth indents the row to its folder level.
    const renderPackageRow = (pkg, depth = 0) => {
        const c = styles.pkgColor(pkg.name);
        const cost = (pkg.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.unitCost || 0)), 0);
        const isSelected = selectedPkgId === pkg.id;
        const isHovered = hoveredPkgId === pkg.id;
        const actionsVisible = isSelected || isHovered;
        return (
            <div key={pkg.id} onClick={() => setSelectedPkgId(pkg.id)}
                style={{ padding: '10px 12px', paddingLeft: 12 + depth * 14, cursor: 'pointer', borderLeft: `3px solid ${isSelected ? c.b : 'transparent'}`, backgroundColor: isSelected ? '#1a1f2e' : 'transparent', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s' }}
                onMouseEnter={e => { setHoveredPkgId(pkg.id); if (!isSelected) e.currentTarget.style.backgroundColor = '#161b22'; }}
                onMouseLeave={e => { setHoveredPkgId(null); if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: c.b, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    {editingName === pkg.id ? (
                        <input type="text" value={editNameValue} onChange={e => setEditNameValue(e.target.value)} onClick={e => e.stopPropagation()} onBlur={finishRename} onKeyDown={e => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') { setEditingName(null); setEditNameValue(''); } }} style={{ ...styles.input, padding: '2px 6px', fontSize: '13px', width: '100%' }} autoFocus />
                    ) : (
                        <div style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={pkg.name}>{pkg.name}</div>
                    )}
                    <div style={{ fontSize: '11px', color: '#6e767d', marginTop: '2px' }}>{(pkg.items || []).length} items · {fmtCost(cost)}</div>
                </div>
                <div style={{
                    display: 'flex',
                    gap: '2px',
                    flexShrink: 0,
                    opacity: actionsVisible ? 1 : 0,
                    pointerEvents: actionsVisible ? 'auto' : 'none',
                    transition: 'opacity 0.15s',
                }}>
                    <RowAction onClick={() => startRenamePkg(pkg)} title="Rename"><Icons.Edit /></RowAction>
                    <RowAction onClick={() => duplicatePackage(pkg.id)} title="Duplicate"><Icons.Copy /></RowAction>
                    <RowAction onClick={() => setConfirmDelete(pkg.id)} title="Delete" color="#f87171"><Icons.Trash /></RowAction>
                </div>
            </div>
        );
    };

    // Recursive folder tree. Renders packages directly in this node first
    // (sorted), then each sub-folder header with its own subtree.
    const renderFolderNode = (node, depth) => {
        const subNames = Object.keys(node.subfolders || {}).sort((a, b) => a.localeCompare(b));
        return (
            <React.Fragment key={node.path || '__root'}>
                {sortPackages(node.packages, pkgSortDir).map(pkg => renderPackageRow(pkg, depth))}
                {subNames.map(name => {
                    const child = node.subfolders[name];
                    const collapsed = !!collapsedFolders[child.path];
                    const total = countInTree(child);
                    return (
                        <div key={child.path}>
                            <div
                                onClick={() => toggleFolder(child.path)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    paddingLeft: 12 + depth * 14,
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    color: '#c9d1d9',
                                    backgroundColor: '#141a22',
                                    borderBottom: '1px solid #21262d',
                                    userSelect: 'none',
                                }}
                                title={child.path}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1a2230'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#141a22'}
                            >
                                <span style={{ display: 'inline-flex', color: '#8b98a5' }}>
                                    {collapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
                                </span>
                                <span style={{ display: 'inline-flex', color: '#f59e0b' }}>
                                    {collapsed ? <Icons.Folder /> : <Icons.FolderOpen />}
                                </span>
                                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{child.name}</span>
                                <span style={{ fontSize: '11px', color: '#6e767d', fontWeight: '500' }}>{total}</span>
                            </div>
                            {!collapsed && renderFolderNode(child, depth + 1)}
                        </div>
                    );
                })}
            </React.Fragment>
        );
    };

    // Collapsible section header + body. supportsFolders=true wraps the
    // package list in the folder tree; false renders flat (project packages).
    const renderSection = ({ title, scope, pkgs, supportsFolders }) => {
        const collapsed = !!collapsedSections[scope];
        const sectionBadgeColor = scope === 'catalog' ? 'blue' : 'green';
        return (
            <div style={{ marginBottom: '8px' }}>
                <div
                    onClick={() => toggleSection(scope)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderBottom: '1px solid #2f3336',
                        backgroundColor: '#0d1117',
                        cursor: 'pointer',
                        userSelect: 'none',
                    }}>
                    <span style={{ display: 'inline-flex', color: '#8b98a5' }}>
                        {collapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#8b98a5', flex: 1 }}>{title}</span>
                    <span style={styles.badge(sectionBadgeColor)}>{pkgs.length}</span>
                </div>
                {!collapsed && (
                    supportsFolders
                        ? renderFolderNode(buildFolderTree(pkgs), 0)
                        : sortPackages(pkgs, pkgSortDir).map(pkg => renderPackageRow(pkg, 0))
                )}
            </div>
        );
    };

    return (
        // Fill the parent's height and let the two panes scroll internally
        // instead of growing the page.
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '12px' }}><Icons.Package /> Packages <span style={styles.badge('green')}>{allPackages.length}</span></h2>
                <button style={styles.button('primary')} onClick={() => setShowCreate(true)}><Icons.Plus /> New Package</button>
            </div>

            {showCreate && (
                <div style={{ ...styles.card, marginBottom: '20px', flexShrink: 0 }}>
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

            <div style={{ display: 'flex', gap: '0', border: '1px solid #2f3336', borderRadius: '12px', overflow: 'hidden', flex: 1, minHeight: 0, backgroundColor: '#0d1117' }}>
                {/* Left panel: Package list — resizable, with sort + folder tree */}
                <div style={{ width: leftPanelWidth + 'px', borderRight: '1px solid #2f3336', display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, position: 'relative' }}>
                    {/* Header bar — matches the locations sidebar: title on the
                        left, icon actions on the right (expand/collapse all,
                        sort A→Z, sort Z→A). The active sort direction is
                        highlighted blue. */}
                    <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #2f3336', backgroundColor: '#0d1117' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#8b98a5', textTransform: 'uppercase', letterSpacing: '1px' }}>Packages</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button style={{ ...styles.iconButton, color: '#8b98a5' }} onClick={expandAllPackages} title="Expand All"><Icons.ChevronsDown /></button>
                                <button style={{ ...styles.iconButton, color: '#8b98a5' }} onClick={collapseAllPackages} title="Collapse All"><Icons.ChevronsUp /></button>
                                <button
                                    style={{ ...styles.iconButton, color: pkgSortDir === 'asc' ? '#1d9bf0' : '#8b98a5' }}
                                    onClick={() => updateSortDir('asc')}
                                    title="Sort A→Z">
                                    <Icons.SortAZ />
                                </button>
                                <button
                                    style={{ ...styles.iconButton, color: pkgSortDir === 'desc' ? '#1d9bf0' : '#8b98a5' }}
                                    onClick={() => updateSortDir('desc')}
                                    title="Sort Z→A">
                                    <span style={{ display: 'inline-flex', transform: 'scaleY(-1)' }}><Icons.SortAZ /></span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                        {(catalogPackages || []).length === 0 && (projectPackages || []).length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e767d' }}>
                                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📦</div>
                                <div style={{ fontSize: '13px' }}>No packages yet</div>
                                <div style={{ fontSize: '12px', marginTop: '4px' }}>Click "New Package" to get started</div>
                            </div>
                        ) : (
                            <>
                                {(catalogPackages || []).length > 0 && renderSection({ title: 'Catalog Packages', scope: 'catalog', pkgs: catalogPackages, supportsFolders: true })}
                                {(projectPackages || []).length > 0 && renderSection({ title: 'Project Packages', scope: 'project', pkgs: projectPackages, supportsFolders: false })}
                            </>
                        )}
                    </div>
                    {/* Drag handle on the right edge to resize the panel */}
                    <div
                        onMouseDown={startLeftPanelResize}
                        title="Drag to resize"
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px', cursor: 'col-resize', backgroundColor: 'transparent', zIndex: 5, transition: 'background-color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1d9bf0'}
                        onMouseLeave={e => { if (!leftPanelResizing.current) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    />
                </div>

                {/* Right panel: Package detail */}
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain', padding: '20px' }}>
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
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#8b98a5', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={styles.badge(selectedScope === 'catalog' ? 'blue' : 'green')}>{selectedScope === 'catalog' ? 'Catalog' : 'Project'}</span>
                                        <span>Used in {instanceCount} location{instanceCount !== 1 ? 's' : ''}</span>
                                        {selectedScope === 'catalog' && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ color: '#f59e0b', display: 'inline-flex' }}><Icons.Folder /></span>
                                                <input
                                                    type="text"
                                                    list="catalog-folders"
                                                    placeholder="No folder"
                                                    value={folderEditValue !== null ? folderEditValue : (selectedPkg.folder || '')}
                                                    onChange={e => setFolderEditValue(e.target.value)}
                                                    onBlur={() => {
                                                        if (folderEditValue !== null) {
                                                            const next = folderEditValue.trim();
                                                            if (next !== (selectedPkg.folder || '')) {
                                                                updatePackage(selectedPkg.id, p => ({ ...p, folder: next || null }));
                                                            }
                                                            setFolderEditValue(null);
                                                        }
                                                    }}
                                                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setFolderEditValue(null); e.currentTarget.blur(); } }}
                                                    title="Slash-delimited folder path, e.g. Cisco/Conference Bars"
                                                    style={{ ...styles.inputSmall, width: '220px', padding: '2px 6px', fontSize: '12px' }}
                                                />
                                                <datalist id="catalog-folders">
                                                    {allFolders.map(f => <option key={f} value={f} />)}
                                                </datalist>
                                            </span>
                                        )}
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

                        </div>
                    )}
                </div>
            </div>

            {/* Delete confirmation — true modal so it works for any package the
                user clicks delete on (left-list trash icon or right-panel header),
                not just the currently selected one. */}
            {confirmDelete && (() => {
                const pkg = allPackages.find(p => p.id === confirmDelete);
                if (!pkg) return null;
                const count = findAllPackageInstances(locations || [], pkg.id).length;
                return (
                    <div style={styles.modal} onClick={() => setConfirmDelete(null)}>
                        <div style={{ ...styles.modalContent, width: '420px' }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icons.Trash /> Delete "{pkg.name}"?
                            </h3>
                            {count > 0 ? (
                                <p style={{ margin: '0 0 16px 0', color: '#f59e0b', fontSize: '13px' }}>
                                    This package is used in {count} location{count !== 1 ? 's' : ''}. Those instances will show as "missing".
                                </p>
                            ) : (
                                <p style={{ margin: '0 0 16px 0', color: '#8b98a5', fontSize: '13px' }}>
                                    This package is not used in any location.
                                </p>
                            )}
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button style={styles.button('secondary')} onClick={() => setConfirmDelete(null)}>Cancel</button>
                                <button style={{ ...styles.button('primary'), backgroundColor: '#f87171' }} onClick={() => deletePackage(pkg.id)}>Delete</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
