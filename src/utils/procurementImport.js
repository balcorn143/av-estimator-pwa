// Import a purchasing-marked-up BOM (XLSX/CSV) back into the PM procurement
// tab. Purchasing takes the exported BOM, works it, and hands back a sheet
// with real quantities, PO numbers and notes on it. This module turns that
// sheet into a set of proposed changes against the existing procurement
// lines — nothing is applied until the PM confirms in the preview modal.
//
// The parser is deliberately forgiving: purchasing sheets carry a title
// block above the header row, merged cells, "$" formatting, a TOTAL footer,
// and column names that drift between templates. We locate the header row by
// scoring, then map columns by alias.

import * as XLSX from 'xlsx';
import { deriveStatus } from './procurement';

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------- columns

// Header aliases, most-specific first — a header is assigned to the first
// field whose alias list matches it, so 'total cost' must be tested before
// 'cost'. Anything unrecognized (e.g. ABL #) is simply carried as unmapped
// and ignored.
const COLUMN_ALIASES = [
    ['poNumber',     ['po #', 'po#', 'po number', 'po no', 'purchase order', 'purchase order #']],
    ['poNotes',      ['po notes', 'po note', 'purchasing notes', 'purchasing note', 'buyer notes']],
    ['pmNotes',      ['pm notes', 'pm note', 'project notes', 'notes', 'note', 'comments']],
    ['receivedQty',  ['received', 'received qty', 'qty received', 'rec qty', 'rcvd', 'rcvd qty', 'qty rcvd', 'delivered']],
    ['orderedQty',   ['qty', 'quantity', 'qty ordered', 'ordered qty', 'order qty', 'qty ord']],
    ['manufacturer', ['manufacturer', 'mfr', 'mfg', 'make', 'brand']],
    ['vendor',       ['supplier', 'vendor', 'distributor', 'source']],
    ['partNumber',   ['part number', 'part no', 'part #', 'part num', 'partnumber', 'mfr part number', 'manufacturer part number', 'sku', 'model number', 'part']],
    ['model',        ['name', 'model', 'item', 'item name', 'product']],
    ['description',  ['description', 'desc', 'item description']],
    ['unitCost',     ['item cost', 'unit cost', 'unit price', 'each', 'cost ea', 'price']],
    ['totalCost',    ['total cost', 'extended cost', 'ext cost', 'ext price', 'line total']],
    ['uom',          ['uom', 'unit', 'unit of measure', 'units']],
    ['costCode',     ['cost code', 'phase', 'phase code']],
    ['expectedDate', ['eta', 'expected', 'expected date', 'ship date', 'due date', 'need by', 'arrival']],
];

// Columns we explicitly know about but never import.
const IGNORED_HEADERS = ['abl #', 'abl#', 'abl number', 'abl', 'line', 'line #', '#'];

