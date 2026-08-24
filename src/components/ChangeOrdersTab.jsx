import React from 'react'
const { useState } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { fmtCost, fmtHrs } from '../utils/formatters'

// PM change orders. Lightweight register — number / title / description /
// cost & hours impact / status. Approved totals roll up at the top so the PM
// has a running picture of what's been signed off vs pending. Stored as
// project.changeOrders.

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const CO_STATUSES = {
    pending:  { label: 'Pending',  color: '#f59e0b', bg: '#3d2e1a' },
    approved: { label: 'Approved', color: '#00ba7c', bg: '#1a3d2e' },
    rejected: { label: 'Rejected', color: '#f87171', bg: '#3d1a1a' },
};
const CO_STATUS_ORDER = ['pending', 'approved', 'rejected'];

export default function ChangeOrdersTab({ project, onPatchProject }) {
    const orders = Array.isArray(project?.changeOrders) ? project.changeOrders : [];
    const [draft, setDraft] = useState({ title: '', description: '', costImpact: '', hoursImpact: '' });

    const nextNumber = () => {
        const max = orders.reduce((m, o) => {
            const n = parseInt((o.number || '').replace(/[^\d]/g, ''), 10);
            return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 0);
        return `CO-${String(max + 1).padStart(3, '0')}`;
    };

    const addOrder = () => {
        if (!draft.title.trim()) return;
        const co = {
            id: genId(),
            number: nextNumber(),
            title: draft.title.trim(),
            description: draft.description.trim(),
            costImpact: parseFloat(draft.costImpact) || 0,
            hoursImpact: parseFloat(draft.hoursImpact) || 0,
            status: 'pending',
            createdAt: new Date().toISOString(),
        };
        onPatchProject({ changeOrders: [...orders, co] });
        setDraft({ title: '', description: '', costImpact: '', hoursImpact: '' });
    };

    const updateOrder = (id, patch) => {
        onPatchProject({ changeOrders: orders.map(o => o.id === id ? { ...o, ...patch } : o) });
    };
    const deleteOrder = (id) => {
        onPatchProject({ changeOrders: orders.filter(o => o.id !== id) });
    };

    const approved = orders.filter(o => o.status === 'approved');
    const pending = orders.filter(o => o.status === 'pending');
    const totalApprovedCost = approved.reduce((s, o) => s + (o.costImpact || 0), 0);
    const totalApprovedHours = approved.reduce((s, o) => s + (o.hoursImpact || 0), 0);
    const totalPendingCost = pending.reduce((s, o) => s + (o.costImpact || 0), 0);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#e7e9ea' }}>Change Orders</h3>
                    <div style={{ color: '#6e767d', fontSize: '12px', marginTop: '2px' }}>{orders.length} order{orders.length === 1 ? '' : 's'}</div>
                </div>
                <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#8b98a5', alignItems: 'center' }}>
                    <span>Approved: <strong style={{ color: '#00ba7c' }}>{fmtCost(totalApprovedCost)}</strong> · <strong style={{ color: '#1d9bf0' }}>{fmtHrs(totalApprovedHours)}</strong></span>
                    {pending.length > 0 && <span>Pending: <strong style={{ color: '#f59e0b' }}>{fmtCost(totalPendingCost)}</strong></span>}
                </div>
            </div>

            <div style={{ backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 130px 120px 100px', gap: '10px' }}>
                    <input type="text" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Change order title" style={styles.inputSmall} />
                    <input type="number" step="0.01" value={draft.costImpact} onChange={e => setDraft({ ...draft, costImpact: e.target.value })} placeholder="Cost ($)" style={styles.inputSmall} />
                    <input type="number" step="0.25" value={draft.hoursImpact} onChange={e => setDraft({ ...draft, hoursImpact: e.target.value })} placeholder="Hours" style={styles.inputSmall} />
                    <button style={{ ...styles.button('primary'), opacity: draft.title.trim() ? 1 : 0.5 }} disabled={!draft.title.trim()} onClick={addOrder}>
                        <Icons.Plus /> Add
                    </button>
                </div>
                <textarea
                    value={draft.description}
                    onChange={e => setDraft({ ...draft, description: e.target.value })}
                    placeholder="Description (optional)"
                    style={{ ...styles.textarea, minHeight: '50px', marginTop: '10px' }}
                />
            </div>

            {orders.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e767d', backgroundColor: '#151a21', borderRadius: '12px', border: '1px dashed #2f3336', fontSize: '13px' }}>
                    No change orders yet.
                </div>
            ) : (
                <div style={{ backgroundColor: '#1a1f26', borderRadius: '12px', border: '1px solid #2f3336', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #2f3336', backgroundColor: '#161b22' }}>
                                <th style={thStyle}>CO #</th>
                                <th style={thStyle}>Title</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Cost Impact</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                                <th style={thStyle}>Status</th>
                                <th style={{ ...thStyle, width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map(o => {
                                const sMeta = CO_STATUSES[o.status] || CO_STATUSES.pending;
                                return (
                                    <React.Fragment key={o.id}>
                                        <tr style={{ borderBottom: o.description ? 'none' : '1px solid #2f3336' }}>
                                            <td style={tdStyle}><span style={{ color: '#8b98a5', fontFamily: 'monospace', fontSize: '12px' }}>{o.number}</span></td>
                                            <td style={tdStyle}><span style={{ color: '#e7e9ea', fontWeight: '500' }}>{o.title}</span></td>
                                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                <span style={{ color: o.costImpact >= 0 ? '#00ba7c' : '#f87171', fontWeight: '600' }}>{fmtCost(o.costImpact)}</span>
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right', color: '#1d9bf0', fontWeight: '600' }}>{fmtHrs(o.hoursImpact)}</td>
                                            <td style={tdStyle}>
                                                <select
                                                    value={o.status}
                                                    onChange={e => updateOrder(o.id, { status: e.target.value })}
                                                    style={{ ...inlineInputStyle, color: sMeta.color, backgroundColor: sMeta.bg, fontWeight: '600', width: '120px', cursor: 'pointer' }}
                                                >
                                                    {CO_STATUS_ORDER.map(k => <option key={k} value={k} style={{ backgroundColor: '#0f1419' }}>{CO_STATUSES[k].label}</option>)}
                                                </select>
                                            </td>
                                            <td style={tdStyle}>
                                                <button onClick={() => deleteOrder(o.id)} style={{ ...styles.iconButton, color: '#6e767d', padding: '4px' }} title="Delete"><Icons.X /></button>
                                            </td>
                                        </tr>
                                        {o.description && (
                                            <tr style={{ borderBottom: '1px solid #2f3336' }}>
                                                <td colSpan={6} style={{ padding: '0 12px 10px 12px', color: '#8b98a5', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{o.description}</td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

const thStyle = { padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: '#6e767d', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 12px', verticalAlign: 'middle' };
const inlineInputStyle = { padding: '6px 8px', backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '4px', color: '#e7e9ea', fontSize: '12px', outline: 'none', boxSizing: 'border-box' };
