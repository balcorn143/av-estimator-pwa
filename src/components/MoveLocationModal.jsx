import React from 'react'
const { useState } = React
import { styles } from '../styles'
import { Icons } from '../icons'

function flattenWithDepth(locations, depth = 0) {
    const result = [];
    for (const loc of locations) {
        result.push({ ...loc, depth });
        if (loc.children?.length > 0) {
            result.push(...flattenWithDepth(loc.children, depth + 1));
        }
    }
    return result;
}

function getDescendantIds(location) {
    const ids = new Set([location.id]);
    const walk = (children) => {
        if (!children) return;
        for (const child of children) {
            ids.add(child.id);
            walk(child.children);
        }
    };
    walk(location.children);
    return ids;
}

export default function MoveLocationModal({ locations, movingLocations, onMove, onClose }) {
    const [selectedTarget, setSelectedTarget] = useState('__top__');
    const [collapsed, setCollapsed] = useState({});

    // Get all IDs that should be disabled (the moving locations and their descendants)
    const disabledIds = new Set();
    for (const loc of movingLocations) {
        for (const id of getDescendantIds(loc)) {
            disabledIds.add(id);
        }
    }

    // Build the flat list, respecting collapsed state
    const buildVisibleList = (locs, depth = 0) => {
        const result = [];
        for (const loc of locs) {
            result.push({ id: loc.id, name: loc.name, depth, hasChildren: loc.children?.length > 0 });
            if (loc.children?.length > 0 && !collapsed[loc.id]) {
                result.push(...buildVisibleList(loc.children, depth + 1));
            }
        }
        return result;
    };

    const visibleList = buildVisibleList(locations);

    const toggleCollapse = (id) => {
        setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const movingNames = movingLocations.map(l => l.name).join(', ');

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.card, maxWidth: '480px', width: '90%', padding: '24px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icons.Location /> Move to...
                </h3>
                <div style={{ fontSize: '12px', color: '#8b98a5', marginBottom: '16px' }}>
                    Moving: <strong style={{ color: '#e7e9ea' }}>{movingNames}</strong>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #2f3336', borderRadius: '8px', marginBottom: '16px' }}>
                    {/* Top Level option */}
                    <div
                        onClick={() => setSelectedTarget('__top__')}
                        style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: selectedTarget === '__top__' ? '#1d3a5c' : 'transparent',
                            borderBottom: '1px solid #2f3336',
                            fontSize: '13px',
                            fontWeight: '600',
                            color: selectedTarget === '__top__' ? '#e7e9ea' : '#8b98a5',
                        }}
                        onMouseEnter={e => { if (selectedTarget !== '__top__') e.currentTarget.style.backgroundColor = '#1a1f26'; }}
                        onMouseLeave={e => { if (selectedTarget !== '__top__') e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <Icons.Layers /> Top Level (Root)
                    </div>

                    {visibleList.map(loc => {
                        const isDisabled = disabledIds.has(loc.id);
                        const isSelected = selectedTarget === loc.id;
                        return (
                            <div
                                key={loc.id}
                                onClick={() => { if (!isDisabled) setSelectedTarget(loc.id); }}
                                style={{
                                    padding: '8px 12px',
                                    paddingLeft: `${12 + loc.depth * 20}px`,
                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    backgroundColor: isSelected ? '#1d3a5c' : 'transparent',
                                    borderBottom: '1px solid #2f3336',
                                    fontSize: '13px',
                                    opacity: isDisabled ? 0.35 : 1,
                                    color: isSelected ? '#e7e9ea' : '#8b98a5',
                                }}
                                onMouseEnter={e => { if (!isDisabled && !isSelected) e.currentTarget.style.backgroundColor = '#1a1f26'; }}
                                onMouseLeave={e => { if (!isDisabled && !isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                {loc.hasChildren ? (
                                    <span onClick={e => { e.stopPropagation(); toggleCollapse(loc.id); }} style={{ cursor: 'pointer', display: 'flex' }}>
                                        {collapsed[loc.id] ? <Icons.ChevronRight /> : <Icons.ChevronDown />}
                                    </span>
                                ) : (
                                    <span style={{ width: 14 }} />
                                )}
                                {loc.depth === 0 ? <Icons.Location /> : <Icons.Sublocation />}
                                <span style={{ fontWeight: isSelected ? '600' : '400' }}>{loc.name}</span>
                                {isDisabled && <span style={{ fontSize: '10px', color: '#6e767d', marginLeft: 'auto' }}>(self)</span>}
                            </div>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button style={styles.button('primary')} onClick={() => onMove(selectedTarget === '__top__' ? null : selectedTarget)}>
                        Move Here
                    </button>
                </div>
            </div>
        </div>
    );
}
