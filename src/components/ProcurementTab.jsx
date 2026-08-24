import React from 'react'
const { useState, useMemo, useRef } = React
import * as XLSX from 'xlsx'
import { styles } from '../styles'
import { Icons } from '../icons'
import { fmtCost } from '../utils/formatters'
import { syncFromBom, getProcurementSummary, getVendorSummary, maybeAutoStatus, makeFieldAddLine } from '../utils/procurement'
import { parsePurchasingWorkbook } from '../utils/procurementImport'
import ImportPoNotesModal from './ImportPoNotesModal'

// PM procurement / running BOM. Estimating produces the *design* BOM
// (project.locations[].items). This tab is the PM's working copy: each
// line tracks design qty (frozen-from-BOM), ordered qty (what was actually
// requested from purchasing), received qty (what physically arrived), per-
// line PO number, status, expected date, notes. Vendors are collapsible
// groups. Lines persist independently of the design BOM so receiving
// history isn't lost if estimating later edits the BOM.

const LINE_STATUSES = {
    pending:     { label: 'Pending',     color: '#8b98a5', bg: '#2f3336' },
    ordered:     { label: 'Ordered',     color: '#a78bfa', bg: '#2d1a3d' },
    shipped:     { label: 'Shipped',     color: '#06b6d4', bg: '#1a3340' },
    partial:     { label: 'Partial',     color: '#f59e0b', bg: '#3d2e1a' },
    received:    { label: 'Received',    color: '#00ba7c', bg: '#1a3d2e' },
    backordered: { label: 'Backordered', color: '#f87171', bg: '#3d1a1a' },
    returned:    { label: 'Returned',    color: '#6e767d', bg: '#1a1f26' },
};
const LINE_STATUS_ORDER = ['pending', 'ordered', 'shipped', 'partial', 'received', 'backordered', 'returned'];

