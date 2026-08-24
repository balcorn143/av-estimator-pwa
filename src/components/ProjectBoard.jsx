import React from 'react'
const { useState, useMemo, useRef } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { APP_VERSION } from '../config'
import { TASK_STATUSES, TASK_STATUS_ORDER, TASK_PHASE_BUCKETS } from '../constants'
import { groupTasksByStatus, summarizeTasks, makeBlankTask } from '../utils/pmTasks'
import ProcurementTab from './ProcurementTab'
import FieldLogTab from './FieldLogTab'
import PunchListTab from './PunchListTab'
import ChangeOrdersTab from './ChangeOrdersTab'

// Top-level PM detail view for a single project. Hosts the kanban (Tasks) plus
// the tier-2 PM sections (Procurement / Field Log / Punch List / Change Orders)
// behind a tab strip. All section state lives inline on the project object —
// each tab calls onPatchProject({ <field>: nextValue }) to write.
const PROJECT_TABS = [
    { key: 'fieldLog',      label: 'Notes' },
    { key: 'tasks',         label: 'Tasks' },
    { key: 'procurement',   label: 'Procurement' },
    { key: 'punchList',     label: 'Punch List' },
    { key: 'changeOrders',  label: 'Change Orders' },
];

export default function ProjectBoard({ project, onPatchProject, onEditProject, catalogPackages, onBack, currentView, onSwitchView, session, syncStatus, team, onOpenTeam, onLogout }) {
    const [tab, setTab] = useState('fieldLog');
    const [editingTask, setEditingTask] = useState(null);
    const [draggingId, setDraggingId] = useState(null);
    const [dragOverCol, setDragOverCol] = useState(null);

    const tasks = project?.tasks || [];
    const groups = useMemo(() => groupTasksByStatus(tasks), [tasks]);
    const summary = useMemo(() => summarizeTasks(tasks), [tasks]);

    // --- Task mutations -----------------------------------------------------

    const patchTasks = (newTasks) => onPatchProject({ tasks: newTasks });

    const updateTask = (id, patch) => {
        patchTasks(tasks.map(t => {
            if (t.id !== id) return t;
            const next = { ...t, ...patch };
            if (patch.status === 'done' && t.status !== 'done') next.completedAt = new Date().toISOString();
            if (patch.status && patch.status !== 'done') next.completedAt = null;
            return next;
        }));
    };

    const deleteTask = (id) => {
        patchTasks(tasks.filter(t => t.id !== id));
        setEditingTask(null);
    };

    const addTaskToColumn = (status) => {
        const maxOrder = (groups[status] || []).reduce((m, t) => Math.max(m, t.order ?? 0), -1);
        const t = makeBlankTask({ status, order: maxOrder + 1 });
        patchTasks([...tasks, t]);
        setEditingTask(t);
    };

    // --- Drag and drop ------------------------------------------------------

    const onDragStartCard = (e, taskId) => {
        setDraggingId(taskId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', taskId);
    };
    const onDragEndCard = () => {
        setDraggingId(null);
        setDragOverCol(null);
    };
    const onDragOverCol = (e, colKey) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCol !== colKey) setDragOverCol(colKey);
    };
    const onDropCol = (e, colKey) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || draggingId;
        setDraggingId(null);
        setDragOverCol(null);
        if (!id) return;
        const task = tasks.find(t => t.id === id);
        if (!task || task.status === colKey) return;
        const maxOrder = (groups[colKey] || []).reduce((m, t) => Math.max(m, t.order ?? 0), -1);
        updateTask(id, { status: colKey, order: maxOrder + 1 });
    };

    // --- Render -------------------------------------------------------------

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0f1419', display: 'flex', flexDirection: 'column' }}>
            <header style={{ ...styles.header, justifyContent: 'space-between' }}>
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

            {/* Centered content wrapper — caps width so on wide monitors the
                eye doesn't have to scan from one edge to the other. Inner
                sections keep their own horizontal padding inside this. */}
            <div style={{ width: '100%', maxWidth: '1100px', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>

            <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <button
                        onClick={onBack}
                        style={{ ...styles.iconButton, color: '#8b98a5', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}
                        title="Back to PM dashboard"
                    >
                        <Icons.ChevronLeft /> Back
                    </button>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#e7e9ea', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={project?.name}>{project?.name || 'Project'}</h1>
                            {onEditProject && (
                                <button
                                    onClick={() => onEditProject(project)}
                                    style={{ background: 'none', border: '1px solid #2f3336', borderRadius: '6px', color: '#8b98a5', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#1d9bf0'; e.currentTarget.style.borderColor = '#1d9bf0'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = '#8b98a5'; e.currentTarget.style.borderColor = '#2f3336'; }}
                                    title="Edit project info"
                                >
                                    <Icons.Edit /> Edit Info
                                </button>
                            )}
                        </div>
                        <div style={{ color: '#8b98a5', fontSize: '12px', marginTop: '2px' }}>
                            {project?.client || '—'}{project?.projectNumber ? ` · ${project.projectNumber}` : ''}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {tab === 'tasks' && (
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#8b98a5' }}>
                            <span><strong style={{ color: '#e7e9ea' }}>{summary.done}</strong> / {summary.total} done</span>
                            <span style={{ color: '#1d9bf0' }}>{summary.inProgress} in progress</span>
                            {summary.blocked > 0 && <span style={{ color: '#f87171' }}>{summary.blocked} blocked</span>}
                        </div>
                    )}
                </div>
            </div>

            <ProjectInfoCard project={project} onEdit={onEditProject} />

            {/* Tab nav — section toggle for PM detail panels */}
            <div style={{ margin: '14px 24px 0', borderBottom: '1px solid #2f3336', display: 'flex', gap: '4px', overflowX: 'auto' }}>
                {PROJECT_TABS.map(t => {
                    const isActive = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            style={{
                                padding: '10px 16px',
                                border: 'none',
                                background: 'transparent',
                                color: isActive ? '#1d9bf0' : '#8b98a5',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                borderBottom: `3px solid ${isActive ? '#1d9bf0' : 'transparent'}`,
                                marginBottom: '-1px',
                                whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#e7e9ea'; }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#8b98a5'; }}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {tab !== 'tasks' && (
                <div style={{ flex: 1, padding: '16px 24px 24px', overflowY: 'auto' }}>
                    {tab === 'procurement' && <ProcurementTab project={project} catalogPackages={catalogPackages} onPatchProject={onPatchProject} />}
                    {tab === 'fieldLog' && <FieldLogTab project={project} onPatchProject={onPatchProject} session={session} />}
                    {tab === 'punchList' && <PunchListTab project={project} onPatchProject={onPatchProject} />}
                    {tab === 'changeOrders' && <ChangeOrdersTab project={project} onPatchProject={onPatchProject} />}
                </div>
            )}

            {tab === 'tasks' && (
            <div style={{ flex: 1, padding: '16px 24px 24px', display: 'flex', gap: '16px', overflowX: 'auto', alignItems: 'stretch' }}>
                {TASK_STATUS_ORDER.map(colKey => {
                    const col = TASK_STATUSES[colKey];
                    const colTasks = groups[colKey] || [];
                    const isHover = dragOverCol === colKey;
                    return (
                        <div
                            key={colKey}
                            onDragOver={e => onDragOverCol(e, colKey)}
                            onDragLeave={() => { if (dragOverCol === colKey) setDragOverCol(null); }}
                            onDrop={e => onDropCol(e, colKey)}
                            style={{
                                flex: '1 1 0',
                                minWidth: '260px',
                                backgroundColor: '#151a21',
                                borderRadius: '12px',
                                border: `1px solid ${isHover ? '#1d9bf0' : '#2f3336'}`,
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'border-color 0.15s, background-color 0.15s',
                                backgroundImage: isHover ? 'linear-gradient(180deg, rgba(29,155,240,0.04), rgba(29,155,240,0))' : 'none',
                            }}
                        >
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid #2f3336', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col.color, display: 'inline-block' }} />
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#e7e9ea', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col.label}</span>
                                    <span style={{ fontSize: '12px', color: '#6e767d' }}>{colTasks.length}</span>
                                </div>
                                <button
                                    onClick={() => addTaskToColumn(colKey)}
                                    style={{ ...styles.iconButton, color: '#8b98a5', padding: '4px' }}
                                    title="Add task to this column"
                                >
                                    <Icons.Plus />
                                </button>
                            </div>
                            <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', minHeight: '120px' }}>
                                {colTasks.map(task => {
                                    const phase = TASK_PHASE_BUCKETS[task.phaseBucket] || TASK_PHASE_BUCKETS['pre-construction'];
                                    const isDragging = draggingId === task.id;
                                    return (
                                        <div
                                            key={task.id}
                                            draggable
                                            onDragStart={e => onDragStartCard(e, task.id)}
                                            onDragEnd={onDragEndCard}
                                            onClick={() => setEditingTask(task)}
                                            style={{
                                                backgroundColor: '#1a1f26',
                                                border: '1px solid #2f3336',
                                                borderRadius: '8px',
                                                padding: '10px 12px',
                                                cursor: 'grab',
                                                opacity: isDragging ? 0.4 : 1,
                                                transition: 'opacity 0.15s, border-color 0.15s, background-color 0.15s',
                                            }}
                                            onMouseEnter={e => { if (!isDragging) { e.currentTarget.style.borderColor = '#1d9bf0'; e.currentTarget.style.backgroundColor = '#1e2530'; } }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2f3336'; e.currentTarget.style.backgroundColor = '#1a1f26'; }}
                                        >
                                            <div style={{ fontSize: '13px', color: '#e7e9ea', fontWeight: '500', marginBottom: '8px', lineHeight: '1.35' }}>
                                                {task.title || <span style={{ color: '#6e767d', fontStyle: 'italic' }}>Untitled task</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ ...styles.badge(''), backgroundColor: phase.bg, color: phase.color, fontSize: '10px', padding: '2px 8px' }}>{phase.label}</span>
                                                {task.assignee && (
                                                    <span style={{ fontSize: '11px', color: '#8b98a5' }}>{task.assignee}</span>
                                                )}
                                                {task.dueDate && (
                                                    <span style={{ fontSize: '11px', color: isOverdue(task) ? '#f87171' : '#8b98a5', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <Icons.Clock /> {formatDueDate(task.dueDate)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {colTasks.length === 0 && (
                                    <button
                                        onClick={() => addTaskToColumn(colKey)}
                                        style={{ background: 'none', border: '1px dashed #2f3336', color: '#6e767d', padding: '14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', textAlign: 'center' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#8b98a5'; e.currentTarget.style.borderColor = '#3d4450'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#6e767d'; e.currentTarget.style.borderColor = '#2f3336'; }}
                                    >
                                        + Add task
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            )}

            </div>

            {editingTask && (
                <TaskEditModal
                    task={editingTask}
                    onSave={patch => { updateTask(editingTask.id, patch); setEditingTask(null); }}
                    onDelete={() => deleteTask(editingTask.id)}
                    onClose={() => setEditingTask(null)}
                />
            )}
        </div>
    );
}

// --- ProjectInfoCard ---------------------------------------------------------
// Project info banner — compact definition-list style. Each field is a row
// of `LABEL  value · value · value` so the whole block stays one cell wide
// and reads like a metadata header rather than a dashboard of mini-cards.
// Missing fields collapse to a single muted "Not set" so the height tracks
// what's actually filled in.

function ProjectInfoCard({ project, onEdit }) {
    const pc = project?.primaryContact || {};
    const sa = project?.siteAddress || {};
    const stakeholders = Array.isArray(project?.stakeholders) ? project.stakeholders : [];
    const hasContact = !!(pc.name || pc.email || pc.phone);
    const hasAddress = !!(sa.line1 || sa.city);
    const cityLine = [sa.city, sa.state, sa.zip].filter(Boolean).length > 0
        ? `${sa.city || ''}${sa.state ? `, ${sa.state}` : ''}${sa.zip ? ` ${sa.zip}` : ''}`
        : '';
    const addressOneLine = [sa.line1, sa.line2, cityLine].filter(Boolean).join(' · ');

    const dateBits = [
        { label: 'Contract', value: formatShortDate(project?.contractDate) },
        { label: 'Install', value: formatRange(project?.installStart, project?.installEnd) || formatShortDate(project?.installStart) || formatShortDate(project?.installEnd) },
        { label: 'Target', value: formatShortDate(project?.dueDate), highlight: true },
    ].filter(c => c.value);
    const targetCountdown = daysUntil(project?.dueDate);

    const hasAnyContent = hasContact || hasAddress || dateBits.length > 0 || stakeholders.length > 0;

    return (
        <div style={{ margin: '12px 24px 0', backgroundColor: '#151a21', border: '1px solid #2f3336', borderRadius: '8px', padding: '4px 14px' }}>
            <InfoRow label="Contact">
                {hasContact ? (
                    <>
                        <strong style={{ color: '#e7e9ea' }}>{pc.name || '—'}</strong>
                        {pc.role && <span style={{ color: '#8b98a5' }}>{` · ${pc.role}`}</span>}
                        {pc.phone && <span>{` · ${pc.phone}`}</span>}
                        {pc.email && <span>{` · ${pc.email}`}</span>}
                    </>
                ) : <Missing />}
            </InfoRow>

            <InfoRow label="Site">
                {hasAddress ? addressOneLine : <Missing />}
            </InfoRow>

            <InfoRow label="Schedule">
                {dateBits.length > 0 ? (
                    <>
                        {dateBits.map((c, i) => (
                            <span key={c.label}>
                                {i > 0 && <span style={{ color: '#4a5568' }}>{' · '}</span>}
                                <span style={{ color: '#6e767d' }}>{c.label} </span>
                                <span style={{ color: c.highlight ? '#1d9bf0' : '#e7e9ea', fontWeight: '500' }}>{c.value}</span>
                            </span>
                        ))}
                        {targetCountdown && (
                            <span style={{
                                marginLeft: '10px',
                                fontSize: '11px',
                                padding: '1px 8px',
                                borderRadius: '10px',
                                backgroundColor: targetCountdown.overdue ? '#3d1a1a' : targetCountdown.soon ? '#3d2e1a' : '#1d3a5c',
                                color: targetCountdown.overdue ? '#f87171' : targetCountdown.soon ? '#f59e0b' : '#1d9bf0',
                                fontWeight: '600',
                                verticalAlign: 'middle',
                            }}>
                                {targetCountdown.label}
                            </span>
                        )}
                    </>
                ) : <Missing />}
            </InfoRow>

            {stakeholders.length > 0 && (
                <InfoRow label="Team">
                    {stakeholders.map((s, i) => {
                        const display = s.name || s.email || s.role || 'Unnamed';
                        const tooltipParts = [s.role, s.name, s.email, s.phone].filter(Boolean);
                        return (
                            <span key={s.id} title={tooltipParts.join(' · ')}>
                                {i > 0 && <span style={{ color: '#4a5568' }}>{' · '}</span>}
                                {s.role && <span style={{ color: '#6e767d' }}>{s.role}: </span>}
                                <span style={{ color: '#e7e9ea' }}>{display}</span>
                            </span>
                        );
                    })}
                </InfoRow>
            )}

            {!hasAnyContent && (
                <div style={{ padding: '8px 0', color: '#6e767d', fontSize: '12px', fontStyle: 'italic' }}>
                    Project info not filled in yet — <button onClick={() => onEdit && onEdit(project)} style={{ background: 'none', border: 'none', color: '#1d9bf0', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>add contact, address, dates</button>
                </div>
            )}
        </div>
    );
}

// One row in the project-info definition list. Label on the left in a fixed
// column, value flows freely to the right.
function InfoRow({ label, children }) {
    return (
        <div style={{ display: 'flex', gap: '14px', padding: '4px 0', alignItems: 'baseline', fontSize: '13px', lineHeight: '1.5' }}>
            <span style={{ width: '64px', fontSize: '10px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', flexShrink: 0, paddingTop: '2px' }}>{label}</span>
            <span style={{ flex: 1, color: '#c9d1d9', minWidth: 0 }}>{children}</span>
        </div>
    );
}

function Missing() {
    return <span style={{ color: '#6e767d', fontStyle: 'italic' }}>Not set</span>;
}

function formatShortDate(iso) {
    const d = parseDate(iso);
    if (!d) return null;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRange(startIso, endIso) {
    if (!startIso || !endIso) return null;
    const s = parseDate(startIso);
    const e = parseDate(endIso);
    if (!s || !e) return null;
    return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function parseDate(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(iso) {
    const d = parseDate(iso);
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
    if (diff === 0) return { label: 'Due today', soon: true };
    if (diff <= 7) return { label: `${diff}d left`, soon: true };
    return { label: `${diff}d left` };
}

// --- TaskEditModal -----------------------------------------------------------

function TaskEditModal({ task, onSave, onDelete, onClose }) {
    const [form, setForm] = useState({
        title: task.title || '',
        phaseBucket: task.phaseBucket || 'pre-construction',
        status: task.status || 'todo',
        assignee: task.assignee || '',
        dueDate: task.dueDate || '',
        notes: task.notes || '',
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const titleRef = useRef(null);

    React.useEffect(() => {
        if (titleRef.current) titleRef.current.focus();
    }, []);

    const submit = () => {
        onSave({
            title: form.title.trim(),
            phaseBucket: form.phaseBucket,
            status: form.status,
            assignee: form.assignee.trim(),
            dueDate: form.dueDate || null,
            notes: form.notes,
        });
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '520px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Edit Task</h2>
                    <button style={styles.iconButton} onClick={onClose}><Icons.X /></button>
                </div>

                <label style={{ display: 'block', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Title</label>
                <input
                    ref={titleRef}
                    type="text"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    placeholder="Task title"
                    style={styles.input}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Status</label>
                        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={styles.input}>
                            {TASK_STATUS_ORDER.map(k => <option key={k} value={k}>{TASK_STATUSES[k].label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Phase</label>
                        <select value={form.phaseBucket} onChange={e => setForm({ ...form, phaseBucket: e.target.value })} style={styles.input}>
                            {Object.entries(TASK_PHASE_BUCKETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Assignee</label>
                        <input
                            type="text"
                            value={form.assignee}
                            onChange={e => setForm({ ...form, assignee: e.target.value })}
                            placeholder="Name or email"
                            style={styles.input}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Due Date</label>
                        <input
                            type="date"
                            value={form.dueDate}
                            onChange={e => setForm({ ...form, dueDate: e.target.value })}
                            style={styles.input}
                        />
                    </div>
                </div>

                <label style={{ display: 'block', fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', marginTop: '12px' }}>Notes</label>
                <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Optional notes"
                    style={{ ...styles.textarea, minHeight: '80px' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                    {!confirmDelete ? (
                        <button
                            style={{ ...styles.smallButton, backgroundColor: 'transparent', color: '#f87171', padding: '8px 12px' }}
                            onClick={() => setConfirmDelete(true)}
                        >
                            <Icons.Trash /> Delete
                        </button>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#f87171', fontSize: '12px' }}>Delete this task?</span>
                            <button style={{ ...styles.smallButton, backgroundColor: '#dc2626', color: '#fff' }} onClick={onDelete}>Yes</button>
                            <button style={{ ...styles.smallButton }} onClick={() => setConfirmDelete(false)}>Cancel</button>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                        <button style={styles.button('primary')} onClick={submit}>Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Helpers ----------------------------------------------------------------

function formatDueDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isOverdue(task) {
    if (!task.dueDate) return false;
    if (task.status === 'done') return false;
    const d = new Date(task.dueDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
}
