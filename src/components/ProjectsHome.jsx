import React from 'react'
const { useState, useEffect, useLayoutEffect, useMemo, useRef } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { PROJECT_STATUSES } from '../constants'
import { APP_VERSION } from '../config'
import { fmtCost, fmtHrs } from '../utils/formatters'
import useFlexibleColumns from '../hooks/useFlexibleColumns'

// Project-dashboard columns — driven through useFlexibleColumns so each
// header has a drag handle to resize. The Actions column is fixed (no
// resize / reorder) since the ellipsis button is a fixed-width control.
const PROJECT_DASH_COLUMNS = [
    { id: 'name',          label: 'Project',      width: 240 },
    { id: 'client',        label: 'Client',       width: 180 },
    { id: 'projectNumber', label: 'Project #',    width: 120 },
    { id: 'material',      label: 'Value',        width: 110 },
    { id: 'labor',         label: 'Labor',        width: 100 },
    { id: 'status',        label: 'Status',       width: 130 },
    { id: 'updatedAt',     label: 'Last Updated', width: 200 },
    { id: 'actions',       label: '',             width: 48, fixed: true },
];

// Pipeline stages — All first, then in lifecycle order. Keys after 'all'
// correspond directly to PROJECT_STATUSES keys so filter === status.
const PIPELINE_STAGES = [
    { key: 'all',                label: 'All' },
    { key: 'developing',         label: 'Developing' },
    { key: 'proposal-submitted', label: 'Submitted' },
    { key: 'active',             label: 'Active' },
    { key: 'completed',          label: 'Completed' },
    { key: 'lost',               label: 'Lost' },
    { key: 'archived',           label: 'Archived' },
];

