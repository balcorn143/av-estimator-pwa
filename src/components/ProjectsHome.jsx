import React from 'react'
const { useState, useEffect, useMemo } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { PROJECT_STATUSES } from '../constants'
import { APP_VERSION } from '../config'
import { fmtCost, fmtHrs } from '../utils/formatters'

export default function ProjectsHome({ projects, onOpen, onCreate, onOpenCatalog, onOpenTeam, team, checkouts, onEdit, onDuplicate, onDelete, onUpdateStatus, onCreateRevision, getProjectTotals, searchTerm, onSearchChange, filter, onFilterChange, session, syncStatus, onLogout }) {
    const [contextMenu, setContextMenu] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [sortCol, setSortCol] = useState('updatedAt');
    const [sortDir, setSortDir] = useState('desc');

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
            // Status filter
            if (filter === 'active' && (p.status === 'archived' || p.status === 'completed' || p.status === 'lost')) return false;
            if (filter === 'submitted' && p.status !== 'proposal-submitted') return false;
            if (filter === 'completed' && p.status !== 'completed') return false;
            if (filter === 'lost' && p.status !== 'lost') return false;
            if (filter === 'archived' && p.status !== 'archived') return false;

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

    const statusCounts = useMemo(() => {
        const counts = { all: projects.length, active: 0, submitted: 0, completed: 0, lost: 0, archived: 0 };
        projects.forEach(p => {
            if (p.status === 'archived') counts.archived++;
            else if (p.status === 'lost') counts.lost++;
            else if (p.status === 'completed') counts.completed++;
            if (p.status === 'proposal-submitted') counts.submitted++;
            if (p.status !== 'archived' && p.status !== 'completed' && p.status !== 'lost') counts.active++;
        });
        return counts;
    }, [projects]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0f1419' }}>
            {/* Header */}
            <header style={{ ...styles.header, borderBottom: '1px solid #2f3336', justifyContent: 'space-between' }}>
                <div style={styles.logo}>
                    <Icons.Layers /> AV Estimator
                    <span style={{ fontSize: '10px', color: '#4a5568', fontWeight: '400', marginLeft: '4px', alignSelf: 'flex-end', marginBottom: '2px' }}>v{APP_VERSION}</span>
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

            {/* Main content */}
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
                {/* Title and actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px 0', fontSize: '28px', fontWeight: '700', color: '#e7e9ea' }}>Projects</h1>
                        <p style={{ margin: 0, color: '#6e767d', fontSize: '14px' }}>{projects.length} total projects</p>
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

                {/* Filters and search */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1a1f26', borderRadius: '8px', padding: '4px' }}>
                        {[
                            { key: 'active', label: 'Active' },
                            { key: 'submitted', label: 'Submitted' },
                            { key: 'completed', label: 'Completed' },
                            { key: 'lost', label: 'Lost' },
                            { key: 'archived', label: 'Archived' },
                            { key: 'all', label: 'All' },
                        ].map(f => (
                            <button
                                key={f.key}
                                style={{
                                    ...styles.smallButton,
                                    backgroundColor: filter === f.key ? '#2f3336' : 'transparent',
                                    color: filter === f.key ? '#e7e9ea' : '#6e767d'
                                }}
                                onClick={() => onFilterChange(f.key)}>
                                {f.label} ({statusCounts[f.key]})
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="Search projects..."
                        style={{ ...styles.input, width: '250px' }}
                    />
                </div>

                {/* Projects table */}
                {filteredProjects.length > 0 ? (
                    <div style={{ backgroundColor: '#1a1f26', borderRadius: '12px', border: '1px solid #2f3336', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #2f3336' }}>
                                    {[
                                        { id: 'name', label: 'Project', align: 'left', pad: '10px 16px' },
                                        { id: 'client', label: 'Client', align: 'left' },
                                        { id: 'projectNumber', label: 'Project #', align: 'left' },
                                        { id: 'status', label: 'Status', align: 'center' },
                                        { id: 'material', label: 'Material', align: 'right' },
                                        { id: 'labor', label: 'Labor', align: 'right' },
                                        { id: 'updatedAt', label: 'Last Updated', align: 'left' },
                                    ].map(col => (
                                        <th
                                            key={col.id}
                                            style={{ padding: col.pad || '10px 12px', textAlign: col.align, fontSize: '11px', color: '#6e767d', fontWeight: '600', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                                            onClick={() => handleSort(col.id)}
                                        >
                                            {col.label}<SortIcon col={col.id} />
                                        </th>
                                    ))}
                                    <th style={{ padding: '10px 12px', width: '40px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProjects.map(project => {
                                    const totals = getProjectTotals(project);
                                    const status = PROJECT_STATUSES[project.status] || PROJECT_STATUSES.developing;
                                    const checkout = checkouts[project.id];
                                    const updDate = project.updatedAt ? new Date(project.updatedAt) : null;
                                    return (
                                        <tr
                                            key={project.id}
                                            style={{ borderBottom: '1px solid #2f3336', cursor: 'pointer', transition: 'background-color 0.1s' }}
                                            onClick={() => onOpen(project.id)}
                                            onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, project }); }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e2530'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontWeight: '600', color: '#e7e9ea', fontSize: '14px' }}>{project.name}</div>
                                                {checkout && (
                                                    <div style={{ fontSize: '11px', color: checkout.userId === session?.user?.id ? '#00ba7c' : '#f59e0b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Icons.Lock /> {checkout.userId === session?.user?.id ? 'Checked out by you' : `Checked out by ${checkout.email}`}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 12px', color: '#8b98a5', fontSize: '13px' }}>{project.client || '\u2014'}</td>
                                            <td style={{ padding: '12px 12px', color: '#8b98a5', fontSize: '13px' }}>{project.projectNumber || '\u2014'}</td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                <span style={{ ...styles.badge(''), backgroundColor: status.bg, color: status.color, fontSize: '11px' }}>{status.label}</span>
                                            </td>
                                            <td style={{ padding: '12px 12px', textAlign: 'right', color: '#00ba7c', fontWeight: '600', fontSize: '13px' }}>{fmtCost(totals.cost)}</td>
                                            <td style={{ padding: '12px 12px', textAlign: 'right', color: '#1d9bf0', fontWeight: '600', fontSize: '13px' }}>{fmtHrs(totals.labor)}</td>
                                            <td style={{ padding: '12px 12px' }}>
                                                <div style={{ color: '#e7e9ea', fontSize: '12px', whiteSpace: 'nowrap' }}>{updDate ? updDate.toLocaleDateString() + ' ' + updDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '\u2014'}</div>
                                                {project.updatedBy && <div style={{ color: '#6e767d', fontSize: '11px', marginTop: '1px' }}>{project.updatedBy}</div>}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                <button
                                                    style={{ ...styles.iconButton, color: '#6e767d', padding: '4px' }}
                                                    onClick={e => { e.stopPropagation(); onEdit(project); }}
                                                    title="Edit project info">
                                                    <Icons.Edit />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
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
