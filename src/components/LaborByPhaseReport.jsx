import React from 'react';
const { useState, useMemo } = React;
import * as XLSX from 'xlsx';
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtHrs } from '../utils/formatters';
import { getLocationsWithItems } from '../utils/locations';
import { getFlattenedItems } from '../utils/packages';
import { PHASE_OPTIONS } from '../constants';

const phaseLabel = (phase) => PHASE_OPTIONS.find(p => p.value === phase)?.label || phase;

export default function LaborByPhaseReport({ locations, catalogPkgs, projectPkgs, hierarchyGroups, compactMode }) {
    const [collapsed, setCollapsed] = useState(false);
    const compact = compactMode;
    const [sortField, setSortField] = useState(null); // 'location' | phase name | 'total'
    const [sortDir, setSortDir] = useState('asc');
    const [search, setSearch] = useState('');
    const [phaseFilter, setPhaseFilter] = useState('');

    // Rows = locations/groups, Columns = phases
    const data = useMemo(() => {
        const groups = hierarchyGroups || getLocationsWithItems(locations).map(loc => ({
            name: loc.path || loc.name,
            locations: [loc],
        }));
        const locationMap = {};
        const groupNames = groups.map(g => g.name);
        const phaseSet = new Set();

        for (const group of groups) {
            if (!locationMap[group.name]) locationMap[group.name] = {};
            for (const loc of group.locations) {
                const flatItems = getFlattenedItems(loc, catalogPkgs, projectPkgs);
                for (const item of flatItems) {
                    const phase = item.phase || 'Unphased';
                    const hrs = (item.qty || 0) * (item.laborHrsPerUnit || 0);
                    phaseSet.add(phase);
                    locationMap[group.name][phase] = (locationMap[group.name][phase] || 0) + hrs;
                    if (item.accessories) {
                        for (const acc of item.accessories) {
                            const accPhase = acc.phase || phase;
                            const accHrs = (acc.qty || 0) * (acc.laborHrsPerUnit || 0);
                            phaseSet.add(accPhase);
                            locationMap[group.name][accPhase] = (locationMap[group.name][accPhase] || 0) + accHrs;
                        }
                    }
                }
            }
        }

        const PHASE_ORDER = ['Rough-In 27-41 00', 'Trim Out 27-41 23', 'Finish 27-41 33', 'Programming 27-41 17', 'Management 27-41 16'];
        const phases = [...phaseSet].sort((a, b) => {
            if (a === 'Unphased') return 1;
            if (b === 'Unphased') return -1;
            const ai = PHASE_ORDER.indexOf(a);
            const bi = PHASE_ORDER.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
        });
        return { phases, locationMap, groupNames };
    }, [locations, catalogPkgs, projectPkgs, hierarchyGroups]);

    const exportLaborByPhase = () => {
        const { phases, locationMap, groupNames } = data;
        const header = ['Location', ...phases.map(phaseLabel), 'Total'];
        const rows = groupNames.map(gn => {
            const row = [gn];
            let total = 0;
            for (const phase of phases) {
                const hrs = locationMap[gn][phase] || 0;
                row.push(Math.round(hrs * 100) / 100);
                total += hrs;
            }
            row.push(Math.round(total * 100) / 100);
            return row;
        });
        const totalsRow = ['TOTAL'];
        let grandTotal = 0;
        for (const phase of phases) {
            let colTotal = 0;
            for (const gn of groupNames) colTotal += locationMap[gn][phase] || 0;
            totalsRow.push(Math.round(colTotal * 100) / 100);
            grandTotal += colTotal;
        }
        totalsRow.push(Math.round(grandTotal * 100) / 100);
        const wsData = [header, ...rows, totalsRow];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Labor by Phase');
        XLSX.writeFile(wb, 'Labor by Phase.xlsx');
    };

    const { phases, locationMap, groupNames } = data;
    if (phases.length === 0) return <p style={{ color: '#8b98a5', fontSize: '13px' }}>No labor data found. Add items with labor hours to see the breakdown.</p>;

    // Determine visible phases
    const visiblePhases = phaseFilter ? phases.filter(p => p === phaseFilter) : phases;

    // Filter + sort rows
    let visibleRows = groupNames;
    if (search.length >= 2) {
        const term = search.toLowerCase();
        visibleRows = visibleRows.filter(gn => gn.toLowerCase().includes(term));
    }

    const handleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    if (sortField) {
        visibleRows = [...visibleRows].sort((a, b) => {
            let aVal, bVal;
            if (sortField === 'location') { aVal = a.toLowerCase(); bVal = b.toLowerCase(); }
            else if (sortField === 'total') {
                aVal = visiblePhases.reduce((s, p) => s + (locationMap[a][p] || 0), 0);
                bVal = visiblePhases.reduce((s, p) => s + (locationMap[b][p] || 0), 0);
            } else {
                aVal = locationMap[a][sortField] || 0;
                bVal = locationMap[b][sortField] || 0;
            }
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Grand total for header summary
    let grandTotal = 0;
    for (const gn of groupNames) for (const p of phases) grandTotal += locationMap[gn][p] || 0;

    const SortIcon = ({ field }) => {
        if (sortField !== field) return null;
        return sortDir === 'asc' ? <Icons.ChevronUp /> : <Icons.ChevronDown />;
    };

    const tdStyle = { ...styles.td, ...(compact ? { padding: '4px 8px', fontSize: '11px' } : {}) };
    const thStyle = { ...styles.th, ...(compact ? { padding: '6px 8px', fontSize: '10px' } : {}), cursor: 'pointer' };

    return (
        <div>
            {/* Header with collapse toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? '0' : '12px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setCollapsed(v => !v)}>
                    <span style={{ display: 'flex', transition: 'transform 0.15s' }}>{collapsed ? <Icons.ChevronRight /> : <Icons.ChevronDown />}</span>
                    Labor by Phase
                    <span style={{ fontSize: '13px', color: '#8b98a5', fontWeight: '400' }}>({groupNames.length} locations — {fmtHrs(grandTotal)})</span>
                </h3>
                {!collapsed && (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button style={styles.smallButton} onClick={exportLaborByPhase}><Icons.Download /> Export</button>
                    </div>
                )}
            </div>

            {!collapsed && (
                <>
                    {/* Search + Phase filter */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
                            <input
                                type="text"
                                placeholder="Search locations..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ ...styles.inputSmall, width: '100%', paddingLeft: '32px' }}
                            />
                            <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6e767d' }}><Icons.Search /></div>
                            {search && <button style={{ ...styles.iconButton, position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)' }} onClick={() => setSearch('')}><Icons.X /></button>}
                        </div>
                        {phases.length > 1 && (
                            <select value={phaseFilter} onChange={e => setPhaseFilter(e.target.value)} style={{ ...styles.inputSmall, width: 'auto', cursor: 'pointer' }}>
                                <option value="">All Phases</option>
                                {phases.map(p => <option key={p} value={p}>{phaseLabel(p)}</option>)}
                            </select>
                        )}
                        {(search || phaseFilter) && (
                            <span style={{ fontSize: '12px', color: '#8b98a5' }}>{visibleRows.length} of {groupNames.length} locations</span>
                        )}
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? '11px' : '13px', tableLayout: 'auto' }}>
                            <thead>
                                <tr style={{ background: '#161b22' }}>
                                    <th style={{ ...thStyle, minWidth: '200px' }} onClick={() => handleSort('location')}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Location<SortIcon field="location" /></span>
                                    </th>
                                    {visiblePhases.map(phase => (
                                        <th key={phase} style={{ ...thStyle, minWidth: '90px', textAlign: 'right' }} onClick={() => handleSort(phase)}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', width: '100%' }}>{phaseLabel(phase)}<SortIcon field={phase} /></span>
                                        </th>
                                    ))}
                                    <th style={{ ...thStyle, minWidth: '90px', textAlign: 'right', fontWeight: '700' }} onClick={() => handleSort('total')}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', width: '100%' }}>Total<SortIcon field="total" /></span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(gn => {
                                    let rowTotal = 0;
                                    return (
                                        <tr key={gn} style={{ borderBottom: '1px solid #2f3336' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e2d3d'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <td style={{ ...tdStyle, fontWeight: '600', whiteSpace: 'nowrap' }}>{gn}</td>
                                            {visiblePhases.map(phase => {
                                                const hrs = locationMap[gn][phase] || 0;
                                                rowTotal += hrs;
                                                return <td key={phase} style={{ ...tdStyle, textAlign: 'right' }}>{hrs > 0 ? fmtHrs(hrs) : '-'}</td>;
                                            })}
                                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>{fmtHrs(rowTotal)}</td>
                                        </tr>
                                    );
                                })}
                                <tr style={{ background: '#161b22', fontWeight: '700' }}>
                                    <td style={tdStyle}>TOTAL</td>
                                    {visiblePhases.map(phase => {
                                        let colTotal = 0;
                                        for (const gn of visibleRows) colTotal += locationMap[gn][phase] || 0;
                                        return <td key={phase} style={{ ...tdStyle, textAlign: 'right' }}>{fmtHrs(colTotal)}</td>;
                                    })}
                                    <td style={{ ...tdStyle, textAlign: 'right', color: '#1d9bf0' }}>{(() => { let gt = 0; for (const gn of visibleRows) for (const p of visiblePhases) gt += locationMap[gn][p] || 0; return fmtHrs(gt); })()}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
