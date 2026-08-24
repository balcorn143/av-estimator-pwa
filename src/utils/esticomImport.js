// Parse an Esticom / Procore Estimating "estimate" export (.xlsx) into the
// AV Estimator location + line-item shape, so an outside bid can seed a
// project as a starting point.
//
// The Esticom sheet lays out one group-header row per location (the location
// name sits alone in column A), followed by its material rows and a block of
// per-phase labor rows. Labor is NOT carried on the parts — it lives on its
// own rows (U/M "hrs", Cost Type "Labor"). Since our model only stores labor
// as laborHrsPerUnit on a line item, each per-phase labor row becomes its own
// labor line item (qty = hours, unit labor 1 hr, $0). After the last real
// location the sheet has a Summary / totals block we stop at.
import * as XLSX from 'xlsx';

// Group-header labels that mark the totals block at the bottom of the sheet.
// Once we hit one of these we've run past the real locations.
const SUMMARY_LABELS = new Set([
    'summary', 'labor + material', 'total materials', 'total equipment',
    'total subcontractors', 'total travels', 'subtotal', 'pre tax markups',
    'overhead', 'discount', 'taxes', 'equipment tax', 'subcontractors tax',
    'travels tax', 'post tax markups', 'bonding', 'textura fees', 'total',
]);

// Esticom cost-code -> our PHASE_OPTIONS value. Materials carry the code in
// the "Cost Code" column; every labor row shares one code, so labor phases
// are resolved from the labor name instead (see PHASE_BY_LABOR).
const PHASE_BY_CODE = {
    '27-41 00': 'Rough-In 27-41 00',
    '27-41 23': 'Trim Out 27-41 23',
    '27-41 33': 'Finish 27-41 33',
    '27-41 16': 'Management 27-41 16',
    '27-41 17': 'Programming 27-41 17',
};

// Labor-row name -> phase. Commissioning / Engineering have no matching phase
// in our list, so they import with a blank phase (the model name still says
// what they are).
const PHASE_BY_LABOR = [
    ['rough', 'Rough-In 27-41 00'],
    ['trim', 'Trim Out 27-41 23'],
    ['finish', 'Finish 27-41 33'],
    ['program', 'Programming 27-41 17'],
    ['management', 'Management 27-41 16'],
];

const UOM_MAP = { EA: 'EA', FT: 'FT', M: 'M', PR: 'PR', SET: 'SET', BOX: 'BOX', ROLL: 'ROLL', LOT: 'LOT', LF: 'FT' };

let idCounter = 0;
function uid() {
    idCounter += 1;
    return Date.now().toString(36) + '-' + idCounter.toString(36) + Math.random().toString(36).slice(2, 7);
}

function num(v) {
    if (v == null || v === '') return 0;
    const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isNaN(n) ? 0 : n;
}

const clean = (v) => String(v == null ? '' : v).trim();

function mapUom(u) {
    const s = clean(u).toUpperCase();
    return UOM_MAP[s] || 'EA';
}

// "Crestron - TSW-770" -> { manufacturer: 'Crestron', model: 'TSW-770' }.
// Names with no " - " keep the whole thing as the model.
function splitName(rawName) {
    const s = clean(rawName);
    const at = s.indexOf(' - ');
    if (at > 0) return { manufacturer: s.slice(0, at).trim(), model: s.slice(at + 3).trim() };
    return { manufacturer: '', model: s };
}

function phaseForCode(code) {
    const m = clean(code).match(/27-41\s*\d\d/);
    if (!m) return '';
    return PHASE_BY_CODE[m[0].replace(/\s+/, ' ')] || '';
}

function phaseForLabor(name) {
    const n = clean(name).toLowerCase();
    for (const [needle, phase] of PHASE_BY_LABOR) if (n.includes(needle)) return phase;
    return '';
}

function isSummaryLabel(s) {
    return SUMMARY_LABELS.has(clean(s).toLowerCase());
}

// Locate the header row and map each known column label to its index. The
// leftmost column (location groups) has a blank header, so it isn't mapped.
function findHeader(grid) {
    for (let i = 0; i < Math.min(grid.length, 60); i++) {
        const row = grid[i] || [];
        const lower = row.map(c => clean(c).toLowerCase());
        if (lower.includes('name') && lower.includes('quantity')) {
            const col = {};
            lower.forEach((label, j) => { if (label && col[label] == null) col[label] = j; });
            return { index: i, col };
        }
    }
    return null;
}