export default function ProcurementTab({ project, catalogPackages, onPatchProject }) {
    const procurement = project?.procurement || {};
    const vendors = procurement.vendors || {};
    const vendorKeys = useMemo(() => Object.keys(vendors).sort((a, b) => a.localeCompare(b)), [vendors]);
    const summary = useMemo(() => getProcurementSummary(procurement), [procurement]);
    const [collapsed, setCollapsed] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedLines, setExpandedLines] = useState({});
    // Import flow: parse the purchasing sheet, then hold the parsed result
    // while the PM reviews the proposed changes in the modal.
    const [importPreview, setImportPreview] = useState(null);   // { parsed, fileName }
    const [importResult, setImportResult] = useState(null);     // banner after apply / on error
    const importInputRef = useRef(null);

    // Match across the fields a PM is likely to know off the top of their
    // head — part number above all, then mfr/model/description/PO#/notes so
    // typing "65C" or "PO-0042" both find what they're after.
    const lineMatchesSearch = (line, term) => {
        if (!term) return true;
        const t = term.toLowerCase();
        return (line.partNumber || '').toLowerCase().includes(t)
            || (line.manufacturer || '').toLowerCase().includes(t)
            || (line.model || '').toLowerCase().includes(t)
            || (line.description || '').toLowerCase().includes(t)
            || (line.poNumber || '').toLowerCase().includes(t)
            || (line.notes || '').toLowerCase().includes(t);
    };

    // Filter-aware vendor list: when a search is active, vendors with zero
    // matching lines drop out entirely and the rest are force-expanded so the
    // matching rows are immediately visible.
    const filteredVendors = useMemo(() => {
        if (!searchTerm.trim()) return vendorKeys.map(vk => ({ vk, lines: vendors[vk].lines || [], totalLines: (vendors[vk].lines || []).length }));
        const term = searchTerm.trim();
        return vendorKeys
            .map(vk => {
                const all = vendors[vk].lines || [];
                const matched = all.filter(l => lineMatchesSearch(l, term));
                return { vk, lines: matched, totalLines: all.length };
            })
            .filter(v => v.lines.length > 0);
    }, [vendorKeys, vendors, searchTerm]);

    const totalMatches = filteredVendors.reduce((s, v) => s + v.lines.length, 0);

    // Bulk collapse toggle. "All expanded" means every vendor key is either
    // missing from `collapsed` or set to false — flip to all-collapsed in
    // that case; otherwise expand everything.
    const anyExpanded = vendorKeys.some(vk => !collapsed[vk]);
    const toggleAll = () => {
        if (anyExpanded) {
            const next = {};
            vendorKeys.forEach(vk => { next[vk] = true; });
            setCollapsed(next);
        } else {
            setCollapsed({});
        }
    };

    const orderedPct = summary.totalOrderedCost > 0
        ? Math.min(100, Math.round((summary.totalReceivedCost / summary.totalOrderedCost) * 100))
        : 0;

    const handleSync = () => {
        const next = syncFromBom(project, catalogPackages);
        onPatchProject({ procurement: next });
    };

    const handleExport = () => {
        const rows = [['Vendor', 'Manufacturer', 'Model', 'Part Number', 'Description', 'Qty', 'Unit Cost', 'Total Cost', 'Notes']];
        vendorKeys.forEach(vk => {
            const v = vendors[vk];
            (v.lines || []).forEach(l => {
                const qty = l.orderedQty || l.designQty || 0;
                if (qty === 0) return;
                rows.push([
                    v.vendor,
                    l.manufacturer || '',
                    l.model || '',
                    l.partNumber || '',
                    l.description || '',
                    qty,
                    l.unitCost || 0,
                    qty * (l.unitCost || 0),
                    l.notes || '',
                ]);
            });
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 36 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 24 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'BOM for Purchasing');
        const safeName = (project.name || 'project').replace(/[^\w\-]+/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `${safeName}_BOM_${dateStr}.xlsx`);
    };

    // Purchasing hands back the BOM marked up with real quantities, PO
    // numbers and notes. Parse it here, preview in the modal, apply on OK.
    const handleImportFile = async (file) => {
        if (!file) return;
        setImportResult(null);
        try {
            const buf = await file.arrayBuffer();
            const parsed = parsePurchasingWorkbook(new Uint8Array(buf));
            if (!parsed.rows.length) {
                setImportResult({ error: 'Found the header row but no item rows underneath it.' });
                return;
            }
            setImportPreview({ parsed, fileName: file.name });
        } catch (err) {
            setImportResult({ error: err.message || 'Could not read that file.' });
        }
    };

    const handleApplyImport = (nextProcurement, { updated, created }) => {
        onPatchProject({ procurement: nextProcurement });
        setImportPreview(null);
        setImportResult({ updated, created });
    };

    // Per-line mutation. Recomputes auto-status when qty changes; manual
    // statuses (shipped/backordered/returned) survive qty edits.
    const updateLine = (vendorKey, lineId, patch) => {
        const v = vendors[vendorKey];
        if (!v) return;
        const nextLines = (v.lines || []).map(l => {
            if (l.id !== lineId) return l;
            const merged = { ...l, ...patch };
            if (patch.orderedQty != null || patch.receivedQty != null) {
                merged.status = maybeAutoStatus(merged);
            }
            return merged;
        });
        onPatchProject({
            procurement: {
                ...procurement,
                vendors: { ...vendors, [vendorKey]: { ...v, lines: nextLines } }
            }
        });
    };

    const updateVendor = (vendorKey, patch) => {
        const v = vendors[vendorKey];
        if (!v) return;
        onPatchProject({
            procurement: {
                ...procurement,
                vendors: { ...vendors, [vendorKey]: { ...v, ...patch } }
            }
        });
    };

    const deleteLine = (vendorKey, lineId) => {
        const v = vendors[vendorKey];
        if (!v) return;
        onPatchProject({
            procurement: {
                ...procurement,
                vendors: { ...vendors, [vendorKey]: { ...v, lines: v.lines.filter(l => l.id !== lineId) } }
            }
        });
    };

    const addFieldLine = (vendorKey) => {
        const v = vendors[vendorKey];
        if (!v) return;
        const line = makeFieldAddLine({ vendor: v.vendor });
        onPatchProject({
            procurement: {
                ...procurement,
                vendors: { ...vendors, [vendorKey]: { ...v, lines: [...(v.lines || []), line] } }
            }
        });
    };

    const isEmpty = vendorKeys.length === 0;
    const hasBom = (project.locations || []).some(l => (l.items || []).length > 0 || (l.children || []).length > 0);

    return (
        <div>
            {/* Header summary + action buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#e7e9ea' }}>Procurement & Running BOM</h3>
                    <div style={{ color: '#6e767d', fontSize: '12px', marginTop: '2px' }}>
                        {vendorKeys.length} vendor{vendorKeys.length === 1 ? '' : 's'} · {summary.totalLines} line{summary.totalLines === 1 ? '' : 's'}
                        {procurement.lastSyncedAt && (
                            <span style={{ marginLeft: '8px', color: '#4a5568' }}>
                                · last synced {new Date(procurement.lastSyncedAt).toLocaleDateString()}
                            </span>
                        )}
                        {procurement.lastImport?.at && (
                            <span style={{ marginLeft: '8px', color: '#4a5568' }} title={procurement.lastImport.fileName}>
                                · last PO import {new Date(procurement.lastImport.at).toLocaleDateString()}
                            </span>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {!isEmpty && !searchTerm && (
                        <button
                            style={styles.button('secondary')}
                            onClick={toggleAll}
                            title={anyExpanded ? 'Collapse every vendor' : 'Expand every vendor'}
                        >
                            {anyExpanded ? <Icons.ChevronsUp /> : <Icons.ChevronsDown />}
                            {anyExpanded ? 'Collapse All' : 'Expand All'}
                        </button>
                    )}
                    <button style={styles.button('secondary')} onClick={handleSync} title="Pull current BOM into procurement, preserving received/ordered state">
                        <Icons.Sync /> Sync from BOM
                    </button>
                    {!isEmpty && (
                        <button style={styles.button('secondary')} onClick={handleExport} title="Export the working BOM as XLSX to send to purchasing">
                            <Icons.Download /> Export for Purchasing
                        </button>
                    )}
                    <button
                        style={styles.button('secondary')}
                        onClick={() => importInputRef.current?.click()}
                        title="Import a BOM that purchasing marked up — quantities, PO numbers and notes come back onto these lines"
                    >
                        <Icons.Upload /> Import PO Notes
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        style={{ display: 'none' }}
                        onChange={e => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }}
                    />
                </div>
            </div>

            {/* Import result / error banner */}
            {importResult && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '10px 14px',
                    borderRadius: '10px', fontSize: '13px',
                    backgroundColor: importResult.error ? '#3d1a1a' : '#1a3d2e',
                    border: `1px solid ${importResult.error ? '#f87171' : '#00ba7c'}`,
                    color: importResult.error ? '#f87171' : '#00ba7c',
                }}>
                    <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                        {importResult.error ? <Icons.AlertTriangle /> : <Icons.Check />}
                    </span>
                    <span style={{ flex: 1 }}>
                        {importResult.error
                            ? importResult.error
                            : `Imported PO notes — ${importResult.updated} line${importResult.updated === 1 ? '' : 's'} updated, ${importResult.created} added.`}
                    </span>
                    <button onClick={() => setImportResult(null)} style={{ ...styles.iconButton, color: 'inherit' }}><Icons.X /></button>
                </div>
            )}

            {importPreview && (
                <ImportPoNotesModal
                    parsed={importPreview.parsed}
                    fileName={importPreview.fileName}
                    procurement={procurement}
                    onApply={handleApplyImport}
                    onClose={() => setImportPreview(null)}
                />
            )}

            {/* Progress bar */}
            {!isEmpty && summary.totalOrderedCost > 0 && (
                <div style={{ marginBottom: '16px', backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ color: '#8b98a5' }}>Received vs Ordered</span>
                        <span style={{ color: '#e7e9ea', fontWeight: '600' }}>{orderedPct}%</span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#0f1419', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                        <div style={{ width: `${orderedPct}%`, height: '100%', backgroundColor: '#00ba7c', transition: 'width 0.2s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#8b98a5', flexWrap: 'wrap' }}>
                        <span>Design: <strong style={{ color: '#e7e9ea' }}>{fmtCost(summary.totalDesignCost)}</strong></span>
                        <span>Ordered: <strong style={{ color: '#a78bfa' }}>{fmtCost(summary.totalOrderedCost)}</strong></span>
                        <span>Received: <strong style={{ color: '#00ba7c' }}>{fmtCost(summary.totalReceivedCost)}</strong></span>
                        {summary.backorders > 0 && <span style={{ color: '#f87171' }}>{summary.backorders} backorder{summary.backorders === 1 ? '' : 's'}</span>}
                        {summary.pending > 0 && <span style={{ color: '#f59e0b' }}>{summary.pending} pending</span>}
                    </div>
                </div>
            )}

            {/* Search bar */}
            {!isEmpty && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '0 1 360px' }}>
                        <input
                            type="text"
                            placeholder="Search part number, mfr, model, PO #..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ ...styles.input, paddingRight: searchTerm ? '32px' : '12px' }}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6e767d', cursor: 'pointer', padding: '4px', display: 'inline-flex' }}
                                title="Clear search"
                            >
                                <Icons.X />
                            </button>
                        )}
                    </div>
                    {searchTerm && (
                        <span style={{ fontSize: '12px', color: '#8b98a5' }}>
                            {totalMatches} match{totalMatches === 1 ? '' : 'es'} across {filteredVendors.length} vendor{filteredVendors.length === 1 ? '' : 's'}
                        </span>
                    )}
                </div>
            )}

            {/* Empty state */}
            {isEmpty && (
                <div style={{ padding: '40px 20px', textAlign: 'center', backgroundColor: '#151a21', borderRadius: '12px', border: '1px dashed #2f3336' }}>
                    {hasBom ? (
                        <>
                            <p style={{ color: '#8b98a5', fontSize: '14px', margin: '0 0 16px 0' }}>Procurement starts as a snapshot of the design BOM, then drifts independently as items are ordered and received.</p>
                            <button style={styles.button('primary')} onClick={handleSync}>
                                <Icons.Sync /> Sync from BOM
                            </button>
                        </>
                    ) : (
                        <p style={{ color: '#6e767d', fontSize: '13px', margin: 0 }}>Add items to the project BOM first, then sync them here.</p>
                    )}
                </div>
            )}

            {/* No-match state */}
            {!isEmpty && searchTerm && filteredVendors.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center', backgroundColor: '#151a21', borderRadius: '12px', border: '1px dashed #2f3336', color: '#8b98a5', fontSize: '13px' }}>
                    No lines match <strong style={{ color: '#e7e9ea' }}>"{searchTerm}"</strong>.
                </div>
            )}

            {/* Vendor sections */}
            {filteredVendors.map(({ vk, lines: visibleLines, totalLines }) => {
                const v = vendors[vk];
                const vs = getVendorSummary(v);
                // Force-expand when filtering so matching rows are visible.
                const isCollapsed = !!collapsed[vk] && !searchTerm;
                const vendorPct = vs.orderedCost > 0 ? Math.round((vs.receivedCost / vs.orderedCost) * 100) : 0;
                return (
                    <div key={vk} style={{ marginBottom: '12px', backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Vendor header — clickable to collapse */}
                        <div
                            onClick={() => setCollapsed(prev => ({ ...prev, [vk]: !prev[vk] }))}
                            style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: isCollapsed ? 'none' : '1px solid #2f3336', userSelect: 'none' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e2530'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                <span style={{ color: '#8b98a5', display: 'inline-flex' }}>
                                    {isCollapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
                                </span>
                                <strong style={{ color: '#e7e9ea', fontSize: '15px' }}>{v.vendor}</strong>
                                <span style={{ color: '#6e767d', fontSize: '12px' }}>
                                    {searchTerm
                                        ? <><strong style={{ color: '#1d9bf0' }}>{visibleLines.length}</strong> of {totalLines} line{totalLines === 1 ? '' : 's'} match · {fmtCost(vs.orderedCost || vs.designCost)}</>
                                        : <>{vs.lineCount} line{vs.lineCount === 1 ? '' : 's'} · {fmtCost(vs.orderedCost || vs.designCost)}</>}
                                </span>
                                {vs.lineCount > 0 && (
                                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: vs.receivedLines === vs.lineCount ? '#1a3d2e' : '#1d3a5c', color: vs.receivedLines === vs.lineCount ? '#00ba7c' : '#1d9bf0', fontWeight: '600' }}>
                                        {vs.receivedLines}/{vs.lineCount} received
                                    </span>
                                )}
                                {vs.backorders > 0 && (
                                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#3d1a1a', color: '#f87171', fontWeight: '600' }}>
                                        {vs.backorders} backordered
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} onClick={e => e.stopPropagation()}>
                                {vs.orderedCost > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '80px', height: '5px', backgroundColor: '#0f1419', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ width: `${vendorPct}%`, height: '100%', backgroundColor: '#00ba7c' }} />
                                        </div>
                                        <span style={{ fontSize: '11px', color: '#8b98a5', minWidth: '28px', textAlign: 'right' }}>{vendorPct}%</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Expanded body */}
                        {!isCollapsed && (
                            <div style={{ padding: '0' }}>
                                {/* Vendor meta row */}
                                <div style={{ padding: '10px 14px', borderBottom: '1px solid #2f3336', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', alignItems: 'center' }}>
                                    <div>
                                        <label style={metaLabel}>PO Numbers</label>
                                        <input
                                            type="text"
                                            value={v.poNumbers || ''}
                                            onChange={e => updateVendor(vk, { poNumbers: e.target.value })}
                                            placeholder="e.g. PO-2024-0042, PO-2024-0098"
                                            style={inlineInputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label style={metaLabel}>Vendor Notes</label>
                                        <input
                                            type="text"
                                            value={v.notes || ''}
                                            onChange={e => updateVendor(vk, { notes: e.target.value })}
                                            placeholder="Lead time, contact, special instructions..."
                                            style={inlineInputStyle}
                                        />
                                    </div>
                                </div>

                                {/* Item table — compact one-row-per-item with click-to-expand for
                                    description / expected / notes. */}
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '600px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #2f3336', backgroundColor: '#161b22' }}>
                                                <th style={{ ...thStyle, width: '24px' }}></th>
                                                <th style={thStyle}>Item</th>
                                                <th style={{ ...thStyle, textAlign: 'right', width: '60px' }}>Ord</th>
                                                <th style={{ ...thStyle, textAlign: 'right', width: '60px' }}>Rcv</th>
                                                <th style={{ ...thStyle, width: '102px' }}>Status</th>
                                                <th style={{ ...thStyle, width: '108px' }}>PO #</th>
                                                <th style={{ ...thStyle, width: '24px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleLines.length === 0 ? (
                                                <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#6e767d', fontStyle: 'italic' }}>No items.</td></tr>
                                            ) : visibleLines.map(l => {
                                                const sMeta = LINE_STATUSES[l.status] || LINE_STATUSES.pending;
                                                const isFieldAdd = l.sourceType === 'field-add';
                                                const isRetired = !isFieldAdd && l.designQty === 0;
                                                const isShort = (l.orderedQty || 0) < (l.designQty || 0);
                                                const isExpanded = !!expandedLines[l.id];
                                                const toggleExpand = () => setExpandedLines(prev => ({ ...prev, [l.id]: !prev[l.id] }));
                                                const titleText = [l.manufacturer, l.model, l.partNumber, l.description].filter(Boolean).join(' · ');
                                                return (
                                                    <React.Fragment key={l.id}>
                                                        <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #2f3336', opacity: l.status === 'returned' ? 0.55 : 1 }}>
                                                            <td style={{ ...tdStyle, padding: '4px 6px' }}>
                                                                <button
                                                                    onClick={toggleExpand}
                                                                    style={{ ...styles.iconButton, color: '#6e767d', padding: '2px' }}
                                                                    title={isExpanded ? 'Hide details' : 'Show description, expected date, notes'}
                                                                >
                                                                    {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                                                                </button>
                                                            </td>
                                                            <td style={{ ...tdStyle, padding: '4px 8px' }}>
                                                                {isFieldAdd ? (
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '90px 110px 1fr', gap: '4px' }}>
                                                                        <input type="text" value={l.manufacturer || ''} onChange={e => updateLine(vk, l.id, { manufacturer: e.target.value })} placeholder="Mfr" style={inlineInputStyle} />
                                                                        <input type="text" value={l.model || ''} onChange={e => updateLine(vk, l.id, { model: e.target.value })} placeholder="Model" style={inlineInputStyle} />
                                                                        <input type="text" value={l.description || ''} onChange={e => updateLine(vk, l.id, { description: e.target.value })} placeholder="Description" style={inlineInputStyle} />
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }} title={titleText}>
                                                                        <span style={{ color: '#e7e9ea', fontWeight: '500', whiteSpace: 'nowrap', flexShrink: 0 }}>{l.manufacturer} {l.model}</span>
                                                                        {l.partNumber && <span style={{ color: '#6e767d', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0 }}>{l.partNumber}</span>}
                                                                        {isRetired && l.sourceType !== 'import' && <span style={{ fontSize: '9px', padding: '1px 5px', backgroundColor: '#1a1f26', color: '#6e767d', borderRadius: '8px', fontWeight: '600', flexShrink: 0 }}>OFF BOM</span>}
                                                                        {l.sourceType === 'import' && <span style={{ fontSize: '9px', padding: '1px 5px', backgroundColor: '#1d3a5c', color: '#1d9bf0', borderRadius: '8px', fontWeight: '600', flexShrink: 0 }} title="Added by a PO notes import — not in the design BOM">IMPORTED</span>}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td style={{ ...tdStyle, textAlign: 'right', padding: '4px 6px' }}>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    className="qty-input"
                                                                    value={l.orderedQty}
                                                                    onChange={e => updateLine(vk, l.id, { orderedQty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                                    style={{ ...inlineInputStyle, textAlign: 'right', borderColor: isShort && !isRetired ? '#f59e0b' : '#2f3336' }}
                                                                    title={isShort && !isRetired ? `Ordering ${l.designQty - l.orderedQty} fewer than design qty` : ''}
                                                                />
                                                            </td>
                                                            <td style={{ ...tdStyle, textAlign: 'right', padding: '4px 6px' }}>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    className="qty-input"
                                                                    value={l.receivedQty}
                                                                    onChange={e => updateLine(vk, l.id, { receivedQty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                                                                    style={{ ...inlineInputStyle, textAlign: 'right' }}
                                                                />
                                                            </td>
                                                            <td style={{ ...tdStyle, padding: '4px 6px' }}>
                                                                <select
                                                                    value={l.status}
                                                                    onChange={e => updateLine(vk, l.id, { status: e.target.value })}
                                                                    style={{ ...inlineInputStyle, color: sMeta.color, backgroundColor: sMeta.bg, fontWeight: '600', cursor: 'pointer' }}
                                                                >
                                                                    {LINE_STATUS_ORDER.map(k => <option key={k} value={k} style={{ backgroundColor: '#0f1419' }}>{LINE_STATUSES[k].label}</option>)}
                                                                </select>
                                                            </td>
                                                            <td style={{ ...tdStyle, padding: '4px 6px' }}>
                                                                <input
                                                                    type="text"
                                                                    value={l.poNumber || ''}
                                                                    onChange={e => updateLine(vk, l.id, { poNumber: e.target.value })}
                                                                    placeholder="—"
                                                                    style={inlineInputStyle}
                                                                />
                                                            </td>
                                                            <td style={{ ...tdStyle, padding: '4px 6px' }}>
                                                                <button onClick={() => deleteLine(vk, l.id)} style={{ ...styles.iconButton, color: '#6e767d', padding: '2px' }} title="Delete line"><Icons.X /></button>
                                                            </td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr style={{ borderBottom: '1px solid #2f3336', backgroundColor: '#0f1419' }}>
                                                                <td></td>
                                                                <td colSpan={6} style={{ padding: '8px 12px 12px' }}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                        <div>
                                                                            <label style={detailLabel}>Description</label>
                                                                            {isFieldAdd ? (
                                                                                <div style={{ color: '#6e767d', fontSize: '11px', fontStyle: 'italic' }}>edit in the row above</div>
                                                                            ) : (
                                                                                <div style={{ color: '#c9d1d9', fontSize: '12px', lineHeight: '1.4' }}>{l.description || <span style={{ color: '#6e767d', fontStyle: 'italic' }}>(none)</span>}</div>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: '70px 140px 100px 1fr', gap: '10px', alignItems: 'flex-start' }}>
                                                                            <div>
                                                                                <label style={detailLabel}>Design</label>
                                                                                <div style={{ color: isFieldAdd ? '#4a5568' : '#8b98a5', fontSize: '12px', padding: '4px 0' }}>{isFieldAdd ? '—' : l.designQty}</div>
                                                                            </div>
                                                                            <div>
                                                                                <label style={detailLabel}>Expected</label>
                                                                                <input type="date" value={l.expectedDate || ''} onChange={e => updateLine(vk, l.id, { expectedDate: e.target.value })} style={inlineInputStyle} />
                                                                            </div>
                                                                            <div>
                                                                                <label style={detailLabel}>Unit Cost</label>
                                                                                {isFieldAdd ? (
                                                                                    <input type="number" value={l.unitCost || 0} onChange={e => updateLine(vk, l.id, { unitCost: parseFloat(e.target.value) || 0 })} style={{ ...inlineInputStyle, textAlign: 'right' }} />
                                                                                ) : (
                                                                                    <div style={{ color: '#8b98a5', fontSize: '12px', padding: '4px 0' }}>{fmtCost(l.unitCost || 0)}</div>
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <label style={detailLabel}>Notes</label>
                                                                                <input type="text" value={l.notes || ''} onChange={e => updateLine(vk, l.id, { notes: e.target.value })} placeholder="Lead time, expediting, backorder ETA, RMA #..." style={inlineInputStyle} />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Add field item button */}
                                <div style={{ padding: '8px 14px', borderTop: '1px solid #2f3336' }}>
                                    <button
                                        onClick={() => addFieldLine(vk)}
                                        style={{ background: 'none', border: '1px dashed #2f3336', color: '#6e767d', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#8b98a5'; e.currentTarget.style.borderColor = '#3d4450'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#6e767d'; e.currentTarget.style.borderColor = '#2f3336'; }}
                                        title="Add an item not in the design BOM (rental, freight, substitution, on-site addition)"
                                    >
                                        <Icons.Plus /> Add field item
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

const metaLabel = { display: 'block', fontSize: '10px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '4px' };
const detailLabel = { display: 'block', fontSize: '10px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '3px' };
const thStyle = { padding: '6px 8px', textAlign: 'left', fontSize: '10px', color: '#6e767d', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' };
const tdStyle = { padding: '4px 8px', verticalAlign: 'middle' };
const inlineInputStyle = { width: '100%', padding: '4px 6px', backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '4px', color: '#e7e9ea', fontSize: '11px', outline: 'none', boxSizing: 'border-box' };
