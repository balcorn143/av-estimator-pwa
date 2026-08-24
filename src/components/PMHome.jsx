import React from 'react'
const { useState, useMemo } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { APP_VERSION } from '../config'
import { TASK_PHASE_BUCKETS } from '../constants'
import { summarizeTasks, getCurrentPhaseBucket } from '../utils/pmTasks'
import useFlexibleColumns from '../hooks/useFlexibleColumns'

// PM dashboard table — mirrors ProjectsHome's pipeline strip + sortable
// table so the two views feel like siblings. Only `active` projects are
// listed; the pipeline strip filters by *current phase bucket* (derived from
// each project's task state). Clicking a row drills into the kanban board.

const PM_DASH_COLUMNS = [
    { id: 'name',          label: 'Project',      width: 240 },
    { id: 'client',        label: 'Client',       width: 180 },
    { id: 'projectNumber', label: 'Project #',    width: 120 },
    { id: 'progress',      label: 'Progress',     width: 200 },
    { id: 'blocked',       label: 'Blocked',      width: 90 },
    { id: 'phase',         label: 'Phase',        width: 160 },
    { id: 'updatedAt',     label: 'Last Updated', width: 180 },
    { id: 'actions',       label: '',             width: 48, fixed: true },
];

// Filterable phase pipeline. 'all' is the sentinel "show everything."
const PHASE_PIPELINE = [
    { key: 'all',              label: 'All' },
    { key: 'pre-construction', label: 'Pre-Con' },
    { key: 'procurement',      label: 'Procurement' },
    { key: 'install',          label: 'Install' },
    { key: 'commissioning',    label: 'Commissioning' },
    { key: 'closeout',         label: 'Closeout' },
];

