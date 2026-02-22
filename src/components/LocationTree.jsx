import React from 'react'
const { useState, useEffect, useMemo } = React
import { styles } from '../styles'
import { Icons } from '../icons'
import { fmtCost } from '../utils/formatters'
import { formatHours } from '../utils/formatters'
import { calculateTotals } from '../utils/catalog'
import { filterLocations } from '../utils/locations'

export default function LocationTree({ locations, selectedId, onSelect, onDelete, onRename, onDuplicate, onMoveUp, onMoveDown, onPromote, onDemote, multiSelect, onMultiSelectToggle, depth = 0, searchTerm, expandedState, onToggleExpand, catalogPkgs, projectPkgs }) {
    const [contextMenu, setContextMenu] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const toggle = (id, e) => { e.stopPropagation(); onToggleExpand(id); };

    const filteredLocations = useMemo(() => filterLocations(locations, searchTerm), [locations, searchTerm]);

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu]);

    const handleContextMenu = (e, loc) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, location: loc });
    };

    const handleClick = (loc, e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            // Shift/Ctrl+click toggles multi-select (event passed for shift-range)
            onMultiSelectToggle(loc, e);
        } else {
            onSelect(loc);
        }
    };

    const startRename = (loc) => {
        setEditingId(loc.id);
        setEditName(loc.name);
        setContextMenu(null);
    };

    const confirmRename = (loc) => {
        if (editName.trim() && editName.trim() !== loc.name) {
            onRename(loc.id, editName.trim());
        }
        setEditingId(null);
        setEditName('');
    };

    const cancelRename = () => {
        setEditingId(null);
        setEditName('');
    };

    if (filteredLocations.length === 0 && searchTerm) {
        return <div style={{ padding: '20px', textAlign: 'center', color: '#6e767d', fontSize: '13px' }}>No locations match "{searchTerm}"</div>;
    }

    return (
        <div>
            {filteredLocations.map(loc => {
                const has = loc.children?.length > 0;
                const exp = expandedState[loc.id];
                const sel = selectedId === loc.id;
                const isMultiSelected = multiSelect.some(l => l.id === loc.id);
                const totals = calculateTotals(loc, catalogPkgs, projectPkgs);
                const nameMatch = searchTerm && loc.name.toLowerCase().includes(searchTerm.toLowerCase());
                const isHovered = hoveredId === loc.id;
                const highlighted = sel || isMultiSelected;
                const isEditing = editingId === loc.id;
                return (
                    <div key={loc.id}>
                        <div style={{
                            ...styles.treeItem(depth, highlighted),
                            backgroundColor: isMultiSelected ? '#3d1a1a' : sel ? '#1d3a5c' : nameMatch ? '#2d2a1a' : 'transparent',
                            borderColor: isMultiSelected ? '#f87171' : sel ? '#1d9bf0' : 'transparent',
                            position: 'relative'
                        }}
                            onClick={e => !isEditing && handleClick(loc, e)}
                            onContextMenu={e => handleContextMenu(e, loc)}
                            onMouseEnter={e => { setHoveredId(loc.id); if (!highlighted && !nameMatch) e.currentTarget.style.backgroundColor = '#1a1f26'; }}
                            onMouseLeave={e => { setHoveredId(null); if (!highlighted) e.currentTarget.style.backgroundColor = nameMatch ? '#2d2a1a' : 'transparent'; }}>
                            {has ? <span onClick={e => { e.stopPropagation(); toggle(loc.id, e); }} style={{ cursor: 'pointer', display: 'flex' }}>{exp ? <Icons.ChevronDown /> : <Icons.ChevronRight />}</span> : <span style={{ width: 14 }} />}
                            {depth === 0 ? <Icons.Location /> : <Icons.Sublocation />}
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    onBlur={() => confirmRename(loc)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') confirmRename(loc);
                                        if (e.key === 'Escape') cancelRename();
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    style={{ ...styles.inputSmall, width: '100px', padding: '2px 6px', fontSize: '13px' }}
                                    autoFocus
                                />
                            ) : (
                                <span
                                    style={{ fontWeight: highlighted ? '600' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isHovered ? '100px' : '120px' }}
                                    onDoubleClick={e => { e.stopPropagation(); startRename(loc); }}
                                >
                                    {loc.name}
                                </span>
                            )}
                            {totals.itemCount > 0 && !isHovered && !isEditing && (
                                <div style={styles.treeItemTotals}>
                                    <span style={{ color: '#00ba7c' }}>{fmtCost(totals.cost)}</span>
                                    <span style={{ color: '#1d9bf0' }}>{formatHours(totals.labor)}</span>
                                </div>
                            )}
                            {isHovered && !isEditing && (
                                <button
                                    style={{ ...styles.iconButton, marginLeft: 'auto', color: '#f87171', padding: '4px' }}
                                    onClick={e => { e.stopPropagation(); onDelete(loc); }}
                                    title="Delete location">
                                    <Icons.Trash />
                                </button>
                            )}
                        </div>
                        {has && exp && <LocationTree locations={loc.children} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onRename={onRename} onDuplicate={onDuplicate} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onPromote={onPromote} onDemote={onDemote} multiSelect={multiSelect} onMultiSelectToggle={onMultiSelectToggle} depth={depth + 1} searchTerm={searchTerm} expandedState={expandedState} onToggleExpand={onToggleExpand} catalogPkgs={catalogPkgs} projectPkgs={projectPkgs} />}
                    </div>
                );
            })}

            {/* Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    left: contextMenu.x,
                    top: contextMenu.y,
                    backgroundColor: '#1a1f26',
                    border: '1px solid #2f3336',
                    borderRadius: '8px',
                    padding: '4px',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    minWidth: '160px'
                }}>
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '8px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#e6edf3',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '13px'
                        }}
                        onClick={() => startRename(contextMenu.location)}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Icons.Edit /> Rename
                    </button>
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '8px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#ffad1f',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '13px'
                        }}
                        onClick={() => { onDuplicate(contextMenu.location); setContextMenu(null); }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#3d2e1a'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Icons.Duplicate /> Duplicate
                    </button>
                    <div style={{ borderTop: '1px solid #2f3336', margin: '4px 0' }} />
                    <div style={{ padding: '4px 12px', fontSize: '10px', color: '#6e767d', textTransform: 'uppercase' }}>Move</div>
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#8b98a5',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}
                        onClick={() => { onMoveUp(contextMenu.location.id); setContextMenu(null); }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Icons.ChevronUp /> Move Up
                    </button>
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#8b98a5',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}
                        onClick={() => { onMoveDown(contextMenu.location.id); setContextMenu(null); }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Icons.ChevronDown /> Move Down
                    </button>
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#8b98a5',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}
                        onClick={() => { onPromote(contextMenu.location.id); setContextMenu(null); }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Icons.ChevronsUp /> Promote (Level)
                    </button>
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '6px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#8b98a5',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}
                        onClick={() => { onDemote(contextMenu.location.id); setContextMenu(null); }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2f3336'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Icons.ChevronsDown /> Demote (Level)
                    </button>
                    <div style={{ borderTop: '1px solid #2f3336', margin: '4px 0' }} />
                    <button
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            width: '100%',
                            padding: '8px 12px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: '#f87171',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '13px'
                        }}
                        onClick={() => { onDelete(contextMenu.location); setContextMenu(null); }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#3d1a1a'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Icons.Trash /> Delete
                    </button>
                </div>
            )}
        </div>
    );
}
