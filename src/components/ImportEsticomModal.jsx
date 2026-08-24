import React from 'react'
const { useState, useMemo } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { fmtCost, fmtHrs } from '../utils/formatters'
import { summarizeLocation } from '../utils/esticomImport'

// Preview + confirm step for importing an Esticom estimate export. The user
// picks which locations to bring in; on Apply those locations OVERWRITE the
// project's current locations. Nothing changes until Apply is clicked.

export default function ImportEsticomModal({ parsed, fileName, projectName, onApply, onClose }) {
    // Default: include every location that actually has items. Empty groups
    // (e.g. Esticom's "Custom items") start unchecked.
    const [selected, setSelected] = useState(() => {
        const init = {};
        parsed.locations.forEach(l => { init[l.id] = (l.items?.length || 0) > 0; });
        return init;
    });
    const [expanded, setExpanded] = useState({});

    const rows = useMemo(() => parsed.locations.map(loc => ({
        loc,
        sum: summarizeLocation(loc),
    })), [parsed.locations]);

    const selectedRows = rows.filter(r => selected[r.loc.id]);
    const totals = useMemo(() => selectedRows.reduce((t, r) => ({
        locations: t.locations + 1,
        materials: t.materials + r.sum.materials,
        labor: t.labor + r.sum.labor,
        matCost: t.matCost + r.sum.matCost,
        laborHrs: t.laborHrs + r.sum.laborHrs,
    }), { locations: 0, materials: 0, labor: 0, matCost: 0, laborHrs: 0 }), [selectedRows]);

    const toggle = (id) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    const setAll = (val) => setSelected(() => {
        const next = {};
        parsed.locations.forEach(l => { next[l.id] = val; });
        return next;
    });
    const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const handleApply = () => onApply(selectedRows.map(r => r.loc));

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '860px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#e7e9ea' }}>Import Esticom Estimate</h3>
                    <button onClick={onClose} style={{ ...styles.iconButton, color: '#6e767d' }}><Icons.X /></button>
                </div>
                <div style={{ color: '#6e767d', fontSize: '12px', marginBottom: '14px' }}>
                    {fileName} · sheet "{parsed.sheetName}" · {parsed.locations.length} location{parsed.locations.length === 1 ? '' : 's'} found
                    {parsed.stats.skipped > 0 && <> · {parsed.stats.skipped} empty/rollup row{parsed.stats.skipped === 1 ? '' : 's'} skipped</>}
                </div>

                {/* Summary chips (for the current selection) */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <Chip color="#1d9bf0" bg="#1d3a5c">{totals.locations} location{totals.locations === 1 ? '' : 's'}</Chip>
                    <Chip color="#00ba7c" bg="#1a3d2e">{totals.materials} material line{totals.materials === 1 ? '' : 's'} · {fmtCost(totals.matCost)}</Chip>
                    <Chip color="#a78bfa" bg="#2d1a3d">{totals.labor} labor line{totals.labor === 1 ? '' : 's'} · {fmtHrs(totals.laborHrs)}</Chip>
                </div>

                {/* Overwrite warning */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', backgroundColor: '#2a1f0a', border: '1px solid #f59e0b40', borderRadius: '8px', marginBottom: '12px' }}>
                    <span style={{ color: '#f59e0b', flexShrink: 0, display: 'inline-flex', marginTop: '1px' }}><Icons.AlertTriangle /></span>
                    <span style={{ fontSize: '12px', color: '#c9d1d9' }}>
                        This <strong>replaces every location</strong> currently in {projectName ? <strong>{projectName}</strong> : 'this project'} with the checked locations below. Create a revision first if you want a restore point.
                    </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '8px' }}>
                    <button onClick={() => setAll(true)} style={linkBtn}>Select all</button>
                    <button onClick={() => setAll(false)} style={linkBtn}>Select none</button>
                </div>

                {/* Location list */}
                <div style={{ border: '1px solid #2f3336', borderRadius: '8px', overflow: 'auto', maxHeight: '44vh' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#161b22', position: 'sticky', top: 0, zIndex: 1 }}>
                                <th style={{ ...th, width: '28px' }}></th>
                                <th style={{ ...th, width: '24px' }}></th>
                                <th style={th}>Location</th>
                                <th style={{ ...th, width: '90px', textAlign: 'right' }}>Materials</th>
                                <th style={{ ...th, width: '110px', textAlign: 'right' }}>Material $</th>
                                <th style={{ ...th, width: '90px', textAlign: 'right' }}>Labor</th>
                                <th style={{ ...th, width: '80px', textAlign: 'right' }}>Hrs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ loc, sum }) => {
                                const isSel = !!selected[loc.id];
                                const isOpen = !!expanded[loc.id];
                                const empty = (loc.items?.length || 0) === 0;
                                return (
                                    <React.Fragment key={loc.id}>
                                        <tr style={{ borderBottom: '1px solid #2f3336', opacity: isSel ? 1 : 0.55 }}>
                                            <td style={{ ...td, textAlign: 'center' }}>
                                                <input type="checkbox" checked={isSel} onChange={() => toggle(loc.id)} />
                                            </td>
                                            <td style={{ ...td, textAlign: 'center' }}>
                                                {!empty && (
                                                    <button style={{ ...styles.iconButton, padding: '2px', color: '#8b98a5' }} onClick={() => toggleExpand(loc.id)}>
                                                        {isOpen ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                                                    </button>
                                                )}
                                            </td>
                                            <td style={{ ...td, color: '#e7e9ea', fontWeight: 600 }}>
                                                {loc.name}
                                                {empty && <span style={{ marginLeft: '8px', fontSize: '10px', color: '#6e767d', fontWeight: 400, fontStyle: 'italic' }}>empty</span>}
                                            </td>
                                            <td style={{ ...td, textAlign: 'right', color: '#8b98a5' }}>{sum.materials || '—'}</td>
                                            <td style={{ ...td, textAlign: 'right', color: '#00ba7c' }}>{sum.matCost ? fmtCost(sum.matCost) : '—'}</td>
                                            <td style={{ ...td, textAlign: 'right', color: '#8b98a5' }}>{sum.labor || '—'}</td>
                                            <td style={{ ...td, textAlign: 'right', color: '#a78bfa' }}>{sum.laborHrs ? fmtHrs(sum.laborHrs) : '—'}</td>
                                        </tr>
                                        {isOpen && loc.items.map(it => (
                                            <tr key={it.id} style={{ borderBottom: '1px solid #21262d', backgroundColor: '#0f1419' }}>
                                                <td style={td}></td>
                                                <td style={td}></td>
                                                <td style={{ ...td, color: '#c9d1d9' }} colSpan={2}>
                                                    <span style={{ color: '#6e767d', marginRight: '6px' }}>└</span>
                                                    {it.category === 'Labor'
                                                        ? <span style={{ color: '#a78bfa' }}>{it.model}</span>
                                                        : <span>{[it.manufacturer, it.model].filter(Boolean).join(' ')}</span>}
                                                    {it.phase && <span style={{ marginLeft: '8px', fontSize: '10px', color: '#6e767d' }}>{it.phase}</span>}
                                                </td>
                                                <td style={{ ...td, textAlign: 'right', color: '#8b98a5' }}>
                                                    {it.category === 'Labor' ? '—' : fmtCost((it.qty || 0) * (it.unitCost || 0))}
                                                </td>
                                                <td style={{ ...td, textAlign: 'right', color: '#8b98a5' }}>
                                                    {it.category === 'Labor' ? `${it.qty} hr` : `${it.qty} ${it.uom}`}
                                                </td>
                                                <td style={{ ...td, textAlign: 'right', color: '#a78bfa' }}>
                                                    {it.category === 'Labor' ? fmtHrs((it.qty || 0) * (it.laborHrsPerUnit || 0)) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '14px', gap: '8px' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button style={styles.button('primary')} onClick={handleApply} disabled={totals.locations === 0}>
                        <Icons.Check /> Overwrite with {totals.locations} location{totals.locations === 1 ? '' : 's'}
                    </button>
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
