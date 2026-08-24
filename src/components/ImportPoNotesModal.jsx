import React from 'react'
const { useState, useMemo } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { fmtCost } from '../utils/formatters'
import { planImport, applyImport, FIELD_LABELS } from '../utils/procurementImport'

// Preview + confirm step for importing a purchasing-marked-up BOM. Nothing
// touches the project until Apply — the PM sees every proposed change, row by
// row, and can uncheck any of them.

const ACTION_META = {
    update:    { label: 'Update',    color: '#1d9bf0', bg: '#1d3a5c' },
    new:       { label: 'New line',  color: '#a78bfa', bg: '#2d1a3d' },
    unchanged: { label: 'No change', color: '#6e767d', bg: '#1a1f26' },
};

const fmtVal = (field, v) => {
    if (v == null || v === '') return '—';
    if (field === 'unitCost') return fmtCost(v);
    return String(v);
};

export default function ImportPoNotesModal({ parsed, fileName, procurement, onApply, onClose }) {
    const [opts, setOpts] = useState({ importQty: true, importCost: true, importNotes: true, createNew: true });
    // Selections are keyed by sheet row number so they survive the re-plan
    // that happens when an option toggle changes what's on offer.
    const [overrides, setOverrides] = useState({});

    const entries = useMemo(() => {
        const plan = planImport(procurement, parsed.rows, opts);
        return plan.map(e => {
            const base = e.action === 'new' ? (opts.createNew && e.selected) : e.selected;
            const o = overrides[e.row.rowNumber];
            return { ...e, selected: o == null ? base : o };
        });
    }, [procurement, parsed.rows, opts, overrides]);

    const counts = useMemo(() => {
        const c = { update: 0, new: 0, unchanged: 0, ambiguous: 0, selected: 0 };
        entries.forEach(e => {
            c[e.action]++;
            if (e.match?.ambiguous) c.ambiguous++;
            if (e.selected) c.selected++;
        });
        return c;
    }, [entries]);

    const [showUnchanged, setShowUnchanged] = useState(false);
    const visible = showUnchanged ? entries : entries.filter(e => e.action !== 'unchanged');

    const toggleRow = (rowNumber, next) => setOverrides(prev => ({ ...prev, [rowNumber]: next }));
    const setAllVisible = (next) => {
        const patch = {};
        visible.forEach(e => { if (e.action !== 'unchanged') patch[e.row.rowNumber] = next; });
        setOverrides(prev => ({ ...prev, ...patch }));
    };

    const handleApply = () => {
        const { next, updated, created } = applyImport(procurement, entries, { fileName });
        onApply(next, { updated, created });
    };

    const opt = (key, label, hint) => (
        <label key={key} title={hint} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#c9d1d9', cursor: 'pointer' }}>
            <input type="checkbox" checked={opts[key]} onChange={e => setOpts(p => ({ ...p, [key]: e.target.checked }))} />
            {label}
        </label>
    );

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '860px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#e7e9ea' }}>Import PO Notes</h3>
                    <button onClick={onClose} style={{ ...styles.iconButton, color: '#6e767d' }}><Icons.X /></button>
                </div>
                <div style={{ color: '#6e767d', fontSize: '12px', marginBottom: '14px' }}>
                    {fileName} · sheet "{parsed.sheetName}" · {parsed.rows.length} item row{parsed.rows.length === 1 ? '' : 's'} read from row {parsed.headerRow + 1} down
                </div>

                {/* Summary chips */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <Chip color="#1d9bf0" bg="#1d3a5c">{counts.update} to update</Chip>
                    <Chip color="#a78bfa" bg="#2d1a3d">{counts.new} not in procurement</Chip>
                    <Chip color="#6e767d" bg="#1a1f26">{counts.unchanged} already match</Chip>
                    {counts.ambiguous > 0 && <Chip color="#f59e0b" bg="#3d2e1a">{counts.ambiguous} ambiguous — review</Chip>}
                </div>

                {/* What to import */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '10px 12px', backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '8px', marginBottom: '10px' }}>
                    {opt('importQty', 'Quantities', 'Pull the sheet QTY into Ordered (and Received, if the sheet has that column)')}
                    {opt('importCost', 'Unit costs', 'Overwrite unit cost with the price purchasing actually paid')}
                    {opt('importNotes', 'Notes', 'Append PO NOTES / PM NOTES to each line, keeping any existing note')}
                    {opt('createNew', 'Add unmatched rows', 'Create lines for sheet rows with no match in procurement')}
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setAllVisible(true)} style={linkBtn}>Select all</button>
                    <button onClick={() => setAllVisible(false)} style={linkBtn}>Select none</button>
                </div>

                {!parsed.hasReceivedColumn && (
                    <div style={{ fontSize: '11px', color: '#8b98a5', marginBottom: '10px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                        <span style={{ color: '#f59e0b', flexShrink: 0, display: 'inline-flex' }}><Icons.AlertTriangle /></span>
                        <span>No "Received" column on this sheet — quantities import as <strong style={{ color: '#c9d1d9' }}>ordered</strong>. Add a Received column to the sheet (or mark arrivals in the table) to track what's landed.</span>
                    </div>
                )}

                {/* Row table */}
                <div style={{ border: '1px solid #2f3336', borderRadius: '8px', overflow: 'auto', maxHeight: '42vh' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#161b22', position: 'sticky', top: 0, zIndex: 1 }}>
                                <th style={{ ...th, width: '28px' }}></th>
                                <th style={th}>Item</th>
                                <th style={{ ...th, width: '130px' }}>Vendor</th>
                                <th style={{ ...th, width: '84px' }}>Action</th>
                                <th style={th}>Changes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#6e767d', fontStyle: 'italic' }}>
                                    Nothing to change — every row on the sheet already matches procurement.
                                </td></tr>
                            )}
                            {visible.map(e => {
                                const meta = ACTION_META[e.action];
                                const r = e.row;
                                const disabled = e.action === 'unchanged';
                                return (
                                    <tr key={r.rowNumber} style={{ borderBottom: '1px solid #2f3336', opacity: disabled ? 0.5 : 1 }}>
                                        <td style={{ ...td, textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={e.selected}
                                                disabled={disabled}
                                                onChange={ev => toggleRow(r.rowNumber, ev.target.checked)}
                                            />
                                        </td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ color: '#e7e9ea', fontWeight: 500 }}>{[r.manufacturer, r.model].filter(Boolean).join(' ')}</span>
                                                {r.partNumber && r.partNumber !== r.model && (
                                                    <span style={{ color: '#6e767d', fontFamily: 'monospace', fontSize: '11px' }}>{r.partNumber}</span>
                                                )}
                                            </div>
                                            <div style={{ color: '#4a5568', fontSize: '10px' }}>
                                                row {r.rowNumber}
                                                {e.match && <> · matched on {e.match.how}</>}
                                                {e.match?.ambiguous && <span style={{ color: '#f59e0b' }}> · {e.match.candidateCount} possible lines, picked the first</span>}
                                            </div>
                                        </td>
                                        <td style={{ ...td, color: '#8b98a5' }}>{e.vendorKey}</td>
                                        <td style={td}>
                                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '9px', color: meta.color, backgroundColor: meta.bg, whiteSpace: 'nowrap' }}>
                                                {meta.label}
                                            </span>
                                        </td>
                                        <td style={td}>
                                            {e.action === 'new' ? (
                                                <span style={{ color: '#8b98a5' }}>
                                                    qty {r.orderedQty ?? '—'}{r.poNumber ? ` · ${r.poNumber}` : ''}{r.unitCost ? ` · ${fmtCost(r.unitCost)}` : ''}
                                                </span>
                                            ) : e.changes.length === 0 ? (
                                                <span style={{ color: '#4a5568' }}>—</span>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    {e.changes.map(c => (
                                                        <div key={c.field} style={{ color: '#8b98a5' }}>
                                                            <span style={{ color: '#6e767d' }}>{FIELD_LABELS[c.field] || c.field}: </span>
                                                            <span style={{ textDecoration: c.from == null ? 'none' : 'line-through', color: '#6e767d' }}>{fmtVal(c.field, c.from)}</span>
                                                            <span style={{ color: '#6e767d' }}> → </span>
                                                            <strong style={{ color: '#e7e9ea' }}>{fmtVal(c.field, c.to)}</strong>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', gap: '12px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#8b98a5', cursor: 'pointer' }}>
                        <input type="checkbox" checked={showUnchanged} onChange={e => setShowUnchanged(e.target.checked)} />
                        Show rows with no changes
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                        <button style={styles.button('primary')} onClick={handleApply} disabled={counts.selected === 0}>
                            <Icons.Check /> Import {counts.selected} row{counts.selected === 1 ? '' : 's'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const Chip = ({ color, bg, children }) => (
    <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '10px', color, backgroundColor: bg }}>{children}</span>
);

const th = { padding: '7px 10px', textAlign: 'left', fontSize: '10px', color: '#6e767d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #2f3336', whiteSpace: 'nowrap' };
const td = { padding: '6px 10px', verticalAlign: 'top' };
const linkBtn = { background: 'none', border: 'none', color: '#1d9bf0', fontSize: '12px', cursor: 'pointer', padding: 0 };
