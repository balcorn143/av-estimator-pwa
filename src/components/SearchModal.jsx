import React from 'react';
const { useState, useEffect, useMemo, useRef } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';

export default function SearchModal({ catalog, packages, projectPackages, onClose, onInsert, onInsertPkg, replaceMode, replaceIsPackage }) {
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState([]);
    const [qty, setQty] = useState(1);
    const [tab, setTab] = useState(replaceIsPackage ? 'packages' : 'components');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterSubcategory, setFilterSubcategory] = useState('');
    const [filterManufacturer, setFilterManufacturer] = useState('');
    const searchRef = useRef(null);

    // Custom item state
    const [customItem, setCustomItem] = useState({
        manufacturer: '', model: '', partNumber: '', description: '',
        category: '', subcategory: '', unitCost: '', laborHrsPerUnit: '', uom: 'EA'
    });

    // Placeholder state
    const [phCategory, setPhCategory] = useState('');
    const [phSubcategory, setPhSubcategory] = useState('');
    const [phTier, setPhTier] = useState('mid');
    const [phDescription, setPhDescription] = useState('');

    const phSubcategories = useMemo(() => {
        if (!phCategory) return [];
        return [...new Set(catalog.filter(c => c.category === phCategory && !c.deleted && !c.discontinued).map(c => c.subcategory).filter(Boolean))].sort();
    }, [catalog, phCategory]);

    const phStats = useMemo(() => {
        if (!phCategory) return null;
        let items = catalog.filter(c => c.category === phCategory && !c.deleted && !c.discontinued && c.unitCost > 0);
        if (phSubcategory) items = items.filter(c => c.subcategory === phSubcategory);
        if (items.length === 0) return null;
        const costs = items.map(c => c.unitCost).sort((a, b) => a - b);
        const labors = items.map(c => c.laborHrsPerUnit || 0).sort((a, b) => a - b);
        const percentile = (arr, p) => {
            const idx = (arr.length - 1) * p;
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
        };
        return {
            count: items.length,
            items: items.sort((a, b) => a.unitCost - b.unitCost),
            low: { cost: percentile(costs, 0.25), labor: percentile(labors, 0.25) },
            mid: { cost: percentile(costs, 0.5), labor: percentile(labors, 0.5) },
            high: { cost: percentile(costs, 0.75), labor: percentile(labors, 0.75) },
            min: costs[0],
            max: costs[costs.length - 1],
        };
    }, [catalog, phCategory, phSubcategory]);

    const [showPhItems, setShowPhItems] = useState(false);

    // Get unique values for dropdowns
    const categories = useMemo(() => [...new Set(catalog.map(c => c.category))].sort(), [catalog]);
    const subcategories = useMemo(() => {
        const filtered = filterCategory ? catalog.filter(c => c.category === filterCategory) : catalog;
        return [...new Set(filtered.map(c => c.subcategory).filter(Boolean))].sort();
    }, [catalog, filterCategory]);
    const manufacturers = useMemo(() => [...new Set(catalog.map(c => c.manufacturer))].sort(), [catalog]);

    // Filter results
    const results = useMemo(() => {
        let filtered = catalog;

        // Apply dropdown filters
        if (filterCategory) filtered = filtered.filter(c => c.category === filterCategory);
        if (filterSubcategory) filtered = filtered.filter(c => c.subcategory === filterSubcategory);
        if (filterManufacturer) filtered = filtered.filter(c => c.manufacturer === filterManufacturer);

        // Apply text search (searches across all relevant fields)
        if (search.length >= 1) {
            const term = search.toLowerCase();
            filtered = filtered.filter(c =>
                (c.manufacturer?.toLowerCase().includes(term)) ||
                (c.model?.toLowerCase().includes(term)) ||
                (c.partNumber?.toLowerCase().includes(term)) ||
                (c.description?.toLowerCase().includes(term)) ||
                (c.category?.toLowerCase().includes(term)) ||
                (c.subcategory?.toLowerCase().includes(term))
            );
        }

        // Sort favorites first
        filtered.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
        return filtered.slice(0, 50);
    }, [catalog, search, filterCategory, filterSubcategory, filterManufacturer]);

    const allPkgs = useMemo(() => [
        ...(packages || []).map(p => ({ ...p, _scope: 'catalog' })),
        ...(projectPackages || []).map(p => ({ ...p, _scope: 'project' })),
    ], [packages, projectPackages]);
    const pkgResults = search.length >= 2 ? allPkgs.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : allPkgs;

    const toggle = (item, e) => {
        if (e.ctrlKey || e.metaKey) {
            setSelected(p => p.find(s => s.id === item.id) ? p.filter(s => s.id !== item.id) : [...p, item]);
        } else {
            setSelected([item]);
        }
    };

    const [addedFeedback, setAddedFeedback] = useState('');
    const [selectedPkgId, setSelectedPkgId] = useState(null);
    const insert = () => {
        if (selected.length > 0) {
            onInsert(selected, qty);
            setAddedFeedback(`Added ${selected.length} item${selected.length > 1 ? 's' : ''}`);
            setSelected([]);
            setTimeout(() => setAddedFeedback(''), 2000);
        }
    };
    const insertSelectedPkg = () => {
        const pkg = allPkgs.find(p => p.id === selectedPkgId);
        if (pkg) {
            onInsertPkg(pkg, qty);
            setAddedFeedback(`Added package: ${pkg.name}`);
            setSelectedPkgId(null);
            setTimeout(() => setAddedFeedback(''), 2000);
        }
    };

    const clearFilters = () => {
        setFilterCategory('');
        setFilterSubcategory('');
        setFilterManufacturer('');
        setSearch('');
        searchRef.current?.focus();
    };

    const hasFilters = filterCategory || filterSubcategory || filterManufacturer || search;

    // Handle Enter key to insert
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                if (tab === 'components' && selected.length > 0) {
                    e.preventDefault();
                    insert();
                } else if (tab === 'packages' && selectedPkgId) {
                    e.preventDefault();
                    insertSelectedPkg();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selected, qty, tab, selectedPkgId]);

    // Focus search on open
    useEffect(() => { searchRef.current?.focus(); }, []);

    const selectStyle = {
        ...styles.inputSmall,
        flex: 1,
        minWidth: '120px',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b98a5' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        paddingRight: '28px'
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '750px', maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icons.Search /> {replaceMode ? (replaceIsPackage ? 'Replace Package' : 'Replace Item') : 'Add Components'}
                    </h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {!replaceIsPackage && <button style={{ ...styles.smallButton, backgroundColor: tab === 'components' ? '#1d9bf0' : '#2f3336' }} onClick={() => setTab('components')}>
                            Components {tab === 'components' && `(${results.length})`}
                        </button>}
                        <button style={{ ...styles.smallButton, backgroundColor: tab === 'packages' ? '#1d9bf0' : '#2f3336' }} onClick={() => setTab('packages')}>
                            Packages ({pkgResults.length})
                        </button>
                        {!replaceMode && <>
                            <button style={{ ...styles.smallButton, backgroundColor: tab === 'placeholder' ? '#a78bfa' : '#2f3336' }} onClick={() => setTab('placeholder')}>
                                Placeholder
                            </button>
                            <button style={{ ...styles.smallButton, backgroundColor: tab === 'custom' ? '#00ba7c' : '#2f3336' }} onClick={() => setTab('custom')}>
                                <Icons.Plus /> Custom Item
                            </button>
                        </>}
                    </div>
                </div>

                {tab === 'components' && (
                    <>
                        {/* Filter Row */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                            <select value={filterManufacturer} onChange={e => setFilterManufacturer(e.target.value)} style={selectStyle}>
                                <option value="">All Manufacturers</option>
                                {manufacturers.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                            <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setFilterSubcategory(''); }} style={selectStyle}>
                                <option value="">All Categories</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select value={filterSubcategory} onChange={e => setFilterSubcategory(e.target.value)} style={selectStyle} disabled={!filterCategory && subcategories.length === 0}>
                                <option value="">All Subcategories</option>
                                {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {hasFilters && (
                                <button style={{ ...styles.smallButton, color: '#8b98a5' }} onClick={clearFilters}>
                                    <Icons.X /> Clear
                                </button>
                            )}
                        </div>

                        {/* Search Input */}
                        <div style={{ position: 'relative', marginBottom: '12px' }}>
                            <input
                                ref={searchRef}
                                type="text"
                                placeholder="Search by model, part number, description..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ ...styles.input, paddingLeft: '36px' }}
                            />
                            <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6e767d' }}>
                                <Icons.Search />
                            </div>
                        </div>
                    </>
                )}

                {tab === 'packages' && (
                    <input
                        type="text"
                        placeholder="Search packages..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ ...styles.input, marginBottom: '12px' }}
                        autoFocus
                    />
                )}

                {/* Results */}
                {tab === 'components' && (
                    <div style={{ ...styles.searchResults, maxHeight: '350px' }}>
                        {results.length > 0 ? results.map(item => {
                            const isSelected = selected.find(s => s.id === item.id);
                            const hasAccessories = item.defaultAccessories?.length > 0;
                            const accessoryItems = hasAccessories ? item.defaultAccessories.map(acc => catalog.find(c => c.id === acc.catalogId)).filter(Boolean) : [];

                            return (
                                <div key={item.id}
                                    style={{ ...styles.searchItem(isSelected), padding: '12px 14px' }}
                                    onClick={e => toggle(item, e)}
                                    onDoubleClick={() => { onInsert([item], qty); setAddedFeedback('Added 1 item'); setTimeout(() => setAddedFeedback(''), 2000); }}
                                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#1a1f26'; }}
                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: '600', marginBottom: '2px' }}>{item.favorite && <span style={{ color: '#f59e0b', marginRight: '4px' }}><Icons.Star filled /></span>}{item.manufacturer} <span style={{ color: '#1d9bf0' }}>{item.model}</span></div>
                                            <div style={{ fontSize: '12px', color: '#6e767d', marginBottom: '4px' }}>{item.partNumber}</div>
                                            <div style={{ fontSize: '13px', color: '#8b98a5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontWeight: '600', color: '#00ba7c' }}>{fmtCost(item.unitCost)}</div>
                                            <div style={{ fontSize: '12px', color: '#8b98a5' }}>{item.laborHrsPerUnit}h labor</div>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={styles.badge('blue')}>{item.category}</span>
                                        {item.subcategory && <span style={styles.badge('purple')}>{item.subcategory}</span>}
                                        {item.discontinued && <span style={styles.badge('red')}>Discontinued</span>}
                                        {hasAccessories && (
                                            <span style={{ ...styles.badge('orange'), display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Icons.Package /> {item.defaultAccessories.length} accessories
                                            </span>
                                        )}
                                    </div>
                                    {/* Show accessories preview when selected */}
                                    {isSelected && hasAccessories && (
                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #2f3336' }}>
                                            <div style={{ fontSize: '11px', color: '#6e767d', marginBottom: '4px' }}>Includes:</div>
                                            {accessoryItems.map((acc, idx) => (
                                                <div key={idx} style={{ fontSize: '12px', color: '#8b98a5', paddingLeft: '12px' }}>
                                                    └ {item.defaultAccessories[idx].qtyPer}x {acc.manufacturer} {acc.model}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }) : (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e767d' }}>
                                {hasFilters ? 'No components match your filters' : 'Start typing or select filters to search'}
                            </div>
                        )}
                    </div>
                )}

                {tab === 'packages' && (
                    <div style={{ ...styles.searchResults, maxHeight: '350px' }}>
                        {pkgResults.length > 0 ? pkgResults.map(pkg => {
                            const c = styles.pkgColor(pkg.name);
                            const cost = (pkg.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.unitCost || 0)), 0);
                            const isPkgSelected = selectedPkgId === pkg.id;
                            return (
                                <div key={pkg.id}
                                    style={{ ...styles.searchItem(isPkgSelected), backgroundColor: isPkgSelected ? '#1d3a5c' : c.bg, borderLeft: `3px solid ${isPkgSelected ? '#1d9bf0' : c.b}` }}
                                    onClick={() => setSelectedPkgId(prev => prev === pkg.id ? null : pkg.id)}
                                    onDoubleClick={() => { onInsertPkg(pkg, qty); setAddedFeedback(`Added package: ${pkg.name}`); setTimeout(() => setAddedFeedback(''), 2000); }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Icons.Package />
                                            <span style={{ fontWeight: '600' }}>{pkg.name}</span>
                                            <span style={styles.badge(pkg._scope === 'catalog' ? 'blue' : 'green')}>{pkg._scope === 'catalog' ? 'Catalog' : 'Project'}</span>
                                            <span style={styles.badge('green')}>{(pkg.items || []).length} items</span>
                                        </div>
                                        <div style={{ fontWeight: '600', color: '#00ba7c' }}>{fmtCost(cost)}</div>
                                    </div>
                                    {(pkg.items || []).length > 0 && (
                                        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #2f333640' }}>
                                            {pkg.items.slice(0, 4).map((item, i) => (
                                                <div key={i} style={{ fontSize: '12px', color: '#8b98a5', paddingLeft: '12px' }}>
                                                    └ {item.qtyPerPackage || item.qty || 1}x {item.manufacturer} {item.model}
                                                </div>
                                            ))}
                                            {pkg.items.length > 4 && <div style={{ fontSize: '11px', color: '#6e767d', paddingLeft: '12px' }}>+ {pkg.items.length - 4} more</div>}
                                        </div>
                                    )}
                                </div>
                            );
                        }) : (
                            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e767d' }}>No packages found</div>
                        )}
                    </div>
                )}

                {tab === 'placeholder' && (
                    <div style={{ padding: '4px 0' }}>
                        <p style={{ color: '#8b98a5', fontSize: '13px', marginBottom: '16px' }}>Add a budget placeholder based on catalog averages. Swap it for a real product later.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Category *</label>
                                <select value={phCategory} onChange={e => { setPhCategory(e.target.value); setPhSubcategory(''); }} style={{ ...styles.input, cursor: 'pointer' }}>
                                    <option value="">Select category...</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Subcategory</label>
                                <select value={phSubcategory} onChange={e => setPhSubcategory(e.target.value)} style={{ ...styles.input, cursor: 'pointer' }} disabled={!phCategory}>
                                    <option value="">All in category</option>
                                    {phSubcategories.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Description (optional)</label>
                                <input type="text" value={phDescription} onChange={e => setPhDescription(e.target.value)} style={styles.input} placeholder="e.g., 85 in. Display for Lobby" />
                            </div>
                        </div>

                        {phStats ? (
                            <>
                                <div style={{ fontSize: '12px', color: '#6e767d', marginBottom: '12px' }}>Based on {phStats.count} catalog item{phStats.count !== 1 ? 's' : ''} &bull; Range: {fmtCost(phStats.min)} &ndash; {fmtCost(phStats.max)}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                    {[
                                        { key: 'low', label: 'Low (25th %ile)', color: '#00ba7c' },
                                        { key: 'mid', label: 'Mid (Median)', color: '#1d9bf0' },
                                        { key: 'high', label: 'High (75th %ile)', color: '#f59e0b' },
                                    ].map(tier => (
                                        <div
                                            key={tier.key}
                                            style={{
                                                padding: '14px',
                                                backgroundColor: phTier === tier.key ? `${tier.color}15` : '#1a1f26',
                                                border: `2px solid ${phTier === tier.key ? tier.color : '#2f3336'}`,
                                                borderRadius: '10px',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                transition: 'all 0.15s',
                                            }}
                                            onClick={() => setPhTier(tier.key)}
                                        >
                                            <div style={{ fontSize: '11px', color: '#8b98a5', marginBottom: '6px', fontWeight: '500' }}>{tier.label}</div>
                                            <div style={{ fontSize: '20px', fontWeight: '700', color: tier.color }}>{fmtCost(phStats[tier.key].cost)}</div>
                                            <div style={{ fontSize: '11px', color: '#6e767d', marginTop: '4px' }}>{phStats[tier.key].labor.toFixed(2)}h labor</div>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    style={{ ...styles.smallButton, marginTop: '12px', color: '#8b98a5', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setShowPhItems(!showPhItems)}
                                >
                                    {showPhItems ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
                                    {showPhItems ? 'Hide' : 'Show'} {phStats.count} catalog items
                                </button>
                                {showPhItems && (
                                    <div style={{ maxHeight: '180px', overflowY: 'auto', marginTop: '8px', borderRadius: '8px', border: '1px solid #2f3336' }}>
                                        <table style={{ ...styles.table, fontSize: '12px' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ ...styles.th, padding: '6px 10px', fontSize: '11px' }}>Manufacturer</th>
                                                    <th style={{ ...styles.th, padding: '6px 10px', fontSize: '11px' }}>Model</th>
                                                    <th style={{ ...styles.th, padding: '6px 10px', fontSize: '11px', textAlign: 'right' }}>Cost</th>
                                                    <th style={{ ...styles.th, padding: '6px 10px', fontSize: '11px', textAlign: 'right' }}>Labor</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {phStats.items.map(item => (
                                                    <tr key={item.id}>
                                                        <td style={{ ...styles.td, padding: '4px 10px' }}>{item.manufacturer}</td>
                                                        <td style={{ ...styles.td, padding: '4px 10px', color: '#1d9bf0' }}>{item.model}</td>
                                                        <td style={{ ...styles.td, padding: '4px 10px', textAlign: 'right', color: '#00ba7c' }}>{fmtCost(item.unitCost)}</td>
                                                        <td style={{ ...styles.td, padding: '4px 10px', textAlign: 'right' }}>{item.laborHrsPerUnit}h</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        ) : phCategory ? (
                            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#6e767d' }}>No items with cost data found in this {phSubcategory ? 'subcategory' : 'category'}</div>
                        ) : (
                            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#6e767d' }}>Select a category to see budget tiers</div>
                        )}
                    </div>
                )}

                {tab === 'custom' && (
                    <div style={{ padding: '4px 0' }}>
                        <p style={{ color: '#8b98a5', fontSize: '13px', marginBottom: '16px' }}>Add a component that isn't in the catalog. Fill in the details below.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Manufacturer</label>
                                <input type="text" placeholder="e.g., Crestron" value={customItem.manufacturer} onChange={e => setCustomItem(p => ({ ...p, manufacturer: e.target.value }))} style={styles.input} autoFocus />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Model</label>
                                <input type="text" placeholder="e.g., DM-NVX-363" value={customItem.model} onChange={e => setCustomItem(p => ({ ...p, model: e.target.value }))} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Part Number</label>
                                <input type="text" placeholder="Optional" value={customItem.partNumber} onChange={e => setCustomItem(p => ({ ...p, partNumber: e.target.value }))} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Description</label>
                                <input type="text" placeholder="e.g., AV over IP Encoder" value={customItem.description} onChange={e => setCustomItem(p => ({ ...p, description: e.target.value }))} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Category</label>
                                <input type="text" placeholder="e.g., Switching" value={customItem.category} onChange={e => setCustomItem(p => ({ ...p, category: e.target.value }))} style={styles.input} list="custom-categories" />
                                <datalist id="custom-categories">{[...new Set(catalog.map(c => c.category))].sort().map(c => <option key={c} value={c} />)}</datalist>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Subcategory</label>
                                <input type="text" placeholder="Optional" value={customItem.subcategory} onChange={e => setCustomItem(p => ({ ...p, subcategory: e.target.value }))} style={styles.input} list="custom-subcategories" />
                                <datalist id="custom-subcategories">{[...new Set(catalog.map(c => c.subcategory).filter(Boolean))].sort().map(s => <option key={s} value={s} />)}</datalist>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Unit Cost ($)</label>
                                <input type="number" step="0.01" min="0" placeholder="0.00" value={customItem.unitCost} onChange={e => setCustomItem(p => ({ ...p, unitCost: e.target.value }))} onFocus={e => e.target.select()} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Labor Hours</label>
                                <input type="number" step="0.25" min="0" placeholder="0.00" value={customItem.laborHrsPerUnit} onChange={e => setCustomItem(p => ({ ...p, laborHrsPerUnit: e.target.value }))} onFocus={e => e.target.select()} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5' }}>Unit of Measure</label>
                                <select value={customItem.uom} onChange={e => setCustomItem(p => ({ ...p, uom: e.target.value }))} style={styles.input}>
                                    <option value="EA">EA (Each)</option>
                                    <option value="FT">FT (Foot)</option>
                                    <option value="LOT">LOT</option>
                                    <option value="HR">HR (Hour)</option>
                                    <option value="LS">LS (Lump Sum)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '14px', color: '#8b98a5' }}>Qty:</label>
                    <input
                        type="number"
                        value={qty}
                        onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                        onFocus={e => e.target.select()}
                        style={{ ...styles.inputSmall, width: '70px' }}
                        min="1"
                    />
                    <div style={{ flex: 1 }} />
                    {tab === 'components' && <span style={{ fontSize: '12px', color: '#6e767d' }}>
                        {selected.length > 0 && 'Press Enter to add • '}
                        Ctrl+Click for multi-select • Double-click to add • <kbd style={{ backgroundColor: '#2f3336', padding: '1px 5px', borderRadius: '3px', fontSize: '11px' }}>Ctrl+K</kbd> to open
                    </span>}
                    {tab === 'packages' && <span style={{ fontSize: '12px', color: '#6e767d' }}>
                        {selectedPkgId && 'Press Enter to add • '}
                        Double-click to add
                    </span>}
                    {addedFeedback && <span style={{ color: '#00ba7c', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><Icons.Check /> {addedFeedback}</span>}
                    <button style={styles.button('secondary')} onClick={onClose}>Close</button>
                    {tab === 'components' && (
                        <button
                            style={{ ...styles.button('primary'), opacity: selected.length === 0 ? 0.5 : 1 }}
                            onClick={insert}
                            disabled={selected.length === 0}>
                            <Icons.Plus /> Add
                        </button>
                    )}
                    {tab === 'packages' && (
                        <button
                            style={{ ...styles.button('primary'), opacity: !selectedPkgId ? 0.5 : 1 }}
                            onClick={insertSelectedPkg}
                            disabled={!selectedPkgId}>
                            <Icons.Plus /> Add
                        </button>
                    )}
                    {tab === 'placeholder' && (
                        <button
                            style={{ ...styles.button('primary'), backgroundColor: '#a78bfa', opacity: (!phCategory || !phStats) ? 0.5 : 1 }}
                            onClick={() => {
                                if (!phCategory || !phStats) return;
                                const tierData = phStats[phTier];
                                const tierLabel = phTier === 'low' ? 'Low' : phTier === 'mid' ? 'Mid' : 'High';
                                const item = {
                                    id: 'placeholder-' + Date.now(),
                                    manufacturer: 'Placeholder',
                                    model: `${tierLabel} ${phSubcategory || phCategory}`,
                                    partNumber: '',
                                    description: phDescription || `${tierLabel} budget ${phSubcategory || phCategory} placeholder`,
                                    category: phCategory,
                                    subcategory: phSubcategory || '',
                                    unitCost: Math.round(tierData.cost * 100) / 100,
                                    laborHrsPerUnit: Math.round(tierData.labor * 100) / 100,
                                    uom: 'EA',
                                    isPlaceholder: true,
                                };
                                onInsert([item], qty);
                                setAddedFeedback(`Added ${tierLabel} placeholder: ${fmtCost(tierData.cost)}`);
                                setTimeout(() => setAddedFeedback(''), 2000);
                            }}
                            disabled={!phCategory || !phStats}>
                            <Icons.Plus /> Add Placeholder
                        </button>
                    )}
                    {tab === 'custom' && (
                        <button
                            style={{ ...styles.button('success'), opacity: (!customItem.manufacturer && !customItem.model && !customItem.description) ? 0.5 : 1 }}
                            onClick={() => {
                                if (!customItem.manufacturer && !customItem.model && !customItem.description) return;
                                const item = {
                                    id: 'custom-' + Date.now(),
                                    manufacturer: customItem.manufacturer || 'Custom',
                                    model: customItem.model || '',
                                    partNumber: customItem.partNumber || '',
                                    description: customItem.description || '',
                                    category: customItem.category || 'Custom',
                                    subcategory: customItem.subcategory || '',
                                    unitCost: parseFloat(customItem.unitCost) || 0,
                                    laborHrsPerUnit: parseFloat(customItem.laborHrsPerUnit) || 0,
                                    uom: customItem.uom || 'EA',
                                    isCustom: true,
                                };
                                onInsert([item], qty);
                                setAddedFeedback('Added custom item');
                                setCustomItem({ manufacturer: '', model: '', partNumber: '', description: '', category: '', subcategory: '', unitCost: '', laborHrsPerUnit: '', uom: 'EA' });
                                setTimeout(() => setAddedFeedback(''), 2000);
                            }}
                            disabled={!customItem.manufacturer && !customItem.model && !customItem.description}>
                            <Icons.Plus /> Add Custom Item
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
