import React from 'react';
const { useState, useEffect } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';

export default function AddAccessoryModal({ item, catalog, onConfirm, onClose }) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [qty, setQty] = useState(1);

    const results = search.length >= 1 ? catalog.filter(c =>
        (c.manufacturer?.toLowerCase().includes(search.toLowerCase())) ||
        (c.model?.toLowerCase().includes(search.toLowerCase())) ||
        (c.partNumber?.toLowerCase().includes(search.toLowerCase())) ||
        (c.description?.toLowerCase().includes(search.toLowerCase()))
    ).slice(0, 20) : [];

    const handleConfirm = () => {
        if (selected) {
            onConfirm({ ...selected, qty, qtyPer: qty });
        }
    };

    // Enter to confirm
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && selected) { e.preventDefault(); handleConfirm(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selected, qty]);

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '550px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.Plus /> Add Accessory
                </h2>
                <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '16px' }}>
                    Add accessory to <strong style={{ color: '#e7e9ea' }}>{item.manufacturer} {item.model}</strong>
                </p>

                <input
                    type="text"
                    placeholder="Search components..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={styles.input}
                    autoFocus
                />

                <div style={{ ...styles.searchResults, maxHeight: '250px', marginTop: '12px' }}>
                    {results.length > 0 ? results.map(c => (
                        <div
                            key={c.id}
                            style={{
                                ...styles.searchItem(selected?.id === c.id),
                                padding: '10px 12px'
                            }}
                            onClick={() => setSelected(c)}
                            onMouseEnter={e => { if (selected?.id !== c.id) e.currentTarget.style.backgroundColor = '#1a1f26'; }}
                            onMouseLeave={e => { if (selected?.id !== c.id) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: '500' }}>{c.manufacturer} <span style={{ color: '#1d9bf0' }}>{c.model}</span></div>
                                    <div style={{ fontSize: '12px', color: '#6e767d' }}>{c.description}</div>
                                </div>
                                <div style={{ color: '#00ba7c', fontWeight: '600' }}>{fmtCost(c.unitCost)}</div>
                            </div>
                        </div>
                    )) : search.length >= 1 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#6e767d' }}>No results</div>
                    ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#6e767d' }}>Type to search</div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
                    <label style={{ fontSize: '14px', color: '#8b98a5' }}>Qty:</label>
                    <input
                        type="number"
                        value={qty}
                        onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ ...styles.inputSmall, width: '70px' }}
                        min="1"
                    />
                    <div style={{ flex: 1 }} />
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button
                        style={{ ...styles.button('primary'), opacity: !selected ? 0.5 : 1 }}
                        onClick={handleConfirm}
                        disabled={!selected}>
                        <Icons.Plus /> Add Accessory
                    </button>
                </div>
            </div>
        </div>
    );
}
