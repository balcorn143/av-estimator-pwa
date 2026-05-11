import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { parseLocationInput } from '../utils/locations';

export default function DuplicateModal({ location, onClose, onDuplicate }) {
    const [input, setInput] = useState('');
    const [includeItems, setIncludeItems] = useState(true);
    const parsed = parseLocationInput(input);
    const handleSubmit = () => { if (parsed.length > 0) { onDuplicate(location, parsed, includeItems); onClose(); } };
    const subCount = location.children?.length || 0;
    const itemCount = countAllItems(location);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Count all items in location and children
    function countAllItems(loc) {
        let count = loc.items?.length || 0;
        if (loc.children) {
            loc.children.forEach(child => count += countAllItems(child));
        }
        return count;
    }

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '550px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}><Icons.Duplicate /> Duplicate Location</h2>
                <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '16px' }}>Create copies of <strong style={{ color: '#e7e9ea' }}>"{location.name}"</strong>{subCount > 0 ? ` with its ${subCount} sublocation${subCount !== 1 ? 's' : ''}` : ''}{itemCount > 0 ? ` and ${itemCount} component${itemCount !== 1 ? 's' : ''}` : ''}.</p>

                {itemCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '12px', backgroundColor: '#161b22', borderRadius: '8px', border: '1px solid #2f3336' }}>
                        <input
                            type="checkbox"
                            id="includeItems"
                            checked={includeItems}
                            onChange={e => setIncludeItems(e.target.checked)}
                            style={{ width: '18px', height: '18px' }}
                        />
                        <label htmlFor="includeItems" style={{ fontSize: '14px', color: '#e7e9ea', cursor: 'pointer', flex: 1 }}>
                            Include components ({itemCount} item{itemCount !== 1 ? 's' : ''})
                        </label>
                    </div>
                )}

                <p style={{ color: '#6e767d', fontSize: '12px', marginBottom: '16px' }}>Press <kbd style={{ backgroundColor: '#2f3336', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Enter</kbd> to duplicate, <kbd style={{ backgroundColor: '#2f3336', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>Shift+Enter</kbd> for new line</p>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#8b98a5' }}>New names:</label>
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        style={{ ...styles.textarea, minHeight: '100px' }}
                        placeholder="Level 2&#10;Level 3&#10;&#10;Or: Level 2-10"
                        autoFocus
                    />
                    {parsed.length > 0 && (
                        <div style={styles.preview}>
                            <div style={{ fontSize: '12px', color: '#8b98a5', marginBottom: '8px', fontWeight: '600' }}>Will create {parsed.length} copies:</div>
                            {parsed.slice(0, 10).map((name, i) => (<div key={i} style={styles.previewItem}><Icons.Location /> {name} {subCount > 0 && <span style={{ color: '#6e767d' }}>({subCount} sublocations)</span>}{includeItems && itemCount > 0 && <span style={{ color: '#00ba7c' }}> + {itemCount} items</span>}</div>))}
                            {parsed.length > 10 && <div style={{ ...styles.previewItem, color: '#6e767d', fontStyle: 'italic' }}>...and {parsed.length - 10} more</div>}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button type="button" style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                        <button type="button" style={{ ...styles.button('warning'), opacity: parsed.length === 0 ? 0.5 : 1 }} disabled={parsed.length === 0} onClick={handleSubmit}><Icons.Duplicate /> Duplicate {parsed.length > 0 ? `(${parsed.length})` : ''}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
