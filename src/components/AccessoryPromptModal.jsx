import React from 'react';
const { useState, useEffect } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';

export default function AccessoryPromptModal({ component, accessories, qty, catalog, onConfirm, onClose }) {
    const [selectedAccessories, setSelectedAccessories] = useState(
        accessories.map(acc => ({ ...acc, included: true, qty: acc.qtyPer * qty }))
    );

    const toggleAccessory = (idx) => {
        setSelectedAccessories(prev => prev.map((acc, i) =>
            i === idx ? { ...acc, included: !acc.included } : acc
        ));
    };

    const updateAccessoryQty = (idx, newQty) => {
        setSelectedAccessories(prev => prev.map((acc, i) =>
            i === idx ? { ...acc, qty: Math.max(0, parseInt(newQty) || 0) } : acc
        ));
    };

    const handleConfirm = () => {
        const includedAccessories = selectedAccessories
            .filter(acc => acc.included && acc.qty > 0)
            .map(acc => {
                const catalogItem = catalog.find(c => c.id === acc.catalogId);
                return catalogItem ? { ...catalogItem, qty: acc.qty, qtyPer: acc.qtyPer } : null;
            })
            .filter(Boolean);
        onConfirm(includedAccessories);
    };

    // Enter to confirm
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedAccessories]);

    const totalAccessoryCost = selectedAccessories
        .filter(acc => acc.included)
        .reduce((sum, acc) => {
            const item = catalog.find(c => c.id === acc.catalogId);
            return sum + (item ? acc.qty * item.unitCost : 0);
        }, 0);

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '500px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.Package /> Include Accessories?
                </h2>
                <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '16px' }}>
                    <strong style={{ color: '#e7e9ea' }}>{component.manufacturer} {component.model}</strong> has default accessories. Select which to include:
                </p>

                <div style={{ backgroundColor: '#0f1419', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                    {selectedAccessories.map((acc, idx) => {
                        const catalogItem = catalog.find(c => c.id === acc.catalogId);
                        if (!catalogItem) return null;
                        return (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '8px',
                                backgroundColor: acc.included ? '#1a2e1a' : 'transparent',
                                borderRadius: '6px',
                                marginBottom: idx < selectedAccessories.length - 1 ? '8px' : 0
                            }}>
                                <input
                                    type="checkbox"
                                    checked={acc.included}
                                    onChange={() => toggleAccessory(idx)}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '500', color: acc.included ? '#e7e9ea' : '#6e767d' }}>
                                        {catalogItem.manufacturer} {catalogItem.model}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6e767d' }}>{catalogItem.description}</div>
                                </div>
                                <input
                                    type="number"
                                    value={acc.qty}
                                    onChange={e => updateAccessoryQty(idx, e.target.value)}
                                    style={{ ...styles.inputSmall, width: '60px' }}
                                    min="0"
                                    disabled={!acc.included}
                                />
                                <div style={{ width: '80px', textAlign: 'right', color: acc.included ? '#00ba7c' : '#6e767d' }}>
                                    {fmtCost(acc.qty * catalogItem.unitCost)}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {totalAccessoryCost > 0 && (
                    <div style={{ fontSize: '13px', color: '#8b98a5', marginBottom: '16px' }}>
                        Accessories total: <span style={{ color: '#00ba7c', fontWeight: '600' }}>{fmtCost(totalAccessoryCost)}</span>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#6e767d', marginRight: 'auto' }}>Press Enter to confirm</span>
                    <button style={styles.button('secondary')} onClick={() => onConfirm([])}>Skip All</button>
                    <button style={styles.button('primary')} onClick={handleConfirm}><Icons.Plus /> Add with Selected</button>
                </div>
            </div>
        </div>
    );
}
