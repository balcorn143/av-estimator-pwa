import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';

export default function UomManagerModal({ uomOptions, onSave, onClose }) {
    const [items, setItems] = useState(() => uomOptions.map(u => ({ value: u, original: u })));
    const [newValue, setNewValue] = useState('');

    const updateItem = (idx, value) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, value } : it));
    };

    const removeItem = (idx) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const addItem = () => {
        const v = newValue.trim();
        if (!v) return;
        if (items.some(it => it.value.trim().toUpperCase() === v.toUpperCase())) {
            setNewValue('');
            return;
        }
        setItems(prev => [...prev, { value: v, original: null }]);
        setNewValue('');
    };

    const handleSave = () => {
        const cleaned = [];
        const seen = new Set();
        for (const it of items) {
            const v = it.value.trim();
            if (!v) continue;
            const key = v.toUpperCase();
            if (seen.has(key)) continue;
            seen.add(key);
            cleaned.push(v);
        }
        onSave(cleaned);
        onClose();
    };

    const inputStyle = { ...styles.input, flex: 1, marginBottom: 0 };
    const labelStyle = { display: 'block', marginBottom: '8px', fontSize: '12px', color: '#8b98a5', textTransform: 'uppercase' };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '460px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icons.Edit /> Manage Units of Measure
                </h2>
                <p style={{ margin: '0 0 16px 0', color: '#8b98a5', fontSize: '12px' }}>
                    Add, rename, or remove the UOM options used across the catalog. Removing a UOM does not change catalog items that already use it — they keep their stored value.
                </p>

                <label style={labelStyle}>Current Options</label>
                <div style={{ maxHeight: '320px', overflowY: 'auto', marginBottom: '16px' }}>
                    {items.length === 0 && (
                        <div style={{ color: '#6e767d', fontSize: '13px', padding: '8px 0' }}>No UOM options yet — add one below.</div>
                    )}
                    {items.map((it, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={it.value}
                                onChange={e => updateItem(idx, e.target.value)}
                                style={inputStyle}
                                placeholder="e.g., EA"
                            />
                            <button
                                style={{ ...styles.smallButton, backgroundColor: 'transparent', color: '#f87171' }}
                                onClick={() => removeItem(idx)}
                                title="Remove">
                                <Icons.Trash />
                            </button>
                        </div>
                    ))}
                </div>

                <label style={labelStyle}>Add New</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <input
                        type="text"
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                        style={inputStyle}
                        placeholder="e.g., PAIR"
                    />
                    <button style={styles.button('primary')} onClick={addItem}>
                        <Icons.Plus /> Add
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button style={styles.button('muted')} onClick={onClose}>Cancel</button>
                    <button style={styles.button('primary')} onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
}
