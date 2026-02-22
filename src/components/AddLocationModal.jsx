import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { parseLocationInput } from '../utils/locations';

export default function AddLocationModal({ parent, isTopLevel, onClose, onAdd }) {
    const [input, setInput] = useState('');
    const parsed = parseLocationInput(input);
    const handleSubmit = () => { if (parsed.length > 0) { onAdd(parsed, parent?.id || null); onClose(); } };
    const title = isTopLevel ? 'Add Locations' : `Add Sublocations to "${parent?.name}"`;
    const placeholder = isTopLevel ? 'Level 1\nLevel 2\nLevel 3\n\nOr use ranges: Building 1-5' : 'Area A\nArea B\nConference Room 101-110';

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        // Shift+Enter allows normal newline behavior
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '550px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>{isTopLevel ? <Icons.Location /> : <Icons.Sublocation />} {title}</h2>
                <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '4px' }}>Enter one name per line. Use ranges like "Room 101-110" to create multiple.</p>
                <p style={{ color: '#6e767d', fontSize: '12px', marginBottom: '20px' }}>Press <kbd style={{ backgroundColor: '#2f3336', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Enter</kbd> to add, <kbd style={{ backgroundColor: '#2f3336', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Shift+Enter</kbd> for new line</p>
                <div>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={styles.textarea}
                        placeholder={placeholder}
                        autoFocus
                    />
                    {parsed.length > 0 && (
                        <div style={styles.preview}>
                            <div style={{ fontSize: '12px', color: '#8b98a5', marginBottom: '8px', fontWeight: '600' }}>Preview ({parsed.length} items):</div>
                            {parsed.slice(0, 20).map((name, i) => (<div key={i} style={styles.previewItem}>{isTopLevel ? <Icons.Location /> : <Icons.Sublocation />}{name}</div>))}
                            {parsed.length > 20 && <div style={{ ...styles.previewItem, color: '#6e767d', fontStyle: 'italic' }}>...and {parsed.length - 20} more</div>}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button type="button" style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                        <button type="button" style={{ ...styles.button('primary'), opacity: parsed.length === 0 ? 0.5 : 1 }} disabled={parsed.length === 0} onClick={handleSubmit}>Add {parsed.length > 0 ? `${parsed.length}` : ''}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
