import React from 'react';
const { useState, useMemo } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost } from '../utils/formatters';
import { UOM_OPTIONS, PHASE_OPTIONS } from '../constants';
import { generateCatalogId } from '../utils/catalog';

export default function CatalogItemModal({ item, onClose, onSave, categories, catalog }) {
    const [form, setForm] = useState({
        manufacturer: item?.manufacturer || '',
        model: item?.model || '',
        partNumber: item?.partNumber || '',
        description: item?.description || '',
        category: item?.category || '',
        subcategory: item?.subcategory || '',
        unitCost: item?.unitCost || 0,
        laborHrsPerUnit: item?.laborHrsPerUnit || 0,
        uom: item?.uom || 'EA',
        vendor: item?.vendor || '',
        discontinued: item?.discontinued || false,
        phase: item?.phase || '',
        catalogNote: item?.catalogNote || '',
    });
    const [defaultAccessories, setDefaultAccessories] = useState(item?.defaultAccessories || []);
    const [accSearch, setAccSearch] = useState('');
    const [showAccSearch, setShowAccSearch] = useState(false);

    const accSearchResults = useMemo(() => {
        if (accSearch.length < 2 || !catalog) return [];
        const term = accSearch.toLowerCase();
        const currentId = item?.id;
        return catalog.filter(c =>
            c.id !== currentId && !c.deleted &&
            ((c.manufacturer?.toLowerCase().includes(term)) ||
             (c.model?.toLowerCase().includes(term)) ||
             (c.partNumber?.toLowerCase().includes(term)) ||
             (c.description?.toLowerCase().includes(term)))
        ).slice(0, 10);
    }, [catalog, accSearch, item?.id]);

    const addAccessory = (catItem) => {
        if (defaultAccessories.some(a => a.catalogId === catItem.id)) return;
        setDefaultAccessories(prev => [...prev, { catalogId: catItem.id, qtyPer: 1 }]);
        setAccSearch('');
        setShowAccSearch(false);
    };

    const removeAccessory = (catalogId) => {
        setDefaultAccessories(prev => prev.filter(a => a.catalogId !== catalogId));
    };

    const updateAccQty = (catalogId, newQty) => {
        setDefaultAccessories(prev => prev.map(a => a.catalogId === catalogId ? { ...a, qtyPer: Math.max(1, parseInt(newQty) || 1) } : a));
    };

    const [newCategory, setNewCategory] = useState('');
    const [newSubcategory, setNewSubcategory] = useState('');
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [showNewSubcategory, setShowNewSubcategory] = useState(false);

    const existingCategories = [...new Set(categories.map(c => c.category).concat(form.category ? [form.category] : []))].filter(Boolean).sort();
    const existingSubcategories = [...new Set(categories.filter(c => c.category === form.category).map(c => c.subcategory).concat(form.subcategory ? [form.subcategory] : []))].filter(Boolean).sort();

    const handleSubmit = () => {
        if (!form.manufacturer.trim() || !form.model.trim()) return;
        onSave({
            ...item,
            ...form,
            defaultAccessories: defaultAccessories.length > 0 ? defaultAccessories : undefined,
            id: item?.id || generateCatalogId(),
            modifiedAt: new Date().toISOString(),
        });
        onClose();
    };

    const inputStyle = { ...styles.input, marginBottom: '12px' };
    const labelStyle = { display: 'block', marginBottom: '4px', fontSize: '12px', color: '#8b98a5', textTransform: 'uppercase' };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '700px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '700' }}>
                    {item ? 'Edit Catalog Item' : 'Add New Catalog Item'}
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={labelStyle}>Manufacturer *</label>
                        <input type="text" value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} style={inputStyle} placeholder="e.g., Samsung" autoFocus />
                    </div>
                    <div>
                        <label style={labelStyle}>Model *</label>
                        <input type="text" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} style={inputStyle} placeholder="e.g., QM85C" />
                    </div>
                    <div>
                        <label style={labelStyle}>Part Number</label>
                        <input type="text" value={form.partNumber} onChange={e => setForm({ ...form, partNumber: e.target.value })} style={inputStyle} placeholder="e.g., LH85QMCEBGCXXS" />
                    </div>
                    <div>
                        <label style={labelStyle}>Vendor</label>
                        <input type="text" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} style={inputStyle} placeholder="e.g., AVDomotics" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Description</label>
                        <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputStyle} placeholder="e.g., 85&quot; 4K UHD Display" />
                    </div>
                    <div>
                        <label style={labelStyle}>Category</label>
                        {showNewCategory ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="New category name" autoFocus />
                                <button style={styles.smallButton} onClick={() => { setForm({ ...form, category: newCategory, subcategory: '' }); setShowNewCategory(false); }}>Add</button>
                                <button style={styles.smallButton} onClick={() => setShowNewCategory(false)}>Cancel</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value, subcategory: '' })} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                                    <option value="">Select category...</option>
                                    {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button style={styles.smallButton} onClick={() => setShowNewCategory(true)}><Icons.Plus /></button>
                            </div>
                        )}
                    </div>
                    <div>
                        <label style={labelStyle}>Subcategory</label>
                        {showNewSubcategory ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input type="text" value={newSubcategory} onChange={e => setNewSubcategory(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="New subcategory name" autoFocus />
                                <button style={styles.smallButton} onClick={() => { setForm({ ...form, subcategory: newSubcategory }); setShowNewSubcategory(false); }}>Add</button>
                                <button style={styles.smallButton} onClick={() => setShowNewSubcategory(false)}>Cancel</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <select value={form.subcategory} onChange={e => setForm({ ...form, subcategory: e.target.value })} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                                    <option value="">Select subcategory...</option>
                                    {existingSubcategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button style={styles.smallButton} onClick={() => setShowNewSubcategory(true)}><Icons.Plus /></button>
                            </div>
                        )}
                    </div>
                    <div>
                        <label style={labelStyle}>Unit Cost ($)</label>
                        <input type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: parseFloat(e.target.value) || 0 })} onFocus={e => e.target.select()} style={inputStyle} min="0" step="0.01" />
                    </div>
                    <div>
                        <label style={labelStyle}>Labor Hours</label>
                        <input type="number" value={form.laborHrsPerUnit} onChange={e => setForm({ ...form, laborHrsPerUnit: parseFloat(e.target.value) || 0 })} onFocus={e => e.target.select()} style={inputStyle} min="0" step="0.25" />
                    </div>
                    <div>
                        <label style={labelStyle}>Unit of Measure</label>
                        <select value={form.uom} onChange={e => setForm({ ...form, uom: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                            {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Phase</label>
                        <select value={form.phase} onChange={e => setForm({ ...form, phase: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="">Select phase...</option>
                            {PHASE_OPTIONS.map(p => <option key={p.value} value={p.label}>{p.label}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" checked={form.discontinued} onChange={e => setForm({ ...form, discontinued: e.target.checked })} id="discontinued" />
                        <label htmlFor="discontinued" style={{ fontSize: '14px', color: '#8b98a5', cursor: 'pointer' }}>Discontinued</label>
                    </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                    <label style={labelStyle}>Catalog Note</label>
                    <textarea value={form.catalogNote} onChange={e => setForm({ ...form, catalogNote: e.target.value })} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} placeholder="e.g., Replacement: Samsung QM85R" />
                </div>

                {/* Default Accessories */}
                {catalog && (
                    <div style={{ marginTop: '12px', padding: '16px', backgroundColor: '#161b22', borderRadius: '8px', border: '1px solid #2f3336' }}>
                        <label style={{ ...labelStyle, marginBottom: '8px' }}>Default Accessories</label>
                        <p style={{ fontSize: '12px', color: '#6e767d', margin: '0 0 12px 0' }}>Items added automatically when this component is inserted into a project.</p>
                        {defaultAccessories.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                {defaultAccessories.map(acc => {
                                    const catItem = catalog.find(c => c.id === acc.catalogId);
                                    return (
                                        <div key={acc.catalogId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', backgroundColor: '#1a1f26', borderRadius: '6px', marginBottom: '4px', border: '1px solid #2f3336' }}>
                                            <input
                                                type="number"
                                                min="1"
                                                value={acc.qtyPer}
                                                onChange={e => updateAccQty(acc.catalogId, e.target.value)}
                                                onFocus={e => e.target.select()}
                                                style={{ ...styles.inputSmall, width: '50px', textAlign: 'center' }}
                                            />
                                            <span style={{ fontSize: '12px', color: '#6e767d' }}>x</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '13px', color: '#e7e9ea', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {catItem ? `${catItem.manufacturer} ${catItem.model}` : `Unknown (${acc.catalogId})`}
                                                </div>
                                                {catItem && <div style={{ fontSize: '11px', color: '#6e767d' }}>{catItem.description}</div>}
                                            </div>
                                            {catItem && <span style={{ fontSize: '12px', color: '#00ba7c', flexShrink: 0 }}>{fmtCost(catItem.unitCost)}</span>}
                                            <button
                                                style={{ ...styles.iconButton, color: '#f87171', padding: '4px', flexShrink: 0 }}
                                                onClick={() => removeAccessory(acc.catalogId)}
                                                title="Remove accessory">
                                                <Icons.X />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {showAccSearch ? (
                            <div>
                                <input
                                    type="text"
                                    value={accSearch}
                                    onChange={e => setAccSearch(e.target.value)}
                                    placeholder="Search catalog for accessory..."
                                    style={{ ...inputStyle, marginBottom: '8px' }}
                                    autoFocus
                                />
                                {accSearchResults.length > 0 && (
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #2f3336', borderRadius: '6px' }}>
                                        {accSearchResults.map(c => (
                                            <div
                                                key={c.id}
                                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #2f3336', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                onClick={() => addAccessory(c)}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1a1f26'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                            >
                                                <div>
                                                    <span style={{ fontWeight: '600' }}>{c.manufacturer}</span> <span style={{ color: '#1d9bf0' }}>{c.model}</span>
                                                    <div style={{ fontSize: '11px', color: '#6e767d' }}>{c.description}</div>
                                                </div>
                                                <span style={{ color: '#00ba7c', fontSize: '12px', flexShrink: 0, marginLeft: '12px' }}>{fmtCost(c.unitCost)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                    <button style={styles.smallButton} onClick={() => { setShowAccSearch(false); setAccSearch(''); }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button style={{ ...styles.smallButton, color: '#1d9bf0' }} onClick={() => setShowAccSearch(true)}>
                                <Icons.Plus /> Add Accessory
                            </button>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px', borderTop: '1px solid #2f3336', paddingTop: '20px' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button
                        style={{ ...styles.button('primary'), opacity: (!form.manufacturer.trim() || !form.model.trim()) ? 0.5 : 1 }}
                        disabled={!form.manufacturer.trim() || !form.model.trim()}
                        onClick={handleSubmit}
                    >
                        {item ? 'Save Changes' : 'Add to Catalog'}
                    </button>
                </div>
            </div>
        </div>
    );
}
