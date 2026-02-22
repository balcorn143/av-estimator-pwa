import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';

export default function ColumnLayoutManager({ savedLayouts, onSave, onLoad, onDelete, onReset }) {
    const [showMenu, setShowMenu] = useState(false);
    const [newName, setNewName] = useState('');
    const menuRef = React.useRef(null);

    React.useEffect(() => {
        if (!showMenu) return;
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showMenu]);

    const handleSave = () => {
        if (newName.trim()) {
            onSave(newName.trim());
            setNewName('');
        }
    };

    return (
        <div style={{ position: 'relative', display: 'inline-block' }} ref={menuRef}>
            <button
                onClick={() => setShowMenu(!showMenu)}
                style={{ ...styles.iconButton, padding: '4px 6px', fontSize: '13px', color: '#8b98a5', border: '1px solid #30363d', borderRadius: '4px', backgroundColor: showMenu ? '#1d2d3d' : 'transparent' }}
                title="Column layouts"
            >⫶ Layouts</button>
            {showMenu && (
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 1000, backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '8px', minWidth: '220px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: '4px' }}>
                    <div style={{ fontSize: '11px', color: '#6e767d', marginBottom: '6px', textTransform: 'uppercase', fontWeight: '600' }}>Saved Layouts</div>
                    {savedLayouts.length === 0 && (
                        <div style={{ fontSize: '12px', color: '#6e767d', padding: '8px 0', fontStyle: 'italic' }}>No saved layouts</div>
                    )}
                    {savedLayouts.map(layout => (
                        <div key={layout.name} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                            <button
                                onClick={() => { onLoad(layout.name); setShowMenu(false); }}
                                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#e6edf3', fontSize: '13px', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1d2d3d'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >{layout.name}</button>
                            <button
                                onClick={() => onDelete(layout.name)}
                                style={{ background: 'none', border: 'none', color: '#6e767d', cursor: 'pointer', fontSize: '12px', padding: '4px 6px', borderRadius: '4px' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.backgroundColor = '#3d1a1a'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#6e767d'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                title={`Delete "${layout.name}"`}
                            >✕</button>
                        </div>
                    ))}
                    <div style={{ borderTop: '1px solid #30363d', marginTop: '6px', paddingTop: '8px', display: 'flex', gap: '4px' }}>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                            placeholder="Layout name..."
                            style={{ ...styles.inputSmall, flex: 1, fontSize: '12px', padding: '4px 8px', backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', color: '#e6edf3' }}
                        />
                        <button
                            onClick={handleSave}
                            disabled={!newName.trim()}
                            style={{ ...styles.smallButton, fontSize: '11px', padding: '4px 8px', backgroundColor: newName.trim() ? '#1a3d2e' : '#161b22', color: newName.trim() ? '#00ba7c' : '#6e767d', border: '1px solid #30363d' }}
                        >Save</button>
                    </div>
                    <button
                        onClick={() => { onReset(); setShowMenu(false); }}
                        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#8b98a5', fontSize: '12px', padding: '6px 8px', cursor: 'pointer', borderRadius: '4px', marginTop: '4px' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1d2d3d'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >↺ Reset to Default</button>
                </div>
            )}
        </div>
    );
}