export default function PMHome({ projects, onOpenBoard, currentView, onSwitchView, session, syncStatus, team, onOpenTeam, onLogout }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState('all');
    const [sortCol, setSortCol] = useState('updatedAt');
    const [sortDir, setSortDir] = useState('desc');
    const [selectedId, setSelectedId] = useState(null);

    const { columns: pmCols, startResize: startPmResize } = useFlexibleColumns(PM_DASH_COLUMNS, 'pm-dashboard');

    // Decorate each active project with derived task fields so sorting and
    // filtering don't recompute summaries per row.
    const decorated = useMemo(() => {
        return projects
            .filter(p => p.status === 'active')
            .map(p => {
                const summary = summarizeTasks(p.tasks);
                const phase = getCurrentPhaseBucket(p.tasks);
                const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
                return { project: p, summary, phase, pct };
            });
    }, [projects]);

    // Phase-bucket counts for the pipeline strip — same pattern as
    // ProjectsHome's statusCounts.
    const phaseCounts = useMemo(() => {
        const counts = { all: decorated.length };
        PHASE_PIPELINE.forEach(s => { if (s.key !== 'all') counts[s.key] = 0; });
        decorated.forEach(d => { if (counts[d.phase] !== undefined) counts[d.phase]++; });
        return counts;
    }, [decorated]);

    const handleSort = (col) => {
        if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
        else { setSortCol(col); setSortDir(col === 'name' || col === 'client' || col === 'projectNumber' || col === 'phase' ? 'asc' : 'desc'); }
    };

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <span style={{ color: '#4a5568', marginLeft: '4px' }}>{'⇅'}</span>;
        return <span style={{ color: '#1d9bf0', marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    const filteredRows = useMemo(() => {
        let result = decorated.filter(d => {
            if (filter !== 'all' && d.phase !== filter) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const p = d.project;
                return p.name.toLowerCase().includes(term) ||
                       p.client?.toLowerCase().includes(term) ||
                       p.projectNumber?.toLowerCase().includes(term);
            }
            return true;
        });
        const dir = sortDir === 'asc' ? 1 : -1;
        result.sort((a, b) => {
            const pa = a.project, pb = b.project;
            let va, vb;
            switch (sortCol) {
                case 'name': va = (pa.name || '').toLowerCase(); vb = (pb.name || '').toLowerCase(); break;
                case 'client': va = (pa.client || '').toLowerCase(); vb = (pb.client || '').toLowerCase(); break;
                case 'projectNumber': va = (pa.projectNumber || '').toLowerCase(); vb = (pb.projectNumber || '').toLowerCase(); break;
                case 'progress': va = a.pct; vb = b.pct; break;
                case 'blocked': va = a.summary.blocked; vb = b.summary.blocked; break;
                case 'phase': va = a.phase || ''; vb = b.phase || ''; break;
                case 'updatedAt': default: va = pa.updatedAt || ''; vb = pb.updatedAt || ''; break;
            }
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        return result;
    }, [decorated, filter, searchTerm, sortCol, sortDir]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0f1419' }}>
            <header style={{ ...styles.header, borderBottom: '1px solid #2f3336', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={styles.logo}>
                        <Icons.Layers /> AV Estimator
                        <span style={{ fontSize: '10px', color: '#4a5568', fontWeight: '400', marginLeft: '4px', alignSelf: 'flex-end', marginBottom: '2px' }}>v{APP_VERSION}</span>
                    </div>
                    <nav style={styles.nav}>
                        <button style={styles.navButton(currentView === 'estimating')} onClick={() => onSwitchView('estimating')}>Estimating</button>
                        <button style={styles.navButton(currentView === 'pm')} onClick={() => onSwitchView('pm')}>Project Management</button>
                    </nav>
                </div>
                {session && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', color: syncStatus === 'synced' ? '#00ba7c' : syncStatus === 'syncing' ? '#f59e0b' : syncStatus === 'error' ? '#f87171' : '#6e767d' }}>
                            {syncStatus === 'synced' ? '☁ Synced' : syncStatus === 'syncing' ? '☁ Syncing...' : syncStatus === 'error' ? '☁ Sync error' : '☁'}
                        </span>
                        <button onClick={onOpenTeam} style={{ background: 'none', border: `1px solid ${team ? '#1d9bf0' : '#30363d'}`, borderRadius: '6px', color: team ? '#1d9bf0' : '#8b98a5', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Icons.Users /> {team ? team.name : 'Team'}
                        </button>
                        <span style={{ fontSize: '13px', color: '#8b98a5' }}>{session.user?.email}</span>
                        <button onClick={onLogout} style={{ background: 'none', border: '1px solid #30363d', borderRadius: '6px', color: '#8b98a5', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>Sign Out</button>
                    </div>
                )}
            </header>

            <div style={{ maxWidth: '70vw', margin: '0 auto', padding: '20px 24px 48px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 2px 0', fontSize: '24px', fontWeight: '700', color: '#e7e9ea' }}>Project Management</h1>
                        <p style={{ margin: 0, color: '#6e767d', fontSize: '13px' }}>{decorated.length} active project{decorated.length === 1 ? '' : 's'}</p>
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid #2f3336',
                    marginBottom: '16px',
                    overflowX: 'auto',
                }}>
                    {PHASE_PIPELINE.map(stage => {
                        const isActive = filter === stage.key;
                        return (
                            <button
                                key={stage.key}
                                onClick={() => setFilter(stage.key)}
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
                                <div style={{ fontSize: '22px', fontWeight: '700', color: isActive ? '#e7e9ea' : '#c9d1d9' }}>{phaseCounts[stage.key]}</div>
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search projects, clients, project numbers..."
                        style={{ ...styles.input, width: '320px', maxWidth: '100%' }}
                    />
                    <div style={{ fontSize: '12px', color: '#6e767d' }}>
                        Showing {filteredRows.length} of {decorated.length}
                    </div>
                </div>

                {filteredRows.length > 0 ? (
                    <div style={{ backgroundColor: '#1a1f26', borderRadius: '12px', border: '1px solid #2f3336', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: pmCols.reduce((s, c) => s + c.width, 0) }}>
                                <colgroup>
                                    {pmCols.map(col => <col key={col.id} style={{ width: col.width + 'px' }} />)}
                                </colgroup>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #2f3336', backgroundColor: '#161b22' }}>
                                        {pmCols.map((col, colIndex) => (
                                            <th
                                                key={col.id}
                                                style={{ ...styles.thResizable, padding: '10px 12px', textAlign: col.id === 'blocked' ? 'right' : (col.id === 'actions' ? 'center' : 'left'), fontSize: '11px', color: '#6e767d', fontWeight: '600', textTransform: 'uppercase', cursor: col.fixed ? 'default' : 'pointer', userSelect: 'none', whiteSpace: 'nowrap', letterSpacing: '0.04em' }}
                                                onClick={() => { if (!col.fixed && col.id !== 'actions') handleSort(col.id); }}
                                            >
                                                {col.label}{!col.fixed && col.id !== 'actions' && <SortIcon col={col.id} />}
                                                {!col.fixed && (
                                                    <div
                                                        style={styles.resizeHandle}
                                                        onMouseDown={e => { e.stopPropagation(); startPmResize(colIndex, e); }}
                                                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = '#1d9bf0'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = '#4a5568'; }}
                                                    />
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.map(({ project, summary, phase, pct }) => {
                                        const phaseMeta = TASK_PHASE_BUCKETS[phase] || TASK_PHASE_BUCKETS['pre-construction'];
                                        const updDate = project.updatedAt ? new Date(project.updatedAt) : null;
                                        const isSelected = selectedId === project.id;
                                        const tdBase = { padding: '12px 12px', overflow: 'hidden', textOverflow: 'ellipsis' };
                                        return (
                                            <tr
                                                key={project.id}
                                                style={{ borderBottom: '1px solid #2f3336', cursor: 'pointer', transition: 'background-color 0.1s', backgroundColor: isSelected ? '#1d3a5c' : 'transparent' }}
                                                onClick={() => setSelectedId(project.id)}
                                                onDoubleClick={() => onOpenBoard(project.id)}
                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#1e2530'; }}
                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                            >
                                                {pmCols.map(col => {
                                                    switch (col.id) {
                                                        case 'name':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, padding: '12px 16px' }}>
                                                                    <div style={{ fontWeight: '600', color: '#e7e9ea', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={project.name}>{project.name}</div>
                                                                </td>
                                                            );
                                                        case 'client':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, color: '#8b98a5', fontSize: '13px', whiteSpace: 'nowrap' }} title={project.client || ''}>
                                                                    {project.client || '—'}
                                                                </td>
                                                            );
                                                        case 'projectNumber':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, color: '#8b98a5', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                                                    {project.projectNumber || '—'}
                                                                </td>
                                                            );
                                                        case 'progress':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                                                                    {summary.total > 0 ? (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                            <div style={{ flex: 1, height: '6px', backgroundColor: '#0f1419', borderRadius: '3px', overflow: 'hidden', minWidth: '60px' }}>
                                                                                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#00ba7c', transition: 'width 0.2s' }} />
                                                                            </div>
                                                                            <span style={{ color: '#8b98a5', fontSize: '12px', whiteSpace: 'nowrap' }}>{summary.done}/{summary.total}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span style={{ color: '#6e767d', fontSize: '12px', fontStyle: 'italic' }}>No tasks</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        case 'blocked':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                    {summary.blocked > 0 ? (
                                                                        <span style={{ color: '#f87171', fontWeight: '600', fontSize: '13px' }}>{summary.blocked}</span>
                                                                    ) : (
                                                                        <span style={{ color: '#4a5568', fontSize: '13px' }}>—</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        case 'phase':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                                                                    <span style={{ ...styles.badge(''), backgroundColor: phaseMeta.bg, color: phaseMeta.color, fontSize: '11px' }}>{phaseMeta.label}</span>
                                                                </td>
                                                            );
                                                        case 'updatedAt':
                                                            return (
                                                                <td key={col.id} style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                                                                    <div style={{ color: '#e7e9ea', fontSize: '12px' }}>{updDate ? updDate.toLocaleDateString() + ' ' + updDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                                                                    {project.updatedBy && <div style={{ color: '#6e767d', fontSize: '11px', marginTop: '2px' }}>by {project.updatedBy}</div>}
                                                                </td>
                                                            );
                                                        case 'actions':
                                                            return (
                                                                <td key={col.id} style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                                    <button
                                                                        style={{ ...styles.iconButton, color: '#8b98a5', padding: '4px 6px' }}
                                                                        onClick={e => { e.stopPropagation(); onOpenBoard(project.id); }}
                                                                        title="Open board"
                                                                    >
                                                                        <Icons.ChevronRight />
                                                                    </button>
                                                                </td>
                                                            );
                                                        default:
                                                            return <td key={col.id} style={tdBase}></td>;
                                                    }
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'📂'}</div>
                        <h3 style={{ color: '#8b98a5', fontSize: '18px', margin: '0 0 8px 0' }}>
                            {searchTerm ? 'No projects match your search' : decorated.length === 0 ? 'No active projects' : 'No projects in this phase'}
                        </h3>
                        <p style={{ color: '#6e767d', margin: '0 0 20px 0' }}>
                            {decorated.length === 0
                                ? <>Set a project's status to <strong style={{ color: '#1d9bf0' }}>Active</strong> from Estimating to start tracking it here.</>
                                : 'Try a different filter or search term'}
                        </p>
                        {decorated.length === 0 && (
                            <button style={styles.button('secondary')} onClick={() => onSwitchView('estimating')}>
                                Go to Estimating
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