const normHeader = (v) => String(v ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[.:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function fieldForHeader(header) {
    const h = normHeader(header);
    if (!h || IGNORED_HEADERS.includes(h)) return null;
    for (const [field, aliases] of COLUMN_ALIASES) {
        if (aliases.includes(h)) return field;
    }
    // Loose fallback: "qty ordered (ea)" style headers.
    for (const [field, aliases] of COLUMN_ALIASES) {
        if (aliases.some(a => a.length >= 3 && h.startsWith(a + ' '))) return field;
    }
    return null;
}

// A header row is the row that maps the most known fields; it must contain a
// quantity or part-number column to count at all (guards against a title
// block row that happens to say "Notes").
function findHeaderRow(rows) {
    let best = { index: -1, map: null, score: 0 };
    const limit = Math.min(rows.length, 30);
    for (let i = 0; i < limit; i++) {
        const map = {};
        let score = 0;
        rows[i].forEach((cell, col) => {
            const field = fieldForHeader(cell);
            if (field && map[field] == null) { map[field] = col; score++; }
        });
        const anchored = map.orderedQty != null || map.partNumber != null;
        if (anchored && score > best.score) best = { index: i, map, score };
    }
    return best.index === -1 ? null : best;
}

// ------------------------------------------------------------------ cells

const text = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim();

function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    // "$1,234.50", "(45.00)", "4,000 ft"
    const cleaned = String(v).replace(/[$,\s]/g, '').replace(/[^0-9.\-()]/g, '');
    if (!cleaned) return null;
    const neg = /^\(.*\)$/.test(cleaned);
    const n = parseFloat(cleaned.replace(/[()]/g, ''));
    if (!isFinite(n)) return null;
    return neg ? -n : n;
}

// Excel serial dates come through as numbers when raw:true; we read with
// raw:false so dates arrive pre-formatted as strings. Normalize to yyyy-mm-dd
// where we can, otherwise keep the text (it still lands in notes).
function toISODate(v) {
    const s = text(v);
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
        let [, mo, d, y] = m;
        if (y.length === 2) y = String(2000 + parseInt(y, 10));
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return '';
}

// ----------------------------------------------------------------- parsing

/**
 * Parse a purchasing workbook into normalized rows.
 * @returns {{ rows: Array, columns: string[], sheetName: string, headerRow: number, skipped: number }}
 */
export function parsePurchasingWorkbook(data, { sheetName } = {}) {
    const wb = XLSX.read(data, { type: 'array' });
    if (!wb.SheetNames.length) throw new Error('That file has no sheets.');

    // Prefer a sheet that looks like a BOM; otherwise the first one.
    const preferred = sheetName
        || wb.SheetNames.find(n => /bill of material|bom|materials|po/i.test(n))
        || wb.SheetNames[0];
    const ws = wb.Sheets[preferred];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

    const header = findHeaderRow(grid);
    if (!header) {
        throw new Error('Could not find a header row. The sheet needs a row with columns like QTY, Part Number, Manufacturer, PO #.');
    }
    const { index: headerRow, map } = header;

    const cell = (r, field) => (map[field] == null ? '' : r[map[field]]);
    const rows = [];
    let skipped = 0;

    for (let i = headerRow + 1; i < grid.length; i++) {
        const r = grid[i];
        if (!r || r.every(c => text(c) === '')) continue;
        // Footer rows: "TOTAL", "Grand Total", "Subtotal".
        if (r.some(c => /^(grand\s+)?(sub)?total\b/i.test(text(c)))) { skipped++; continue; }

        const partNumber = text(cell(r, 'partNumber'));
        const model = text(cell(r, 'model'));
        const manufacturer = text(cell(r, 'manufacturer'));
        // A row with no identity at all is a spacer/section label.
        if (!partNumber && !model && !manufacturer) { skipped++; continue; }

        rows.push({
            rowNumber: i + 1,               // 1-based, matches Excel's row gutter
            partNumber,
            model,
            manufacturer,
            description: text(cell(r, 'description')),
            vendor: text(cell(r, 'vendor')),
            uom: text(cell(r, 'uom')),
            costCode: text(cell(r, 'costCode')),
            poNumber: text(cell(r, 'poNumber')),
            poNotes: text(cell(r, 'poNotes')),
            pmNotes: text(cell(r, 'pmNotes')),
            orderedQty: num(cell(r, 'orderedQty')),
            receivedQty: map.receivedQty == null ? null : num(cell(r, 'receivedQty')),
            unitCost: num(cell(r, 'unitCost')),
            expectedDate: toISODate(cell(r, 'expectedDate')),
        });
    }

    return {
        rows,
        columns: Object.keys(map),
        hasReceivedColumn: map.receivedQty != null,
        sheetName: preferred,
        headerRow: headerRow + 1,
        skipped,
    };
}

// ---------------------------------------------------------------- matching

// Loose identity key: case/punctuation-insensitive so "SLXD4Q+TA=-G57" and
// "slxd4q+ta=—g57" collide, and "60-1271-12" matches "60127112".
const norm = (v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function buildIndex(vendors) {
    const byPart = new Map();
    const byMfrModel = new Map();
    const byModel = new Map();
    const push = (map, key, entry) => {
        if (!key) return;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(entry);
    };
    Object.entries(vendors || {}).forEach(([vendorKey, v]) => {
        (v.lines || []).forEach(line => {
            const entry = { vendorKey, line };
            push(byPart, norm(line.partNumber), entry);
            push(byMfrModel, norm(line.manufacturer) + '|' + norm(line.model), entry);
            push(byModel, norm(line.model), entry);
            // Purchasing frequently pastes the model into the part-number
            // column (and vice versa) — index both directions.
            push(byPart, norm(line.model), entry);
        });
    });
    return { byPart, byMfrModel, byModel };
}

// Tiered match: part number wins, then mfr+model, then model alone. Within a
// tier, a candidate whose vendor group matches the sheet's supplier breaks
// ties; anything still ambiguous is reported so the PM can decide.
function findMatch(index, row) {
    const tiers = [
        ['part', index.byPart.get(norm(row.partNumber))],
        ['mfr+model', index.byMfrModel.get(norm(row.manufacturer) + '|' + norm(row.model))],
        ['part', index.byPart.get(norm(row.model))],
        ['model', index.byModel.get(norm(row.model))],
    ];
    for (const [how, candidates] of tiers) {
        if (!candidates || !candidates.length) continue;
        const unique = [];
        const seen = new Set();
        candidates.forEach(c => { if (!seen.has(c.line.id)) { seen.add(c.line.id); unique.push(c); } });
        if (unique.length === 1) return { ...unique[0], how, ambiguous: false };
        const supplier = norm(row.vendor);
        const byVendor = unique.filter(c => norm(c.vendorKey) === supplier);
        if (byVendor.length === 1) return { ...byVendor[0], how, ambiguous: false };
        const byMfr = unique.filter(c => norm(c.line.manufacturer) === norm(row.manufacturer));
        if (byMfr.length === 1) return { ...byMfr[0], how, ambiguous: false };
        return { ...unique[0], how, ambiguous: true, candidateCount: unique.length };
    }
    return null;
}

// Notes from purchasing are appended, not overwritten — the PM's own note on
// a line is theirs to keep. Re-importing the same sheet is a no-op because we
// check for containment first.
function mergeNotes(existing, incoming) {
    const add = incoming.filter(Boolean).map(s => s.trim()).filter(Boolean);
    if (!add.length) return null;
    let out = (existing || '').trim();
    let changed = false;
    add.forEach(part => {
        if (out.toLowerCase().includes(part.toLowerCase())) return;
        out = out ? `${out} · ${part}` : part;
        changed = true;
    });
    return changed ? out : null;
}

const FIELD_LABELS = {
    orderedQty: 'Ordered qty',
    receivedQty: 'Received qty',
    poNumber: 'PO #',
    unitCost: 'Unit cost',
    notes: 'Notes',
    expectedDate: 'Expected',
    status: 'Status',
};

/**
 * Diff every parsed row against the current procurement state.
 * @returns {Array} entries — one per sheet row, each with `action`
 *   ('update' | 'unchanged' | 'new'), the proposed `patch`, and human-
 *   readable `changes` for the preview table.
 */
export function planImport(procurement, rows, { importQty = true, importCost = true, importNotes = true } = {}) {
    const index = buildIndex(procurement?.vendors);
    return rows.map(row => {
        const match = findMatch(index, row);
        const incomingNotes = [row.poNotes, row.pmNotes];

        if (!match) {
            return {
                row,
                action: 'new',
                match: null,
                vendorKey: (row.vendor || row.manufacturer || 'Unknown').trim() || 'Unknown',
                changes: [
                    row.orderedQty != null ? { field: 'orderedQty', from: null, to: row.orderedQty } : null,
                    row.poNumber ? { field: 'poNumber', from: null, to: row.poNumber } : null,
                ].filter(Boolean),
                selected: true,
            };
        }

        const line = match.line;
        const patch = {};
        const changes = [];
        const set = (field, to) => {
            const from = line[field] ?? '';
            const same = typeof to === 'number' ? Number(from || 0) === to : String(from) === String(to);
            if (same) return;
            patch[field] = to;
            changes.push({ field, from: from === '' ? null : from, to });
        };

        if (importQty && row.orderedQty != null) set('orderedQty', row.orderedQty);
        if (importQty && row.receivedQty != null) set('receivedQty', row.receivedQty);
        if (row.poNumber) set('poNumber', row.poNumber);
        if (importCost && row.unitCost != null && row.unitCost > 0) set('unitCost', row.unitCost);
        if (row.expectedDate) set('expectedDate', row.expectedDate);
        if (importNotes) {
            const merged = mergeNotes(line.notes, incomingNotes);
            if (merged != null) set('notes', merged);
        }

        // Status follows quantities unless the PM parked the line on a manual
        // status (backordered/shipped/returned) — those survive the import.
        if (patch.orderedQty != null || patch.receivedQty != null) {
            const nextStatus = deriveStatus({
                orderedQty: patch.orderedQty ?? line.orderedQty ?? 0,
                receivedQty: patch.receivedQty ?? line.receivedQty ?? 0,
            });
            const manual = ['shipped', 'backordered', 'returned'].includes(line.status);
            if (!manual && nextStatus !== line.status) set('status', nextStatus);
        } else if (patch.poNumber && (line.status === 'pending')) {
            // A PO number arriving on a pending line means it was placed.
            set('status', 'ordered');
        }

        return {
            row,
            action: changes.length ? 'update' : 'unchanged',
            match: { vendorKey: match.vendorKey, lineId: line.id, line, how: match.how, ambiguous: match.ambiguous, candidateCount: match.candidateCount },
            vendorKey: match.vendorKey,
            patch,
            changes,
            selected: changes.length > 0 && !match.ambiguous,
        };
    });
}

/**
 * Apply the selected entries, returning a new procurement object.
 * Unmatched rows become lines with sourceType 'import' (designQty 0 — they
 * were never in the design BOM, so a later Sync from BOM leaves them alone).
 */
export function applyImport(procurement, entries, { fileName = '' } = {}) {
    const vendors = {};
    Object.entries(procurement?.vendors || {}).forEach(([k, v]) => {
        vendors[k] = { ...v, lines: [...(v.lines || [])] };
    });

    let updated = 0, created = 0;
    const importedAt = new Date().toISOString();

    entries.filter(e => e.selected).forEach(entry => {
        if (entry.action === 'new') {
            const vk = entry.vendorKey || 'Unknown';
            if (!vendors[vk]) vendors[vk] = { vendor: vk, poNumbers: '', notes: '', lines: [] };
            const r = entry.row;
            const orderedQty = r.orderedQty || 0;
            const receivedQty = r.receivedQty || 0;
            vendors[vk].lines.push({
                id: genId(),
                catalogId: null,
                manufacturer: r.manufacturer || '',
                model: r.model || '',
                partNumber: r.partNumber || '',
                description: r.description || '',
                unitCost: r.unitCost || 0,
                designQty: 0,
                orderedQty,
                receivedQty,
                status: r.poNumber && orderedQty === 0 ? 'ordered' : deriveStatus({ orderedQty, receivedQty }),
                poNumber: r.poNumber || '',
                expectedDate: r.expectedDate || '',
                notes: mergeNotes('', [r.poNotes, r.pmNotes]) || '',
                sourceType: 'import',
                importedAt,
            });
            created++;
            return;
        }
        if (entry.action !== 'update' || !entry.match) return;
        const { vendorKey, lineId } = entry.match;
        const v = vendors[vendorKey];
        if (!v) return;
        const idx = v.lines.findIndex(l => l.id === lineId);
        if (idx === -1) return;
        v.lines[idx] = { ...v.lines[idx], ...entry.patch, importedAt };
        updated++;
    });

    // Roll each line's PO # up into the vendor's PO Numbers field so the
    // vendor header still shows the full set at a glance.
    Object.values(vendors).forEach(v => {
        const pos = new Set(
            (v.poNumbers || '').split(',').map(s => s.trim()).filter(Boolean)
        );
        (v.lines || []).forEach(l => { if (l.poNumber) pos.add(l.poNumber.trim()); });
        v.poNumbers = [...pos].sort().join(', ');
    });

    return {
        next: {
            ...(procurement || {}),
            vendors,
            lastImport: { at: importedAt, fileName, updated, created },
        },
        updated,
        created,
    };
}

export { FIELD_LABELS };
