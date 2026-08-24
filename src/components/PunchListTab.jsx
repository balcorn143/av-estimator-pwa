import React from 'react'
const { useState, useMemo } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { getAllLocationsFlatted } from '../utils/locations'

// PM punch list. One row per item; each item links back to a location from
// the project's existing location tree so the BOM and the punch list share
// the same room references. Stored as project.punchList.

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const PUNCH_STATUSES = {
    open:          { label: 'Open',        color: '#f87171', bg: '#3d1a1a' },
    'in-progress': { label: 'In Progress', color: '#f59e0b', bg: '#3d2e1a' },
    closed:        { label: 'Closed',      color: '#00ba7c', bg: '#1a3d2e' },
};
const PUNCH_STATUS_ORDER = ['open', 'in-progress', 'closed'];

export default function PunchListTab({ project, onPatchProject }) {
    const items = Array.isArray(project?.punchList) ? project.punchList : [];
    const locationsFlat = useMemo(() => getAllLocationsFlatted(project?.locations || []), [project?.locations]);
    const [draft, setDraft] = useState({ locationId: '', description: '', owner: '' });

    const addItem = () => {
        if (!draft.description.trim()) return;
        const loc = locationsFlat.find(l => l.id === draft.locationId);
        const newItem = {
            id: genId(),
            locationId: draft.locationId || null,
            locationName: loc ? loc.path : '',
            description: draft.description.trim(),
            owner: draft.owner.trim(),
            status: 'open',
            createdAt: new Date().toISOString(),
        };
        onPatchProject({ punchList: [...items, newItem] });
        setDraft({ locationId: draft.locationId, description: '', owner: '' });
    };

    const updateItem = (id, patch) => {
        onPatchProject({ punchList: items.map(i => i.id === id ? { ...i, ...patch } : i) });
    };
    const deleteItem = (id) => {
        onPatchProject({ punchList: items.filter(i => i.id !== id) });
    };

    const openCount = items.filter(i => i.status === 'open').length;

    return (
        <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#e7e9ea' }}>Punch List</h3>
            <div style={{ color: '#6e767d', fontSize: '12px', marginBottom: '14px' }}>
                {items.length} item{items.length === 1 ? '' : 's'} · <span style={{ color: openCount > 0 ? '#f87171' : '#6e767d' }}>{openCount} open</span>
            </div>

            <div style={{ backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 160px auto', gap: '10px', alignItems: 'center' }}>
                    <select value={draft.locationId} onChange={e => setDraft({ ...draft, locationId: e.target.value })} style={styles.inputSmall}>
                        <option value="">(no location)</option>
                        {locationsFlat.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.path}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        value={draft.description}
                        onChange={e => setDraft({ ...draft, description: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                        placeholder="What needs to be fixed?"
                        style={styles.inputSmall}
                    />
                    <input
                        type="text"
                        value={draft.owner}
                        onChange={e => setDraft({ ...draft, owner: e.target.value })}
                        placeholder="Owner (optional)"
                        style={styles.inputSmall}
                    />
                    <button style={{ ...styles.button('primary'), opacity: draft.description.trim() ? 1 : 0.5 }} disabled={!draft.description.trim()} onClick={addItem}>
                        <Icons.Plus /> Add
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e767d', backgroundColor: '#151a21', borderRadius: '12px', border: '1px dashed #2f3336', fontSize: '13px' }}>
                    No punch items yet.
                </div>
            ) : (
                <div style={{ backgroundColor: '#1a1f26', borderRadius: '12px', border: '1px solid #2f3336', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #2f3336', backgroundColor: '#161b22' }}>
                                <th style={thStyle}>Location</th>
                                <th style={thStyle}>Description</th>
                                <th style={thStyle}>Owner</th>
                                <th style={thStyle}>Status</th>
                                <th style={{ ...thStyle, width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(i => {
                                const sMeta = PUNCH_STATUSES[i.status] || PUNCH_STATUSES.open;
                                return (
                                    <tr key={i.id} style={{ borderBottom: '1px solid #2f3336', opacity: i.status === 'closed' ? 0.65 : 1 }}>
                                        <td style={tdStyle}>
                                            <span style={{ color: '#8b98a5', fontSize: '12px' }}>{i.locationName || '—'}</span>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ color: '#e7e9ea', textDecoration: i.status === 'closed' ? 'line-through' : 'none' }}>{i.description}</div>
                                        </td>
                                        <td style={tdStyle}>
                                            <input
                                                type="text"
                                                value={i.owner || ''}
                                                onChange={e => updateItem(i.id, { owner: e.target.value })}
                                                placeholder="—"
                                                style={{ ...inlineInputStyle, width: '140px' }}
                                            />
                                        </td>
                                        <td style={tdStyle}>
                                            <select
                                                value={i.status}
                                                onChange={e => updateItem(i.id, { status: e.target.value })}
                                                style={{ ...inlineInputStyle, color: sMeta.color, backgroundColor: sMeta.bg, fontWeight: '600', width: '130px', cursor: 'pointer' }}
                                            >
                                                {PUNCH_STATUS_ORDER.map(k => <option key={k} value={k} style={{ backgroundColor: '#0f1419' }}>{PUNCH_STATUSES[k].label}</option>)}
                                            </select>
                                        </td>
                                        <td style={tdStyle}>
                                            <button onClick={() => deleteItem(i.id)} style={{ ...styles.iconButton, color: '#6e767d', padding: '4px' }} title="Delete"><Icons.X /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

const thStyle = { padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: '#6e767d', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tdStyle = { padding: '10px 12px', verticalAlign: 'middle' };
const inlineInputStyle = { padding: '6px 8px', backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '4px', color: '#e7e9ea', fontSize: '12px', outline: 'none', boxSizing: 'border-box' };
