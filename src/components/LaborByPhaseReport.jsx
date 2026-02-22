import React from 'react';
const { useMemo } = React;
import * as XLSX from 'xlsx';
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtHrs } from '../utils/formatters';
import { getLocationsWithItems } from '../utils/locations';
import { getFlattenedItems } from '../utils/packages';

export default function LaborByPhaseReport({ locations, catalogPkgs, projectPkgs, hierarchyGroups }) {
    // Rows = locations/groups, Columns = phases
    const data = useMemo(() => {
        // Use hierarchy groups if provided, otherwise one row per leaf location (full path)
        const groups = hierarchyGroups || getLocationsWithItems(locations).map(loc => ({
            name: loc.path || loc.name,
            locations: [loc],
        }));
        // locationMap: { groupName: { phaseName: hours } }
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
                    // Include accessories
                    if (item.accessories) {
                        for (const acc of item.accessories) {
                            const accPhase = acc.phase || phase; // inherit parent phase if empty
                            const accHrs = (acc.qty || 0) * (acc.laborHrsPerUnit || 0);
                            phaseSet.add(accPhase);
                            locationMap[group.name][accPhase] = (locationMap[group.name][accPhase] || 0) + accHrs;
                        }
                    }
                }
            }
        }

        const phases = [...phaseSet].sort((a, b) => a === 'Unphased' ? 1 : b === 'Unphased' ? -1 : a.localeCompare(b));
        return { phases, locationMap, groupNames };
    }, [locations, catalogPkgs, projectPkgs, hierarchyGroups]);

    const exportLaborByPhase = () => {
        const { phases, locationMap, groupNames } = data;
        const header = ['Location', ...phases, 'Total'];
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
        // Column totals
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

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Labor by Phase
                </h3>
                <button style={styles.smallButton} onClick={exportLaborByPhase}><Icons.Download /> Export</button>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'auto' }}>
                    <thead>
                        <tr style={{ background: '#161b22' }}>
                            <th style={{ ...styles.th, minWidth: '200px' }}>Location</th>
                            {phases.map(phase => <th key={phase} style={{ ...styles.th, minWidth: '90px', textAlign: 'right' }}>{phase}</th>)}
                            <th style={{ ...styles.th, minWidth: '90px', textAlign: 'right', fontWeight: '700' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groupNames.map(gn => {
                            let rowTotal = 0;
                            return (
                                <tr key={gn} style={{ borderBottom: '1px solid #2f3336' }}>
                                    <td style={{ ...styles.td, fontWeight: '600', whiteSpace: 'nowrap' }}>{gn}</td>
                                    {phases.map(phase => {
                                        const hrs = locationMap[gn][phase] || 0;
                                        rowTotal += hrs;
                                        return <td key={phase} style={{ ...styles.td, textAlign: 'right' }}>{hrs > 0 ? fmtHrs(hrs) : '-'}</td>;
                                    })}
                                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600' }}>{fmtHrs(rowTotal)}</td>
                                </tr>
                            );
                        })}
                        <tr style={{ background: '#161b22', fontWeight: '700' }}>
                            <td style={{ ...styles.td }}>TOTAL</td>
                            {phases.map(phase => {
                                let colTotal = 0;
                                for (const gn of groupNames) colTotal += locationMap[gn][phase] || 0;
                                return <td key={phase} style={{ ...styles.td, textAlign: 'right' }}>{fmtHrs(colTotal)}</td>;
                            })}
                            <td style={{ ...styles.td, textAlign: 'right', color: '#1d9bf0' }}>{(() => { let gt = 0; for (const gn of groupNames) for (const phase of phases) gt += locationMap[gn][phase] || 0; return fmtHrs(gt); })()}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
