// Takeoff geometry + aggregation.
//
// Marker points are stored in PDF "page units" — the pdf.js viewport at scale
// 1.0 — so they're independent of the zoom the drawing is rendered at. A
// per-page calibration (pxPerUnit = page units per foot) converts pixel
// lengths to real-world feet.
//
// Marker kinds:
//   count    — a single point; contributes `countPer` (default 1) to the qty.
//   line     — a polyline; qty depends on lineMode:
//                'length'   → measured length in feet (for per-foot items).
//                'segments' → ceil(length / spacing) (e.g. a J-hook every X ft).

export const MARKER_COLORS = [
    '#1d9bf0', '#00ba7c', '#f59e0b', '#a78bfa', '#f87171',
    '#06b6d4', '#ec4899', '#84cc16', '#fb923c', '#38bdf8',
];

// Stable identity for a catalog item / snapshot — mirrors how the BOM keys items.
export function itemKey(item) {
    if (!item) return '';
    return item.id || item.partNumber || `${item.manufacturer || ''}|${item.model || ''}`;
}

// Deterministic color for an item key so one item is always the same color.
export function colorForKey(key) {
    let h = 0;
    const s = String(key || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return MARKER_COLORS[h % MARKER_COLORS.length];
}

// A short human label for a marker's item.
export function itemLabel(item) {
    if (!item) return 'Item';
    return item.model || item.manufacturer || item.description || item.partNumber || 'Item';
}

// A marker targets EITHER a catalog item (m.item) or a package (m.pkg). These
// helpers give a stable grouping key / label / color-seed regardless of which.
export function markerGroupKey(m) {
    if (m.pkg) return 'pkg:' + m.pkg.packageId;
    return itemKey(m.item);
}
export function markerGroupLabel(m) {
    if (m.pkg) return m.pkg.packageName || 'Package';
    return itemLabel(m.item);
}

// Summed length of a polyline in page units.
export function polylineLength(points) {
    if (!points || points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    return total;
}

// Real-world length in feet for a line marker (0 if not a line or uncalibrated).
export function markerLengthFt(marker, pxPerUnit) {
    if (marker.kind !== 'line' || !pxPerUnit || pxPerUnit <= 0) return 0;
    return polylineLength(marker.points) / pxPerUnit;
}

// Convert a marker's geometry to a material-list quantity.
// `pxPerUnit` is the marker page's calibration (null/0 if uncalibrated).
export function markerQuantity(marker, pxPerUnit) {
    if (marker.kind === 'count') return marker.countPer || 1;
    // line
    const lenFt = markerLengthFt(marker, pxPerUnit);
    if (lenFt <= 0) return 0; // needs calibration
    if (marker.lineMode === 'segments') {
        const spacing = marker.spacing || 0;
        if (spacing <= 0) return 0;
        return Math.ceil(lenFt / spacing);
    }
    return Math.round(lenFt * 100) / 100; // length mode
}

// True when a marker can't produce a quantity yet (a line on an uncalibrated
// page, or a segment marker with no spacing). Used to surface warnings.
export function markerNeedsCalibration(marker, pxPerUnit) {
    if (marker.kind !== 'line') return false;
    if (!pxPerUnit || pxPerUnit <= 0) return true;
    if (marker.lineMode === 'segments' && !(marker.spacing > 0)) return true;
    return false;
}

// Aggregate a list of markers (already filtered to one location) into material
// -list line items: [{ ...itemSnapshot, qty, fromTakeoff: true, takeoffKey }].
// `getPxPerUnit(marker)` resolves the calibration for a marker's drawing+page
// (null if uncalibrated), since scales are keyed by docId then page.
export function aggregateMarkers(markers, getPxPerUnit) {
    const groups = new Map(); // key -> { kind, item|pkg, qty }
    for (const m of markers) {
        if (!m.item && !m.pkg) continue;
        const pxPerUnit = (typeof getPxPerUnit === 'function' ? getPxPerUnit(m) : null) || null;
        const qty = markerQuantity(m, pxPerUnit);
        if (!(qty > 0)) continue;
        const key = markerGroupKey(m);
        if (!groups.has(key)) groups.set(key, m.pkg ? { kind: 'pkg', pkg: m.pkg, qty: 0 } : { kind: 'item', item: m.item, qty: 0 });
        groups.get(key).qty += qty;
    }
    const out = [];
    for (const [key, g] of groups) {
        const qty = Math.round(g.qty * 100) / 100;
        if (g.kind === 'pkg') {
            out.push({
                type: 'package',
                packageId: g.pkg.packageId,
                packageName: g.pkg.packageName,
                packageVersion: g.pkg.packageVersion || 1,
                qty, notes: '', fromTakeoff: true, takeoffKey: key,
            });
        } else {
            out.push({ ...g.item, qty, fromTakeoff: true, takeoffKey: key });
        }
    }
    return out;
}
