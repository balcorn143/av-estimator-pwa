// Default catalog with new sync-ready structure
export const DEFAULT_CATALOG = [
    // Displays - with mount and cable accessories
    { id: 'cat-001', manufacturer: 'Samsung', model: 'QM85C', partNumber: 'LH85QMCEBGCXXS', description: '85" 4K UHD Display', category: 'Displays', subcategory: 'Commercial Displays', unitCost: 4500, laborHrsPerUnit: 2, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-005', qtyPer: 1 }, { catalogId: 'cat-020', qtyPer: 1 }] },
    { id: 'cat-002', manufacturer: 'Samsung', model: 'QM75C', partNumber: 'LH75QMCEBGCXXS', description: '75" 4K UHD Display', category: 'Displays', subcategory: 'Commercial Displays', unitCost: 3200, laborHrsPerUnit: 2, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-005', qtyPer: 1 }, { catalogId: 'cat-020', qtyPer: 1 }] },
    { id: 'cat-003', manufacturer: 'Samsung', model: 'QM65C', partNumber: 'LH65QMCEBGCXXS', description: '65" 4K UHD Display', category: 'Displays', subcategory: 'Commercial Displays', unitCost: 2100, laborHrsPerUnit: 1.5, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-006', qtyPer: 1 }, { catalogId: 'cat-020', qtyPer: 1 }] },
    { id: 'cat-004', manufacturer: 'LG', model: '86UL3J', partNumber: '86UL3J-B', description: '86" 4K UHD Display', category: 'Displays', subcategory: 'Commercial Displays', unitCost: 3800, laborHrsPerUnit: 2, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-005', qtyPer: 1 }, { catalogId: 'cat-020', qtyPer: 1 }] },
    // Mounts
    { id: 'cat-005', manufacturer: 'Chief', model: 'XTM1U', partNumber: 'XTM1U', description: 'Large Tilt Wall Mount', category: 'Mounts', subcategory: 'Wall Mounts', unitCost: 350, laborHrsPerUnit: 1, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    { id: 'cat-006', manufacturer: 'Chief', model: 'LTM1U', partNumber: 'LTM1U', description: 'Medium Tilt Wall Mount', category: 'Mounts', subcategory: 'Wall Mounts', unitCost: 275, laborHrsPerUnit: 0.75, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    // Control
    { id: 'cat-007', manufacturer: 'Crestron', model: 'TSW-1070', partNumber: '6510814', description: '10" Touch Panel', category: 'Control', subcategory: 'Touch Panels', unitCost: 2800, laborHrsPerUnit: 1.5, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    { id: 'cat-008', manufacturer: 'Crestron', model: 'TSW-770', partNumber: '6510813', description: '7" Touch Panel', category: 'Control', subcategory: 'Touch Panels', unitCost: 2200, laborHrsPerUnit: 1, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    // Audio
    { id: 'cat-009', manufacturer: 'Shure', model: 'MXA920', partNumber: 'MXA920AL', description: 'Ceiling Array Microphone', category: 'Audio', subcategory: 'Microphones', unitCost: 3200, laborHrsPerUnit: 2, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-022', qtyPer: 1 }] },
    { id: 'cat-010', manufacturer: 'Biamp', model: 'TesiraFORTE AI', partNumber: 'TESIRA-FORTE-AI', description: 'AVB DSP with AEC', category: 'Audio', subcategory: 'DSP', unitCost: 4500, laborHrsPerUnit: 4, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    // Video Conferencing
    { id: 'cat-011', manufacturer: 'Logitech', model: 'Rally Bar', partNumber: '960-001308', description: 'Video Conferencing Bar', category: 'Video Conferencing', subcategory: 'Video Bars', unitCost: 2999, laborHrsPerUnit: 1, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-021', qtyPer: 1 }] },
    { id: 'cat-012', manufacturer: 'Logitech', model: 'Rally Bar Mini', partNumber: '960-001336', description: 'Compact Video Bar', category: 'Video Conferencing', subcategory: 'Video Bars', unitCost: 1999, laborHrsPerUnit: 0.75, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-021', qtyPer: 1 }] },
    { id: 'cat-013', manufacturer: 'Poly', model: 'Studio X50', partNumber: '2200-86270-001', description: 'Video Bar', category: 'Video Conferencing', subcategory: 'Video Bars', unitCost: 2495, laborHrsPerUnit: 1, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    // Switching
    { id: 'cat-014', manufacturer: 'Extron', model: 'DTP CrossPoint 108', partNumber: '60-1515-01', description: '10x8 4K Matrix Switcher', category: 'Switching', subcategory: 'Matrix Switchers', unitCost: 8500, laborHrsPerUnit: 4, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    // Infrastructure
    { id: 'cat-015', manufacturer: 'Middle Atlantic', model: 'WRK-44-32', partNumber: 'WRK-44-32', description: '44U AV Rack', category: 'Infrastructure', subcategory: 'Racks', unitCost: 1200, laborHrsPerUnit: 4, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    // Speakers - with cable accessories
    { id: 'cat-016', manufacturer: 'JBL', model: 'Control 26CT', partNumber: '?"', description: '6.5" Ceiling Speaker', category: 'Audio', subcategory: 'Speakers', unitCost: 195, laborHrsPerUnit: 0.5, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-019', qtyPer: 30 }] },
    // Cisco
    { id: 'cat-017', manufacturer: 'Cisco', model: 'Room Kit Pro', partNumber: 'CS-KITPRO-K9', description: 'Video Conferencing System', category: 'Video Conferencing', subcategory: 'Room Systems', unitCost: 12500, laborHrsPerUnit: 4, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    { id: 'cat-018', manufacturer: 'Cisco', model: 'Board Pro 75', partNumber: 'CS-BOARDPRO75', description: '75" Interactive Display', category: 'Video Conferencing', subcategory: 'Interactive Displays', unitCost: 15000, laborHrsPerUnit: 3, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z', defaultAccessories: [{ catalogId: 'cat-005', qtyPer: 1 }] },
    // Cables & Accessories
    { id: 'cat-019', manufacturer: 'Generic', model: 'Speaker Wire', partNumber: 'SPK-WIRE-FT', description: 'Speaker Wire (per foot)', category: 'Cables', subcategory: 'Speaker Cable', unitCost: 0.50, laborHrsPerUnit: 0.01, uom: 'FT', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    { id: 'cat-020', manufacturer: 'Generic', model: 'HDMI 6ft', partNumber: 'HDMI-6FT', description: 'HDMI Cable 6ft', category: 'Cables', subcategory: 'Video Cable', unitCost: 25, laborHrsPerUnit: 0.1, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    { id: 'cat-021', manufacturer: 'Generic', model: 'Cat6 10ft', partNumber: 'CAT6-10FT', description: 'Cat6 Ethernet Cable 10ft', category: 'Cables', subcategory: 'Network Cable', unitCost: 15, laborHrsPerUnit: 0.1, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    { id: 'cat-022', manufacturer: 'Shure', model: 'A920-HCM', partNumber: 'A920-HCM', description: 'Hard Ceiling Mount Kit', category: 'Mounts', subcategory: 'Ceiling Mounts', unitCost: 85, laborHrsPerUnit: 0.25, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
    { id: 'cat-023', manufacturer: 'Chief', model: 'PAC526', partNumber: 'PAC526', description: 'Hardware Kit / Screw Pack', category: 'Accessories', subcategory: 'Hardware', unitCost: 45, laborHrsPerUnit: 0, uom: 'EA', vendor: '', discontinued: false, phase: '', modifiedAt: '2024-01-01T00:00:00Z' },
];

// Unit of Measure options
export const UOM_OPTIONS = ['EA', 'FT', 'M', 'PR', 'SET', 'BOX', 'ROLL', 'LOT'];
export const SYSTEM_OPTIONS = ['Audio', 'Video', 'Control', 'Infrastructure'];
export const PHASE_OPTIONS = [
    { value: '27-41 00', label: 'Rough-In 27-41 00' },
    { value: '27-41 23', label: 'Trim Out 27-41 23' },
    { value: '27-41 33', label: 'Finish 27-41 33' },
    { value: '27-41 16', label: 'Management 27-41 16' },
    { value: '27-41 17', label: 'Programming 27-41 17' },
];

export const PROJECT_STATUSES = {
    developing: { label: 'Developing', color: '#f59e0b', bg: '#3d2e1a' },
    'proposal-submitted': { label: 'Proposal Submitted', color: '#a78bfa', bg: '#2d1a3d' },
    active: { label: 'Active', color: '#1d9bf0', bg: '#1d3a5c' },
    completed: { label: 'Completed', color: '#00ba7c', bg: '#1a3d2e' },
    lost: { label: 'Lost', color: '#f87171', bg: '#3d1a1a' },
    archived: { label: 'Archived', color: '#6e767d', bg: '#1a1f26' },
};

export const DEFAULT_COLUMNS = [
    { id: 'checkbox', label: '', width: 40, fixed: true },
    { id: 'expand', label: '', width: 30, fixed: true },
    { id: 'qty', label: 'Qty', width: 75 },
    { id: 'notes', label: 'Notes', width: 120 },
    { id: 'system', label: 'System', width: 100 },
    { id: 'manufacturer', label: 'Manufacturer', width: 120 },
    { id: 'model', label: 'Model', width: 140 },
    { id: 'description', label: 'Description', width: 200 },
    { id: 'unitCost', label: 'Unit Cost', width: 80 },
    { id: 'unitLabor', label: 'Unit Labor', width: 80 },
    { id: 'extCost', label: 'Ext. Cost', width: 90 },
    { id: 'extLabor', label: 'Ext. Labor', width: 80 },
];

export const CATALOG_COLUMNS = [
    { id: 'checkbox', label: '', width: 36, fixed: true },
    { id: 'manufacturer', label: 'Manufacturer', width: 130 },
    { id: 'model', label: 'Model', width: 120 },
    { id: 'partNumber', label: 'Part #', width: 130 },
    { id: 'description', label: 'Description', width: 220 },
    { id: 'category', label: 'Category', width: 110 },
    { id: 'subcategory', label: 'Subcategory', width: 120 },
    { id: 'unitCost', label: 'Cost', width: 90 },
    { id: 'laborHrsPerUnit', label: 'Labor', width: 75 },
    { id: 'uom', label: 'UOM', width: 60 },
    { id: 'vendor', label: 'Vendor', width: 110 },
    { id: 'phase', label: 'Phase', width: 90 },
    { id: 'discontinued', label: 'Discontinued', width: 100 },
    { id: 'catalogNote', label: 'Note', width: 160 },
    { id: 'favorite', label: '\u2605', width: 40 },
    { id: 'actions', label: 'Actions', width: 80, fixed: true },
];

export const ALL_LOC_COLUMNS = [
    { id: 'checkbox', label: '', width: 40, fixed: true },
    { id: 'expand', label: '', width: 30, fixed: true },
    { id: 'qty', label: 'Qty', width: 75 },
    { id: 'notes', label: 'Notes', width: 120 },
    { id: 'system', label: 'System', width: 100 },
    { id: 'manufacturer', label: 'Manufacturer', width: 120 },
    { id: 'model', label: 'Model', width: 140 },
    { id: 'description', label: 'Description', width: 200 },
    { id: 'unitCost', label: 'Unit $', width: 80 },
    { id: 'unitLabor', label: 'Unit Hrs', width: 70 },
    { id: 'extCost', label: 'Ext. $', width: 90 },
    { id: 'extLabor', label: 'Ext. Hrs', width: 80 },
];
