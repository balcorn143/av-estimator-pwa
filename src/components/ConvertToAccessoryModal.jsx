import React from 'react';
const { useState, useEffect } = React;
import { styles } from '../styles';
import { Icons } from '../icons';

export default function ConvertToAccessoryModal({ items, itemIdx, onConfirm, onClose }) {
    const [selectedParent, setSelectedParent] = useState(null);
    const itemToConvert = items[itemIdx];

    const handleConfirm = () => {
        if (selectedParent !== null) {
            onConfirm(itemIdx, selectedParent);
        }
    };

    // Enter to confirm
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && selectedParent !== null) { e.preventDefault(); handleConfirm(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedParent]);

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '450px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.ChevronDown /> Convert to Accessory
                </h2>
                <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '16px' }}>
                    Select the parent item for <strong style={{ color: '#e7e9ea' }}>{itemToConvert.manufacturer} {itemToConvert.model}</strong>:
                </p>

                <div style={{ backgroundColor: '#0f1419', borderRadius: '8px', padding: '8px', marginBottom: '16px', maxHeight: '300px', overflowY: 'auto' }}>
                    {items.map((item, idx) => {
                        if (idx === itemIdx) return null; // Can't be parent of itself
                        return (
                            <div
                                key={idx}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    backgroundColor: selectedParent === idx ? '#1d3a5c' : 'transparent',
                                    border: selectedParent === idx ? '1px solid #1d9bf0' : '1px solid transparent',
                                    marginBottom: '4px'
                                }}
                                onClick={() => setSelectedParent(idx)}>
                                <div style={{ fontWeight: '500' }}>{item.manufacturer} <span style={{ color: '#1d9bf0' }}>{item.model}</span></div>
                                <div style={{ fontSize: '12px', color: '#6e767d' }}>{item.description}</div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button
                        style={{ ...styles.button('primary'), opacity: selectedParent === null ? 0.5 : 1 }}
                        onClick={handleConfirm}
                        disabled={selectedParent === null}>
                        Convert
                    </button>
                </div>
            </div>
        </div>
    );
}
