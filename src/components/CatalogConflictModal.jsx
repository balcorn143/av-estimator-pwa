import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';

export default function CatalogConflictModal({ conflicts, onResolve, onClose }) {
    const [resolutions, setResolutions] = useState({}); // { itemId: 'local' | 'remote' }

    const resolveOne = (itemId, choice) => {
        setResolutions(prev => ({ ...prev, [itemId]: choice }));
    };

    const resolveAll = (choice) => {
        const all = {};
        conflicts.forEach(c => all[c.local.id] = choice);
        setResolutions(all);
    };

    const handleApply = () => {
        const resolved = conflicts.map(c => ({
            item: resolutions[c.local.id] === 'local' ? c.local : c.remote,
            choice: resolutions[c.local.id]
        }));
        onResolve(resolved);
    };

    const allResolved = conflicts.every(c => resolutions[c.local.id]);

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
        return Math.floor(diff / 86400000) + ' days ago';
    };

    const getChangedFields = (local, remote) => {
        const fields = ['manufacturer', 'model', 'partNumber', 'description', 'category', 'subcategory', 'unitCost', 'laborHrsPerUnit', 'uom', 'vendor', 'discontinued', 'phase'];
        return fields.filter(f => local[f] !== remote[f]);
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '800px', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icons.AlertTriangle style={{ color: '#f59e0b' }} /> Catalog Sync Conflicts
                </h2>
                <p style={{ color: '#8b98a5', margin: '0 0 20px 0' }}>
                    {conflicts.length} item{conflicts.length !== 1 ? 's were' : ' was'} modified both locally and remotely. Choose which version to keep.
                </p>

                <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: '16px' }}>
                    {conflicts.map(conflict => {
                        const changedFields = getChangedFields(conflict.local, conflict.remote);
                        const resolution = resolutions[conflict.local.id];

                        return (
                            <div key={conflict.local.id} style={{
                                backgroundColor: '#161b22',
                                borderRadius: '8px',
                                border: `1px solid ${resolution ? '#2ea043' : '#f59e0b'}`,
                                padding: '16px',
                                marginBottom: '12px'
                            }}>
                                <div style={{ fontWeight: '600', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{conflict.local.manufacturer} {conflict.local.model}</span>
                                    {resolution && <span style={{ ...styles.badge('green'), fontSize: '10px' }}><Icons.Check /> Resolved</span>}
                                </div>

                                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #30363d', color: '#8b98a5' }}>Field</th>
                                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #30363d', color: '#8b98a5' }}>Your Version</th>
                                            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #30363d', color: '#8b98a5' }}>Remote Version</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {changedFields.map(field => (
                                            <tr key={field}>
                                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #21262d', color: '#8b98a5', textTransform: 'capitalize' }}>{field.replace(/([A-Z])/g, ' $1')}</td>
                                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #21262d', backgroundColor: resolution === 'local' ? '#1a3d2e' : 'transparent' }}>
                                                    {typeof conflict.local[field] === 'boolean' ? (conflict.local[field] ? 'Yes' : 'No') :
                                                     field === 'unitCost' ? fmtCost(conflict.local[field]) :
                                                     String(conflict.local[field] || '-')}
                                                </td>
                                                <td style={{ padding: '6px 8px', borderBottom: '1px solid #21262d', backgroundColor: resolution === 'remote' ? '#1a3d2e' : 'transparent' }}>
                                                    {typeof conflict.remote[field] === 'boolean' ? (conflict.remote[field] ? 'Yes' : 'No') :
                                                     field === 'unitCost' ? fmtCost(conflict.remote[field]) :
                                                     String(conflict.remote[field] || '-')}
                                                </td>
                                            </tr>
                                        ))}
                                        <tr>
                                            <td style={{ padding: '6px 8px', color: '#6e767d' }}>Modified</td>
                                            <td style={{ padding: '6px 8px', color: '#6e767d' }}>{formatDate(conflict.local.modifiedAt)}</td>
                                            <td style={{ padding: '6px 8px', color: '#6e767d' }}>{formatDate(conflict.remote.modifiedAt)}</td>
                                        </tr>
                                    </tbody>
                                </table>

                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <button
                                        style={{ ...styles.smallButton, backgroundColor: resolution === 'local' ? '#238636' : '#21262d' }}
                                        onClick={() => resolveOne(conflict.local.id, 'local')}
                                    >
                                        Use Yours
                                    </button>
                                    <button
                                        style={{ ...styles.smallButton, backgroundColor: resolution === 'remote' ? '#238636' : '#21262d' }}
                                        onClick={() => resolveOne(conflict.local.id, 'remote')}
                                    >
                                        Use Remote
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', borderTop: '1px solid #2f3336', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={styles.smallButton} onClick={() => resolveAll('remote')}>Use All Remote</button>
                        <button style={styles.smallButton} onClick={() => resolveAll('local')}>Use All Yours</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={styles.button('secondary')} onClick={onClose}>Cancel Sync</button>
                        <button
                            style={{ ...styles.button('primary'), opacity: !allResolved ? 0.5 : 1 }}
                            disabled={!allResolved}
                            onClick={handleApply}
                        >
                            Apply Resolutions
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
