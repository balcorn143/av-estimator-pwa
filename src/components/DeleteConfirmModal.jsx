import React from 'react';
const { useState, useEffect } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';
import { calculateTotals } from '../utils/catalog';

export default function DeleteConfirmModal({ locations, onClose, onDelete, catalogPkgs, projectPkgs }) {
    // Support both single location and array of locations
    const locArray = Array.isArray(locations) ? locations : [locations];
    const totalStats = locArray.reduce((acc, loc) => {
        const t = calculateTotals(loc, catalogPkgs, projectPkgs);
        return {
            cost: acc.cost + t.cost,
            labor: acc.labor + t.labor,
            itemCount: acc.itemCount + t.itemCount,
            subCount: acc.subCount + (loc.children?.length || 0)
        };
    }, { cost: 0, labor: 0, itemCount: 0, subCount: 0 });

    const handleDelete = () => {
        locArray.forEach(loc => onDelete(loc.id));
        onClose();
    };

    // Handle Enter key to confirm
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleDelete();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [locArray]);

    const isSingle = locArray.length === 1;

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '450px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', color: '#f87171', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.Trash /> Delete {isSingle ? 'Location' : `${locArray.length} Locations`}
                </h2>
                {isSingle ? (
                    <p style={{ color: '#e7e9ea', fontSize: '15px', marginBottom: '16px' }}>Are you sure you want to delete <strong>"{locArray[0].name}"</strong>?</p>
                ) : (
                    <div style={{ marginBottom: '16px' }}>
                        <p style={{ color: '#e7e9ea', fontSize: '15px', marginBottom: '8px' }}>Are you sure you want to delete these locations?</p>
                        <div style={{ maxHeight: '120px', overflowY: 'auto', backgroundColor: '#0f1419', borderRadius: '8px', padding: '8px' }}>
                            {locArray.map(loc => (
                                <div key={loc.id} style={{ padding: '4px 8px', fontSize: '13px', color: '#8b98a5' }}>• {loc.name}</div>
                            ))}
                        </div>
                    </div>
                )}
                {(totalStats.subCount > 0 || totalStats.itemCount > 0) && (
                    <div style={{ backgroundColor: '#2d1a1a', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #5c2626' }}>
                        <div style={{ color: '#f87171', fontWeight: '600', marginBottom: '8px' }}>⚠️ This will also delete:</div>
                        <ul style={{ color: '#fca5a5', fontSize: '14px', marginLeft: '20px' }}>
                            {totalStats.subCount > 0 && <li>{totalStats.subCount} sublocation{totalStats.subCount > 1 ? 's' : ''}</li>}
                            {totalStats.itemCount > 0 && <li>{totalStats.itemCount} component{totalStats.itemCount > 1 ? 's' : ''} ({fmtCost(totalStats.cost)})</li>}
                        </ul>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#6e767d', marginRight: 'auto' }}>Press Enter to confirm</span>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button style={styles.button('danger')} onClick={handleDelete} autoFocus><Icons.Trash /> Delete{!isSingle ? ` (${locArray.length})` : ''}</button>
                </div>
            </div>
        </div>
    );
}