// Avatar helpers — deterministic chip color + 2-letter initials derived
// from the user's email so each estimator gets a consistent visual.
const AVATAR_COLORS = ['#1d9bf0', '#00ba7c', '#f59e0b', '#a855f7', '#f87171', '#06b6d4', '#ec4899', '#10b981'];
const getInitials = (email) => {
    if (!email) return '?';
    const local = email.split('@')[0];
    const parts = local.split(/[._\-+]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
};
const getAvatarColor = (email) => {
    if (!email) return '#6e767d';
    let hash = 0;
    for (let i = 0; i < email.length; i++) hash = (email.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};


export default function ProjectsHome({ projects, onOpen, onOpenRevision, onCreate, onOpenCatalog, onOpenTeam, team, checkouts, onEdit, onDuplicate, onDelete, onUpdateStatus, onCreateRevision, getProjectTotals, searchTerm, onSearchChange, filter, onFilterChange, session, syncStatus, onLogout, onForceCheckin, selectedProjectId, onSelectProject, packages, currentView, onSwitchView }) {
    const [contextMenu, setContextMenu] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [sortCol, setSortCol] = useState('updatedAt');
    const [sortDir, setSortDir] = useState('desc');
    const [expandedRevisions, setExpandedRevisions] = useState({});
    const contextMenuRef = useRef(null);

    // Resizable columns for the project table. layoutKey lets users save
    // named column layouts via localStorage (same hook used by BOM /
    // PackagesView).
    const { columns: projCols, startResize: startProjResize } = useFlexibleColumns(PROJECT_DASH_COLUMNS, 'projects-dashboard');

    const handleSort = (col) => {
        if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
        else { setSortCol(col); setSortDir(col === 'name' || col === 'client' || col === 'projectNumber' ? 'asc' : 'desc'); }
    };

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <span style={{ color: '#4a5568', marginLeft: '4px' }}>{'\u21C5'}</span>;
        return <span style={{ color: '#1d9bf0', marginLeft: '4px' }}>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
    };

    // Filter and search projects
    const filteredProjects = useMemo(() => {
        let result = projects.filter(p => {
            // Status filter — exact match against the project's status; 'all'
            // is the only bypass. Projects with no status default to 'developing'
            // so the Developing tab catches them.
            if (filter !== 'all') {
                const projectStatus = p.status || 'developing';
                if (projectStatus !== filter) return false;
            }

            // Search
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return p.name.toLowerCase().includes(term) ||
                       p.client?.toLowerCase().includes(term) ||
                       p.projectNumber?.toLowerCase().includes(term);
            }
            return true;
        });

        // Sort
        const dir = sortDir === 'asc' ? 1 : -1;
        result.sort((a, b) => {
            let va, vb;
            switch (sortCol) {
                case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break;
                case 'client': va = (a.client || '').toLowerCase(); vb = (b.client || '').toLowerCase(); break;
                case 'projectNumber': va = (a.projectNumber || '').toLowerCase(); vb = (b.projectNumber || '').toLowerCase(); break;
                case 'status': va = (a.status || ''); vb = (b.status || ''); break;
                case 'material': { const ta = getProjectTotals(a); const tb = getProjectTotals(b); va = ta.cost; vb = tb.cost; break; }
                case 'labor': { const ta = getProjectTotals(a); const tb = getProjectTotals(b); va = ta.labor; vb = tb.labor; break; }
                case 'updatedAt': default: va = a.updatedAt || ''; vb = b.updatedAt || ''; break;
            }
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        return result;
    }, [projects, filter, searchTerm, sortCol, sortDir]);

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu]);

    // Reposition context menu if it overflows the viewport
    useLayoutEffect(() => {
        if (contextMenu && contextMenuRef.current) {
            const el = contextMenuRef.current;
            const rect = el.getBoundingClientRect();
            if (rect.bottom > window.innerHeight - 8) {
                el.style.top = Math.max(8, window.innerHeight - rect.height - 8) + 'px';
            }
            if (rect.right > window.innerWidth - 8) {
                el.style.left = Math.max(8, window.innerWidth - rect.width - 8) + 'px';
            }
        }
    }, [contextMenu]);

    const statusCounts = useMemo(() => {
        const counts = { all: projects.length };
        PIPELINE_STAGES.forEach(s => { if (s.key !== 'all') counts[s.key] = 0; });
        projects.forEach(p => {
            const status = p.status || 'developing';
            if (counts[status] !== undefined) counts[status]++;
        });
        return counts;
    }, [projects]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0f1419' }}>
            {/* Header */}
            <header style={{ ...styles.header, borderBottom: '1px solid #2f3336', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={styles.logo}>
                        <Icons.Layers /> AV Estimator
                        <span style={{ fontSize: '10px', color: '#4a5568', fontWeight: '400', marginLeft: '4px', alignSelf: 'flex-end', marginBottom: '2px' }}>v{APP_VERSION}</span>
                    </div>
                    {onSwitchView && (
                        <nav style={styles.nav}>
                            <button style={styles.navButton(currentView === 'estimating')} onClick={() => onSwitchView('estimating')}>Estimating</button>
                            <button style={styles.navButton(currentView === 'pm')} onClick={() => onSwitchView('pm')}>Project Management</button>
                        </nav>
                    )}
                </div>
                {session && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', color: syncStatus === 'synced' ? '#00ba7c' : syncStatus === 'syncing' ? '#f59e0b' : syncStatus === 'error' ? '#f87171' : '#6e767d' }}>
                            {syncStatus === 'synced' ? '\u2601 Synced' : syncStatus === 'syncing' ? '\u2601 Syncing...' : syncStatus === 'error' ? '\u2601 Sync error' : '\u2601'}
                        </span>
                        <button onClick={onOpenTeam} style={{ background: 'none', border: `1px solid ${team ? '#1d9bf0' : '#30363d'}`, borderRadius: '6px', color: team ? '#1d9bf0' : '#8b98a5', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Icons.Users /> {team ? team.name : 'Team'}
                        </button>
                        <span style={{ fontSize: '13px', color: '#8b98a5' }}>{session.user?.email}</span>
                        <button onClick={onLogout} style={{ background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: '#8b98a5', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>Sign Out</button>
                    </div>
                )}
            </header>

            {/* Main content \u2014 capped at 70% of viewport so the table reads
                comfortably on wide monitors instead of stretching edge to edge. */}
            <div style={{ maxWidth: '70vw', margin: '0 auto', padding: '20px 24px 48px' }}>
                {/* Title row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 2px 0', fontSize: '24px', fontWeight: '700', color: '#e7e9ea' }}>Projects</h1>
                        <p style={{ margin: 0, color: '#6e767d', fontSize: '13px' }}>{`${projects.length} total project${projects.length === 1 ? '' : 's'}`}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={styles.button('secondary')} onClick={onOpenCatalog}>
                            <Icons.Layers /> Catalog
                        </button>
                        <button style={styles.button('primary')} onClick={onCreate}>
                            <Icons.Plus /> New Project
                        </button>
                    </div>
                </div>

                {/* Prominent pipeline strip \u2014 one column per stage, count under label.
                    Selected stage gets a blue underline. No dollar subtitles. */}
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid #2f3336',
                    marginBottom: '16px',
                    overflowX: 'auto',
                }}>
                    {PIPELINE_STAGES.map(stage => {
                        const isActive = filter === stage.key;
                        return (
                            <button
                                key={stage.key}
                                onClick={() => onFilterChange(stage.key)}
                                style={{
                                    flex: '1 1 0',
                                    minWidth: '120px',
                                    padding: '12px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    borderBottom: `3px solid ${isActive ? '#1d9bf0' : 'transparent'}`,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background-color 0.15s, border-color 0.15s',
                                }}
                                onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = '#161b22'; }}
                                onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                <div style={{ fontSize: '11px', fontWeight: '600', color: isActive ? '#1d9bf0' : '#8b98a5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{stage.label}</div>
                                <div style={{ fontSize: '22px', fontWeight: '700', color: isActive ? '#e7e9ea' : '#c9d1d9' }}>{statusCounts[stage.key]}</div>
                            </button>
                        );
                    })}
                </div>

                {/* Search + sort toolbar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="Search projects, clients, project numbers..."
                        style={{ ...styles.input, width: '320px', maxWidth: '100%' }}
                    />
                    <div style={{ fontSize: '12px', color: '#6e767d' }}>
                        Showing {filteredProjects.length} of {projects.length}
                    </div>
                </div>

                {/* Projects table \u2014 separate Name / Client columns, every column
                    width drag-resizable via useFlexibleColumns. */}
                {filteredProjects.length > 0 ? (
                    <div style={{ backgroundColor: '#1a1f26', borderRadius: '12px', border: '1px solid #2f3336', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: projCols.reduce((s, c) => s + c.width, 0) }}>
                                <colgroup>
                                    {projCols.map(col => <col key={col.id} style={{ width: col.width + 'px' }} />)}
                                </colgroup>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #2f3336', backgroundColor: '#161b22' }}>
                                        {projCols.map((col, colIndex) => (
                                            <th
                                                key={col.id}
                                                style={{ ...styles.thResizable, padding: '10px 12px', textAlign: col.id === 'material' || col.id === 'labor' ? 'right' : (col.id === 'status' || col.id === 'actions' ? 'center' : 'left'), fontSize: '11px', color: '#6e767d', fontWeight: '600', textTransform: 'uppercase', cursor: col.fixed ? 'default' : 'pointer', userSelect: 'none', whiteSpace: 'nowrap', letterSpacing: '0.04em' }}
                                                onClick={() => { if (!col.fixed && col.id !== 'actions') handleSort(col.id); }}
                                            >
                                                {col.label}{!col.fixed && col.id !== 'actions' && <SortIcon col={col.id} />}
                                                {!col.fixed && (
                                                    <div
                                                        style={styles.resizeHandle}
                                                        onMouseDown={e => { e.stopPropagation(); startProjResize(colIndex, e); }}
                                                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                    />
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProjects.map(project => {
                                        const totals = getProjectTotals(project);
                                        const status = PROJECT_STATUSES[project.status] || PROJECT_STATUSES.developing;
                                        const checkout = checkouts[project.id];
                                        const updDate = project.updatedAt ? new Date(project.updatedAt) : null;
                                        const isSelected = selectedProjectId === project.id;
                                        const revisions = project.revisions || [];
                                        const isExpanded = expandedRevisions[project.id];
                                        const updatedByEmail = project.updatedBy || '';
                                        const tdBase = { padding: '12px 12px', overflow: 'hidden', textOverflow: 'ellipsis' };
                                        return (
                                            <React.Fragment key={project.id}>
                                            <tr
                                                style={{ borderBottom: '1px solid #2f3336', cursor: 'pointer', transition: 'background-color 0.1s', backgroundColor: isSelected ? '#1d3a5c' : 'transparent' }}
                                                onClick={() => onSelectProject(project.id)}
                                                onDoubleClick={() => onOpen(project.id)}
                                                onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, project }); }}
                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#1e2530'; }}
                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                            >
                                                {projCols.map(col => {
                                                    switch (col.id) {
                                                        case 'name':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, padding: '12px 16px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                                        {revisions.length > 0 && (
                                                                            <span
                                                                                style={{ cursor: 'pointer', display: 'inline-flex', color: '#6e767d', flexShrink: 0, marginTop: '2px' }}
                                                                                onClick={e => { e.stopPropagation(); setExpandedRevisions(prev => ({ ...prev, [project.id]: !prev[project.id] })); }}
                                                                                title={isExpanded ? 'Collapse revisions' : 'Expand revisions'}>
                                                                                {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                                                                            </span>
                                                                        )}
                                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                                            <div style={{ fontWeight: '600', color: '#e7e9ea', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={project.name}>{project.name}</div>
                                                                            {checkout && (
                                                                                <div style={{ fontSize: '11px', color: checkout.userId === session?.user?.id ? '#00ba7c' : '#f59e0b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <Icons.Lock /> {checkout.userId === session?.user?.id ? 'Checked out by you' : `Checked out by ${checkout.email}`}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            );
                                                        case 'client':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, color: '#8b98a5', fontSize: '13px', whiteSpace: 'nowrap' }} title={project.client || ''}>
                                                                    {project.client || '\u2014'}
                                                                </td>
                                                            );
                                                        case 'projectNumber':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, color: '#8b98a5', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                                                    {project.projectNumber || '\u2014'}
                                                                </td>
                                                            );
                                                        case 'material':
                                                            return <td key={col.id} style={{ ...tdBase, textAlign: 'right', color: '#00ba7c', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap' }}>{fmtCost(totals.cost)}</td>;
                                                        case 'labor':
                                                            return <td key={col.id} style={{ ...tdBase, textAlign: 'right', color: '#1d9bf0', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap' }}>{fmtHrs(totals.labor)}</td>;
                                                        case 'status':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, textAlign: 'center' }}>
                                                                    <span style={{ ...styles.badge(''), backgroundColor: status.bg, color: status.color, fontSize: '11px' }}>{status.label}</span>
                                                                </td>
                                                            );
                                                        case 'updatedAt':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                                                                    <div style={{ color: '#e7e9ea', fontSize: '12px' }}>{updDate ? updDate.toLocaleDateString() + ' ' + updDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '\u2014'}</div>
                                                                    {updatedByEmail && <div style={{ color: '#6e767d', fontSize: '11px', marginTop: '2px' }}>by {updatedByEmail}</div>}
                                                                </td>
                                                            );
                                                        case 'actions':
                                                            return (
                                                                <td key={col.id} style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                                    <button
                                                                        style={{ ...styles.iconButton, color: '#8b98a5', padding: '4px 6px' }}
                                                                        onClick={e => {
                                                                            e.stopPropagation();
                                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                                            setContextMenu({ x: rect.right - 200, y: rect.bottom + 4, project });
                                                                        }}
                                                                        title="Project actions">
                                                                        <Icons.MoreHorizontal />
                                                                    </button>
                                                                </td>
                                                            );
                                                        default:
                                                            return <td key={col.id} style={tdBase}></td>;
                                                    }
                                                })}
                                            </tr>
                                            {isExpanded && [...revisions].reverse().map(rev => {
                                                const revDate = rev.createdAt ? new Date(rev.createdAt) : null;
                                                let revCost = null, revLabor = null;
                                                if (rev.snapshot) {
                                                    const revProj = { ...project, locations: rev.snapshot.locations || [], packages: rev.snapshot.packages || project.packages || [] };
                                                    const revTotals = getProjectTotals(revProj);
                                                    revCost = revTotals.cost;
                                                    revLabor = revTotals.labor;
                                                }
                                                return (
                                                    <tr
                                                        key={rev.id}
                                                        style={{ borderBottom: '1px solid #2f3336', backgroundColor: '#151a21', cursor: 'pointer' }}
                                                        onDoubleClick={() => { onOpenRevision(project.id, rev.id); }}
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1a2030'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#151a21'}
                                                    >
                                                        {projCols.map(col => {
                                                            switch (col.id) {
                                                                case 'name':
                                                                    return (
                                                                        <td key={col.id} style={{ padding: '8px 16px 8px 46px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <Icons.RotateCcw />
                                                                                <span style={{ fontWeight: '500', color: '#8b98a5', fontSize: '13px' }}>{rev.label}</span>
                                                                            </div>
                                                                            {rev.notes && <div style={{ color: '#6e767d', fontSize: '11px', marginTop: '2px', paddingLeft: '22px' }}>{rev.notes}</div>}
                                                                        </td>
                                                                    );
                                                                case 'material':
                                                                    return <td key={col.id} style={{ padding: '8px 12px', textAlign: 'right', color: '#00ba7c', fontSize: '12px' }}>{revCost != null ? fmtCost(revCost) : '\u2014'}</td>;
                                                                case 'labor':
                                                                    return <td key={col.id} style={{ padding: '8px 12px', textAlign: 'right', color: '#1d9bf0', fontSize: '12px' }}>{revLabor != null ? fmtHrs(revLabor) : '\u2014'}</td>;
                                                                case 'updatedAt':
                                                                    return (
                                                                        <td key={col.id} style={{ padding: '8px 12px' }}>
                                                                            <div style={{ color: '#6e767d', fontSize: '11px', whiteSpace: 'nowrap' }}>{revDate ? revDate.toLocaleDateString() : '\u2014'}</div>
                                                                            {rev.createdBy && <div style={{ color: '#4a5568', fontSize: '10px' }}>{rev.createdBy}</div>}
                                                                        </td>
                                                                    );
                                                                default:
                                                                    return <td key={col.id} style={{ padding: '8px 12px' }}></td>;
                                                            }
                                                        })}
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
                ) : (
                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'\uD83D\uDCCB'}</div>
                        <h3 style={{ color: '#8b98a5', fontSize: '18px', margin: '0 0 8px 0' }}>
                            {searchTerm ? 'No projects match your search' : 'No projects yet'}
                        </h3>
                        <p style={{ color: '#6e767d', margin: '0 0 20px 0' }}>
                            {searchTerm ? 'Try a different search term' : 'Create your first project to get started'}
                        </p>
                        {!searchTerm && (
                            <button style={styles.button('primary')} onClick={onCreate}>
                                <Icons.Plus /> New Project
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Context menu */}
            {contextMenu && (
                <div ref={contextMenuRef} style={{
                    position: 'fixed',
                    left: contextMenu.x,
                    top: contextMenu.y,
                    backgroundColor: '#1a1f26',
                    border: '1px solid #2f3336',
                    borderRadius: '8px',
                    padding: '4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    minWidth: '180px',
                    maxHeight: 'calc(100vh - 16px)',
                    overflowY: 'auto'
                }}>
                    <button
                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => { onOpen(contextMenu.project.id); setContextMenu(null); }}>
                        <Icons.Layers /> Open Project
                    </button>
                    <button
                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => { onEdit(contextMenu.project); setContextMenu(null); }}>
                        <Icons.Edit /> Edit Project Info
                    </button>
                    <button
                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => { onDuplicate(contextMenu.project.id); setContextMenu(null); }}>
                        <Icons.Duplicate /> Duplicate
                    </button>
                    <button
                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f59e0b' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => { onCreateRevision(contextMenu.project); setContextMenu(null); }}>
                        <Icons.RotateCcw /> Create Revision
                    </button>
                    {(() => {
                        const co = checkouts[contextMenu.project.id];
                        const isOther = co && co.userId !== session?.user?.id;
                        const isAdmin = team && (team.role === 'owner' || team.role === 'admin');
                        if (isOther && isAdmin) return (
                            <button
                                style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f87171' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => { onForceCheckin(contextMenu.project.id); setContextMenu(null); }}>
                                <Icons.Unlock /> Force Check In ({co.email})
                            </button>
                        );
                        return null;
                    })()}
                    <div style={{ borderTop: '1px solid #2f3336', margin: '4px 0' }} />
                    <div style={{ padding: '4px 12px', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase' }}>Set Status</div>
                    {Object.entries(PROJECT_STATUSES).map(([key, val]) => (
                        <button
                            key={key}
                            style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '6px 12px', color: val.color }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => { onUpdateStatus(contextMenu.project.id, key); setContextMenu(null); }}>
                            {val.label}
                        </button>
                    ))}
                    <div style={{ borderTop: '1px solid #2f3336', margin: '4px 0' }} />
                    <button
                        style={{ ...styles.smallButton, width: '100%', justifyContent: 'flex-start', backgroundColor: 'transparent', padding: '8px 12px', color: '#f87171' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        onClick={() => { setConfirmDelete(contextMenu.project); setContextMenu(null); }}>
                        <Icons.Trash /> Delete Project
                    </button>
                </div>
            )}

            {/* Confirm delete modal */}
            {confirmDelete && (
                <div style={styles.modal} onClick={() => setConfirmDelete(null)}>
                    <div style={{ ...styles.modalContent, width: '400px' }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#f87171' }}>Delete Project?</h2>
                        <p style={{ color: '#8b98a5', marginBottom: '20px' }}>
                            Are you sure you want to delete <strong style={{ color: '#e7e9ea' }}>"{confirmDelete.name}"</strong>? This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button style={styles.button('secondary')} onClick={() => setConfirmDelete(null)}>Cancel</button>
                            <button style={styles.button('danger')} onClick={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