/**
 * Parse an Esticom estimate workbook.
 * @param {ArrayBuffer|Uint8Array|Array} data raw file bytes
 * @param {{ sheetName?: string }} [opts]
 * @returns {{ locations: Array, sheetName: string, headerRow: number, stats: {locations:number, materials:number, labor:number, skipped:number} }}
 */
export function parseEsticomWorkbook(data, { sheetName } = {}) {
    const wb = XLSX.read(data, { type: 'array' });
    if (!wb.SheetNames.length) throw new Error('That file has no sheets.');

    const preferred = sheetName
        || wb.SheetNames.find(n => /estimate/i.test(n))
        || wb.SheetNames[0];
    const ws = wb.Sheets[preferred];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    const header = findHeader(grid);
    if (!header) {
        throw new Error('Could not find the Esticom header row (expected columns like Name, Quantity, U/M, Unit Cost). Is this an Esticom estimate export?');
    }
    const { index: headerRow, col } = header;
    const C = {
        name: col['name'],
        part: col['part'],
        unitLaborMins: col['unit labor (mins)'],
        qty: col['quantity'],
        uom: col['u/m'],
        unitCost: col['unit cost'],
        totalLaborHrs: col['total labor (hrs)'],
        phaseCode: col['phase code'],
        costCode: col['cost code'],
        costTypeName: col['cost type name'],
        category: col['category'],
    };

    const locations = [];
    let cur = null;
    const stats = { locations: 0, materials: 0, labor: 0, skipped: 0 };

    for (let i = headerRow + 1; i < grid.length; i++) {
        const r = grid[i] || [];
        const group = clean(r[0]);
        const name = clean(r[C.name]);
        const part = clean(r[C.part]);

        // A lone value in column A starts a new location group (or the totals block).
        if (group && !name && !part) {
            if (isSummaryLabel(group)) break;   // reached Summary / totals — done
            cur = { id: uid(), name: group, children: [], items: [] };
            locations.push(cur);
            stats.locations += 1;
            continue;
        }
        if (!cur) continue;                 // stray rows before the first location
        if (!name && !part) continue;       // blank spacer row

        const category = clean(r[C.category]).toLowerCase();
        const costType = clean(r[C.costTypeName]).toLowerCase();
        const uom = clean(r[C.uom]).toLowerCase();
        const isLabor = costType === 'labor' || category === 'labor' || uom === 'hrs';

        if (isLabor) {
            const label = part || name;
            const hrs = num(r[C.totalLaborHrs]) || num(r[C.qty]);
            if (hrs <= 0) { stats.skipped += 1; continue; }   // empty phase row
            cur.items.push({
                id: uid(),
                manufacturer: '',
                model: label,
                partNumber: '',
                description: 'Labor (imported from Esticom)',
                category: 'Labor',
                subcategory: '',
                unitCost: 0,
                laborHrsPerUnit: 1,
                uom: 'EA',
                qty: Math.round(hrs * 100) / 100,
                phase: phaseForLabor(label) || phaseForCode(r[C.costCode] ?? r[C.phaseCode]),
                notes: '',
                vendor: '',
            });
            stats.labor += 1;
            continue;
        }

        // "AV Labor Assembly" is a $0 wrapper whose hours are already broken
        // out into the per-phase labor rows below it — skip so labor isn't
        // double-counted.
        if (/labor assembly/i.test(name)) { stats.skipped += 1; continue; }

        const { manufacturer, model } = splitName(name);
        const mins = num(r[C.unitLaborMins]);
        cur.items.push({
            id: uid(),
            manufacturer,
            model,
            partNumber: part,           // materials usually blank; kept if present
            description: '',
            category: '',
            subcategory: '',
            unitCost: num(r[C.unitCost]),
            laborHrsPerUnit: mins > 0 ? Math.round((mins / 60) * 10000) / 10000 : 0,
            uom: mapUom(r[C.uom]),
            qty: num(r[C.qty]),
            phase: phaseForCode(r[C.costCode] ?? r[C.phaseCode]),
            notes: '',
            vendor: '',
        });
        stats.materials += 1;
    }

    return { locations, sheetName: preferred, headerRow, stats };
}

// Convenience roll-up used by the preview modal.
export function summarizeLocation(loc) {
    let materials = 0, labor = 0, matCost = 0, laborHrs = 0;
    for (const it of loc.items || []) {
        if (it.category === 'Labor') {
            labor += 1;
            laborHrs += (it.qty || 0) * (it.laborHrsPerUnit || 0);
        } else {
            materials += 1;
            matCost += (it.qty || 0) * (it.unitCost || 0);
        }
    }
    return { materials, labor, matCost, laborHrs };
}
