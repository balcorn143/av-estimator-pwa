import React from 'react';
const { useState, useEffect, useRef, useMemo, useCallback } = React;
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { styles } from '../styles';
import { Icons } from '../icons';
import { fmtCost, fmtQty } from '../utils/formatters';
import { savePdf, loadPdf, deletePdf, takeoffPdfPath } from '../utils/takeoffStore';
import {
    itemKey, colorForKey, itemLabel, markerLengthFt, markerGroupKey, markerGroupLabel,
    markerQuantity, markerNeedsCalibration, aggregateMarkers,
} from '../utils/takeoff';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// --- tree helpers ---------------------------------------------------------
function flattenLocations(locs, prefix = [], out = []) {
    for (const l of (locs || [])) {
        const path = [...prefix, l.name];
        out.push({ id: l.id, name: l.name, path: path.join(' › '), depth: prefix.length });
        if (l.children?.length) flattenLocations(l.children, path, out);
    }
    return out;
}
function findLoc(locs, id) {
    for (const l of (locs || [])) {
        if (l.id === id) return l;
        if (l.children) { const f = findLoc(l.children, id); if (f) return f; }
    }
    return null;
}

// A project may hold several drawings. Older takeoff data used a single
// `pdf` field; fold that into the docs list transparently.
const LEGACY_ID = 'legacy';
function resolveDocs(tk) {
    const p = tk || {};
    if (p.docs) return p.docs;
    if (p.pdf) return [{ id: LEGACY_ID, name: p.pdf.name, numPages: p.pdf.numPages }];
    return [];
}
function markerDocId(m) { return m.docId || LEGACY_ID; }

// Strip a catalog row down to the fields a material-list item carries.
function snapshotItem(c) {
    return {
        id: c.id, manufacturer: c.manufacturer || '', model: c.model || '',
        partNumber: c.partNumber || '', description: c.description || '',
        category: c.category || '', subcategory: c.subcategory || '',
        unitCost: c.unitCost || 0, laborHrsPerUnit: c.laborHrsPerUnit || 0,
        uom: c.uom || 'EA', vendor: c.vendor || '', phase: c.phase || '',
    };
}
// The compact package reference a marker stores.
function snapshotPkg(p) {
    return { packageId: p.id, packageName: p.name, packageVersion: p.version || 1, scope: p._scope || p.scope || 'catalog' };
}

export default function TakeoffTab({
    projectId, storagePrefix, locations, catalog, catalogPackages, projectPackages,
    takeoff, onUpdateTakeoff, onUpdateItems, onToast, readOnly, selectedLocationId,
}) {
    const markers = takeoff?.markers || [];
    const scales = takeoff?.scales || {}; // { [docId]: { [page]: { pxPerUnit, unit, refFt } } }
    const docs = useMemo(() => resolveDocs(takeoff), [takeoff]);

    const flatLocs = useMemo(() => flattenLocations(locations), [locations]);
    const allPkgs = useMemo(() => [
        ...(catalogPackages || []).map(p => ({ ...p, _scope: 'catalog' })),
        ...(projectPackages || []).map(p => ({ ...p, _scope: 'project' })),
    ], [catalogPackages, projectPackages]);

    // --- persistence helpers ---
    const setMarkers = useCallback((updater) => {
        onUpdateTakeoff(prev => {
            const p = prev || {};
            const cur = p.markers || [];
            return { ...p, markers: typeof updater === 'function' ? updater(cur) : updater };
        });
    }, [onUpdateTakeoff]);

    const setPageScale = useCallback((docId, page, scaleObj) => {
        onUpdateTakeoff(prev => {
            const p = prev || {};
            const s = p.scales || {};
            return { ...p, scales: { ...s, [docId]: { ...(s[docId] || {}), [page]: scaleObj } } };
        });
    }, [onUpdateTakeoff]);

    // --- pdf / doc state ---
    const [activeDocId, setActiveDocId] = useState(null);
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pageNum, setPageNum] = useState(1);
    const [renderScale, setRenderScale] = useState(1.3);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [loading, setLoading] = useState(false);
    const [pdfError, setPdfError] = useState(null);

    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const scrollRef = useRef(null);
    const renderTaskRef = useRef(null);
    const baseWidthRef = useRef(0);
    const fileInputRef = useRef(null);

    // --- tool state ---
    const [tool, setTool] = useState('count'); // 'select' | 'count' | 'line' | 'calibrate'
    const [active, setActive] = useState(null); // { kind:'item', item } | { kind:'pkg', pkg }
    const [lineMode, setLineMode] = useState('length'); // 'length' | 'segments'
    const [spacing, setSpacing] = useState(4); // ft, for segments mode
    const [draftPoints, setDraftPoints] = useState([]); // page units
    const [hoverPoint, setHoverPoint] = useState(null);
    const [calPoints, setCalPoints] = useState([]);
    const [calReady, setCalReady] = useState(null); // [p1,p2] awaiting length input
    const [calFeet, setCalFeet] = useState('');
    const [selectedMarkerId, setSelectedMarkerId] = useState(null);
    const [activeLocationId, setActiveLocationId] = useState(selectedLocationId || null);
    const [showCounts, setShowCounts] = useState(true);

    // --- picker (choose active target OR reassign existing markers) ---
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTab, setPickerTab] = useState('components'); // 'components' | 'packages'
    const [pickerQuery, setPickerQuery] = useState('');
    const [pickerReassign, setPickerReassign] = useState(null); // null | {mode:'group',key} | {mode:'marker',id}

    const activeDoc = docs.find(d => d.id === activeDocId) || null;
    const numPages = pdfDoc?.numPages || activeDoc?.numPages || 0;
    const pageScale = scales[activeDocId]?.[pageNum] || null;
    const pxPerUnit = pageScale?.pxPerUnit || null;

    useEffect(() => {
        if (docs.length === 0) { if (activeDocId) setActiveDocId(null); return; }
        if (!activeDocId || !docs.find(d => d.id === activeDocId)) setActiveDocId(docs[0].id);
    }, [docs, activeDocId]);

    useEffect(() => {
        if (!activeLocationId && flatLocs.length > 0) setActiveLocationId(selectedLocationId || flatLocs[0].id);
    }, [flatLocs, selectedLocationId]);

    const pxForMarker = useCallback((m) => scales[markerDocId(m)]?.[m.page]?.pxPerUnit || null, [scales]);

    // --- load the active drawing from storage ---
    useEffect(() => {
        if (!projectId || !storagePrefix || !activeDocId) { setPdfDoc(null); return; }
        let cancelled = false;
        (async () => {
            setLoading(true); setPdfError(null); setPdfDoc(null);
            try {
                const path = takeoffPdfPath(storagePrefix, projectId, activeDocId);
                const blob = await loadPdf(path);
                if (cancelled) return;
                if (!blob) { setPdfError('Drawing file not found in storage — re-add it'); setLoading(false); return; }
                const buf = await blob.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: buf }).promise;
                if (cancelled) { doc.destroy?.(); return; }
                setPdfDoc(doc);
                setPageNum(p => Math.min(Math.max(1, p), doc.numPages));
            } catch (e) {
                if (!cancelled) setPdfError(e?.message || 'Failed to load drawing');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, storagePrefix, activeDocId]);

    // --- render the current page to canvas ---
    useEffect(() => {
        if (!pdfDoc) { setViewportSize({ width: 0, height: 0 }); return; }
        let cancelled = false;
        (async () => {
            try {
                const page = await pdfDoc.getPage(pageNum);
                if (cancelled) return;
                baseWidthRef.current = page.getViewport({ scale: 1 }).width;
                const viewport = page.getViewport({ scale: renderScale });
                const canvas = canvasRef.current;
                if (!canvas) return;
                const dpr = window.devicePixelRatio || 1;
                canvas.width = Math.floor(viewport.width * dpr);
                canvas.height = Math.floor(viewport.height * dpr);
                canvas.style.width = viewport.width + 'px';
                canvas.style.height = viewport.height + 'px';
                const ctx = canvas.getContext('2d');
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* noop */ } }
                const task = page.render({ canvasContext: ctx, viewport });
                renderTaskRef.current = task;
                setViewportSize({ width: viewport.width, height: viewport.height });
                await task.promise;
            } catch (e) {
                if (!/cancel/i.test(e?.message || '')) console.error('render error', e);
            }
        })();
        return () => { cancelled = true; };
    }, [pdfDoc, pageNum, renderScale]);

    // --- add a new drawing ---
    const handleFile = async (file) => {
        if (!file) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            onToast('Please choose a PDF file', 'warning'); return;
        }
        if (readOnly) { onToast('Project is read-only', 'warning'); return; }
        const docId = 'doc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        setLoading(true); setPdfError(null);
        try {
            const path = takeoffPdfPath(storagePrefix, projectId, docId);
            await savePdf(path, file);
            const buf = await file.arrayBuffer();
            const doc = await pdfjsLib.getDocument({ data: buf }).promise;
            const name = file.name.replace(/\.pdf$/i, '');
            onUpdateTakeoff(prev => {
                const p = prev || {};
                const cur = resolveDocs(p);
                const np = { ...p, docs: [...cur, { id: docId, name, numPages: doc.numPages }] };
                delete np.pdf;
                return np;
            });
            setActiveDocId(docId);
            setPdfDoc(doc);
            setPageNum(1);
            onToast(`Added "${name}" — teammates will see it too`);
        } catch (e) {
            setPdfError(e?.message || 'Upload failed');
            onToast(e?.message || 'Upload failed', 'warning');
        } finally {
            setLoading(false);
        }
    };

    const deleteDoc = async (docId) => {
        if (readOnly) { onToast('Project is read-only', 'warning'); return; }
        const doc = docs.find(d => d.id === docId);
        const markCount = markers.filter(m => markerDocId(m) === docId).length;
        if (!confirm(`Remove "${doc?.name || 'drawing'}"${markCount ? ` and its ${markCount} marker${markCount !== 1 ? 's' : ''}` : ''}?`)) return;
        try { await deletePdf(takeoffPdfPath(storagePrefix, projectId, docId)); } catch { /* best effort */ }
        onUpdateTakeoff(prev => {
            const p = prev || {};
            const nextDocs = resolveDocs(p).filter(d => d.id !== docId);
            const nextScales = { ...(p.scales || {}) }; delete nextScales[docId];
            const nextMarkers = (p.markers || []).filter(m => markerDocId(m) !== docId);
            const np = { ...p, docs: nextDocs, scales: nextScales, markers: nextMarkers };
            delete np.pdf;
            return np;
        });
        onToast('Drawing removed');
    };

    const switchDoc = (docId) => {
        if (docId === activeDocId) return;
        setActiveDocId(docId);
        setPdfDoc(null); setPageNum(1);
        setDraftPoints([]); setHoverPoint(null); setCalPoints([]); setCalReady(null);
        setSelectedMarkerId(null);
    };

    // --- coordinate mapping (client px <-> page units) ---
    const toPageUnits = (e) => {
        const rect = overlayRef.current.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / renderScale, y: (e.clientY - rect.top) / renderScale };
    };
    const S = (v) => v * renderScale;

    // Attach the active target (item or package) onto a marker payload.
    const withTarget = (base) => {
        if (!active) return base;
        if (active.kind === 'pkg') return { ...base, pkg: snapshotPkg(active.pkg) };
        return { ...base, item: snapshotItem(active.item) };
    };

    const addMarker = (partial) => {
        const m = withTarget({
            id: 'mk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            docId: activeDocId, page: pageNum, locationId: activeLocationId,
            createdAt: new Date().toISOString(), ...partial,
        });
        setMarkers(cur => [...cur, m]);
    };

    const finishLine = () => {
        if (draftPoints.length >= 2) {
            addMarker({ kind: 'line', points: draftPoints, lineMode, spacing: lineMode === 'segments' ? spacing : undefined });
        }
        setDraftPoints([]); setHoverPoint(null);
    };

    const onOverlayClick = (e) => {
        if (readOnly) { onToast('Project is read-only', 'warning'); return; }
        if (!pdfDoc) return;
        const p = toPageUnits(e);
        if (tool === 'count') {
            if (!active) { onToast('Pick a line item or package first', 'warning'); return; }
            if (!activeLocationId) { onToast('Pick a location first', 'warning'); return; }
            addMarker({ kind: 'count', points: [p], countPer: 1 });
        } else if (tool === 'line') {
            if (!active) { onToast('Pick a line item or package first', 'warning'); return; }
            if (!activeLocationId) { onToast('Pick a location first', 'warning'); return; }
            setDraftPoints(d => [...d, p]);
        } else if (tool === 'calibrate') {
            setCalPoints(prev => {
                const nd = [...prev, p];
                if (nd.length === 2) { setCalReady(nd); return []; }
                return nd;
            });
        }
    };

    const onOverlayMove = (e) => {
        if ((tool === 'line' && draftPoints.length > 0) || (tool === 'calibrate' && calPoints.length === 1)) {
            setHoverPoint(toPageUnits(e));
        }
    };
    const onOverlayDouble = (e) => {
        if (tool === 'line' && draftPoints.length >= 2) { e.preventDefault(); finishLine(); }
    };

    const applyCalibration = () => {
        const feet = parseFloat(calFeet);
        if (!calReady || !(feet > 0)) { onToast('Enter a length greater than 0', 'warning'); return; }
        const [a, b] = calReady;
        const px = Math.hypot(b.x - a.x, b.y - a.y);
        if (px <= 0) { onToast('Points are too close', 'warning'); return; }
        setPageScale(activeDocId, pageNum, { pxPerUnit: px / feet, unit: 'ft', refFt: feet });
        setCalReady(null); setCalFeet(''); setTool('count');
        onToast(`Page ${pageNum} calibrated`);
    };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (draftPoints.length) { setDraftPoints([]); setHoverPoint(null); }
                if (calPoints.length || calReady) { setCalPoints([]); setCalReady(null); }
            } else if (e.key === 'Enter' && tool === 'line' && draftPoints.length >= 2) {
                finishLine();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMarkerId && tool === 'select') {
                if (!readOnly) { setMarkers(cur => cur.filter(m => m.id !== selectedMarkerId)); setSelectedMarkerId(null); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [tool, draftPoints, calPoints, calReady, selectedMarkerId, readOnly, lineMode, spacing]);

    // --- picker open helpers ---
    const openPickerForActive = () => { setPickerReassign(null); setPickerTab(active?.kind === 'pkg' ? 'packages' : 'components'); setPickerOpen(true); };
    const openReassignGroup = (key, isPkg) => { setPickerReassign({ mode: 'group', key }); setPickerTab(isPkg ? 'components' : 'packages'); setPickerOpen(true); };
    const openReassignMarker = (m) => { setPickerReassign({ mode: 'marker', id: m.id }); setPickerTab(m.pkg ? 'components' : 'packages'); setPickerOpen(true); };

    const applyReassign = (target) => {
        if (readOnly) { onToast('Project is read-only', 'warning'); return; }
        setMarkers(cur => cur.map(m => {
            const match = pickerReassign.mode === 'group' ? markerGroupKey(m) === pickerReassign.key : m.id === pickerReassign.id;
            if (!match) return m;
            const nm = { ...m }; delete nm.item; delete nm.pkg;
            if (target.kind === 'pkg') nm.pkg = snapshotPkg(target.pkg); else nm.item = snapshotItem(target.item);
            return nm;
        }));
        onToast(target.kind === 'pkg' ? `Reassigned to package "${target.pkg.name}"` : 'Reassigned to item');
    };

    const choosePickerTarget = (target) => {
        if (pickerReassign) applyReassign(target);
        else { setActive(target); if (tool === 'select' || tool === 'calibrate') setTool('count'); }
        setPickerOpen(false); setPickerQuery(''); setPickerReassign(null);
    };

    // --- derived ---
    const pageMarkers = useMemo(
        () => markers.filter(m => markerDocId(m) === activeDocId && m.page === pageNum),
        [markers, activeDocId, pageNum]
    );

    const summary = useMemo(() => {
        const byLoc = new Map();
        for (const m of markers) {
            const locId = m.locationId;
            const loc = flatLocs.find(l => l.id === locId);
            if (!byLoc.has(locId)) byLoc.set(locId, { id: locId, name: loc?.name || '(deleted location)', items: new Map() });
            const bucket = byLoc.get(locId);
            const key = markerGroupKey(m);
            const px = pxForMarker(m);
            const qty = markerQuantity(m, px);
            const needsCal = markerNeedsCalibration(m, px);
            if (!bucket.items.has(key)) bucket.items.set(key, { key, label: markerGroupLabel(m), isPkg: !!m.pkg, qty: 0, markers: 0, needsCal: false });
            const row = bucket.items.get(key);
            row.qty += qty; row.markers += 1; row.needsCal = row.needsCal || needsCal;
        }
        return [...byLoc.values()].map(b => ({ ...b, items: [...b.items.values()] }));
    }, [markers, flatLocs, pxForMarker]);

    const uncalibratedCount = useMemo(
        () => markers.filter(m => markerNeedsCalibration(m, pxForMarker(m))).length,
        [markers, pxForMarker]
    );

    // --- sync markers -> location material lists (idempotent) ---
    const syncToMaterialLists = () => {
        if (readOnly) { onToast('Project is read-only', 'warning'); return; }
        const byLoc = new Map();
        for (const m of markers) {
            if (!m.locationId) continue;
            if (!byLoc.has(m.locationId)) byLoc.set(m.locationId, []);
            byLoc.get(m.locationId).push(m);
        }
        const affected = new Set(byLoc.keys());
        const scan = (locs) => { for (const l of (locs || [])) { if ((l.items || []).some(it => it.fromTakeoff)) affected.add(l.id); if (l.children) scan(l.children); } };
        scan(locations);

        let count = 0;
        for (const locId of affected) {
            const loc = findLoc(locations, locId);
            if (!loc) continue;
            const base = (loc.items || []).filter(it => !it.fromTakeoff);
            const agg = aggregateMarkers(byLoc.get(locId) || [], pxForMarker);
            onUpdateItems(locId, [...base, ...agg]);
            count += agg.length;
        }
        onToast(count ? `Synced ${count} line item${count !== 1 ? 's' : ''} to material lists` : 'No counts to sync yet');
    };

    // --- picker results ---
    const pickerItems = useMemo(() => {
        const q = pickerQuery.trim().toLowerCase();
        let list = (catalog || []).filter(c => !c.deleted);
        if (q) list = list.filter(c =>
            (c.manufacturer || '').toLowerCase().includes(q) || (c.model || '').toLowerCase().includes(q) ||
            (c.partNumber || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q) ||
            (c.category || '').toLowerCase().includes(q));
        return list.slice(0, 40);
    }, [catalog, pickerQuery]);

    const pickerPkgs = useMemo(() => {
        const q = pickerQuery.trim().toLowerCase();
        let list = allPkgs;
        if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q));
        return list.slice(0, 40);
    }, [allPkgs, pickerQuery]);

    // ---------------------------------------------------------------------
    const toolBtn = (id, icon, label) => (
        <button
            onClick={() => { setTool(id); setDraftPoints([]); setHoverPoint(null); setCalPoints([]); setCalReady(null); }}
            style={{ ...styles.smallButton, backgroundColor: tool === id ? '#1d9bf0' : '#2f3336', color: tool === id ? '#fff' : '#e7e9ea' }}
            title={label}
        >{icon} {label}</button>
    );

    const activeKey = active ? (active.kind === 'pkg' ? 'pkg:' + active.pkg.id : itemKey(active.item)) : '';
    const activeColor = active ? colorForKey(activeKey) : '#8b98a5';
    const activeLabel = active ? (active.kind === 'pkg' ? active.pkg.name : `${active.item.manufacturer} ${active.item.model}`) : 'Pick item / package…';
    const cursor = (tool === 'count' || tool === 'line' || tool === 'calibrate') ? 'crosshair' : 'default';
    const hasDoc = !!pdfDoc;

    // Reusable count/summary panel (rendered on the left).
    const countsPanel = (
        <aside style={{ width: '320px', flexShrink: 0, borderRight: '1px solid #2f3336', overflowY: 'auto', backgroundColor: '#0f1419', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#8b98a5' }}>Takeoff Counts</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={styles.badge('blue')}>{markers.length} marks</span>
                    <button style={styles.iconButton} title="Hide panel" onClick={() => setShowCounts(false)}><Icons.ChevronLeft /></button>
                </div>
            </div>
            <p style={{ fontSize: '11px', color: '#6e767d', marginBottom: '12px' }}>Totals span all drawings in this project.</p>

            {uncalibratedCount > 0 && (
                <div style={{ padding: '8px 10px', backgroundColor: '#3d2e1a', border: '1px solid #f59e0b40', borderRadius: '8px', fontSize: '12px', color: '#f59e0b', marginBottom: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <Icons.AlertTriangle /> {uncalibratedCount} measurement{uncalibratedCount !== 1 ? 's' : ''} need a page scale
                </div>
            )}

            {summary.length === 0 && (
                <div style={{ fontSize: '13px', color: '#6e767d', padding: '20px 0', textAlign: 'center' }}>
                    No markers yet. Pick a location + item/package, choose Count or Measure, then click the drawing.
                </div>
            )}

            {summary.map(loc => {
                const locTotal = loc.items.reduce((s, r) => s + r.qty, 0);
                return (
                    <div key={loc.id || 'none'} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <Icons.Location />
                            <span style={{ fontSize: '13px', fontWeight: '600' }}>{loc.name}</span>
                        </div>
                        <div style={{ backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '8px', overflow: 'hidden' }}>
                            {loc.items.map(row => (
                                <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderBottom: '1px solid #2f3336', fontSize: '12px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: row.isPkg ? '2px' : '50%', backgroundColor: colorForKey(row.key), flexShrink: 0 }} />
                                    {row.isPkg && <Icons.Package />}
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                                    {row.needsCal && <span title="Needs page scale" style={{ color: '#f59e0b' }}><Icons.AlertTriangle /></span>}
                                    <span style={{ fontWeight: '700', color: '#00ba7c' }}>{fmtQty(row.qty)}</span>
                                    {!readOnly && (
                                        <button style={{ ...styles.iconButton, padding: '2px' }} title={row.isPkg ? 'Reassign these markers' : 'Replace these markers with a package'} onClick={() => openReassignGroup(row.key, row.isPkg)}>
                                            <Icons.Sync />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11px', color: '#6e767d' }}>
                                <span>{loc.items.length} type{loc.items.length !== 1 ? 's' : ''}</span>
                                <span>{fmtQty(locTotal)} total</span>
                            </div>
                        </div>
                    </div>
                );
            })}

            {markers.length > 0 && (
                <button style={{ ...styles.button('success'), width: '100%', justifyContent: 'center', marginTop: '4px', opacity: readOnly ? 0.5 : 1 }} onClick={syncToMaterialLists} disabled={readOnly}>
                    <Icons.Sync /> Sync counts → material lists
                </button>
            )}
            <p style={{ fontSize: '11px', color: '#6e767d', marginTop: '8px' }}>
                The ⟳ button on a row swaps those markers to a package (or back to an item). Syncing replaces takeoff-generated lines only; hand-added items stay.
            </p>
        </aside>
    );

    return (
        <section style={{ ...styles.content, marginLeft: 0, position: 'relative', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid #2f3336', backgroundColor: '#0f1419' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icons.FileText />
                    <span style={{ fontSize: '14px', fontWeight: '700' }}>PDF Takeoff</span>
                </div>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#2f3336' }} />

                <label style={{ fontSize: '12px', color: '#8b98a5' }}>Location:</label>
                <select value={activeLocationId || ''} onChange={e => setActiveLocationId(e.target.value)} style={{ ...styles.inputSmall, cursor: 'pointer', maxWidth: '220px' }}>
                    {flatLocs.length === 0 && <option value="">No locations yet</option>}
                    {flatLocs.map(l => <option key={l.id} value={l.id}>{' '.repeat(l.depth * 2)}{l.name}</option>)}
                </select>

                <button onClick={openPickerForActive} style={{ ...styles.smallButton, backgroundColor: '#1a1f26', border: '1px solid #2f3336', maxWidth: '280px' }} title="Choose the item or package to place">
                    <span style={{ width: '10px', height: '10px', borderRadius: active?.kind === 'pkg' ? '2px' : '50%', backgroundColor: activeColor, display: 'inline-block', flexShrink: 0 }} />
                    {active?.kind === 'pkg' && <Icons.Package />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLabel}</span>
                    <Icons.Search />
                </button>

                <div style={{ flex: 1 }} />
                <button style={styles.smallButton} onClick={() => fileInputRef.current?.click()}><Icons.Upload /> Add PDF</button>
                <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                    onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>

            {/* Drawing tabs */}
            {docs.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderBottom: '1px solid #2f3336', overflowX: 'auto', backgroundColor: '#0f1419' }}>
                    <span style={{ fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>Drawings:</span>
                    {docs.map(d => {
                        const isActive = d.id === activeDocId;
                        const cnt = markers.filter(m => markerDocId(m) === d.id).length;
                        return (
                            <div key={d.id} onClick={() => switchDoc(d.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, backgroundColor: isActive ? '#1d3a5c' : '#1a1f26', border: `1px solid ${isActive ? '#1d9bf0' : '#2f3336'}` }}>
                                <Icons.FileText />
                                <span style={{ fontSize: '12px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? '#fff' : '#e7e9ea' }}>{d.name}</span>
                                {cnt > 0 && <span style={{ ...styles.badge('blue'), fontSize: '10px' }}>{cnt}</span>}
                                {!readOnly && <button style={{ ...styles.iconButton, padding: '2px' }} onClick={(e) => { e.stopPropagation(); deleteDoc(d.id); }} title="Remove drawing"><Icons.X /></button>}
                            </div>
                        );
                    })}
                    <button style={{ ...styles.smallButton, flexShrink: 0 }} onClick={() => fileInputRef.current?.click()}><Icons.Plus /> Add PDF</button>
                </div>
            )}

            {/* Tool row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 16px', borderBottom: '1px solid #2f3336' }}>
                {!showCounts && (
                    <button style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c' }} onClick={() => setShowCounts(true)} title="Show counts panel">
                        <Icons.ChevronRight /> Counts ({markers.length})
                    </button>
                )}
                {toolBtn('select', <Icons.Move />, 'Select')}
                {toolBtn('count', <Icons.MapPin />, 'Count')}
                {toolBtn('line', <Icons.Ruler />, 'Measure')}
                {toolBtn('calibrate', <Icons.Crosshair />, 'Set Scale')}

                {tool === 'line' && (
                    <>
                        <div style={{ width: '1px', height: '20px', backgroundColor: '#2f3336' }} />
                        <select value={lineMode} onChange={e => setLineMode(e.target.value)} style={{ ...styles.inputSmall, cursor: 'pointer' }}>
                            <option value="length">Length → qty (per-ft)</option>
                            <option value="segments">Length ÷ spacing → count</option>
                        </select>
                        {lineMode === 'segments' && (
                            <label style={{ fontSize: '12px', color: '#8b98a5', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                every
                                <input type="number" min="0.1" step="0.5" value={spacing}
                                    onChange={e => setSpacing(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                                    style={{ ...styles.inputSmall, width: '60px' }} onFocus={e => e.target.select()} />
                                ft
                            </label>
                        )}
                        {draftPoints.length >= 2 && (
                            <button style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c' }} onClick={finishLine}>
                                <Icons.Check /> Finish run (Enter)
                            </button>
                        )}
                        {draftPoints.length > 0 && <span style={{ fontSize: '11px', color: '#6e767d' }}>Click to add points • double-click / Enter to finish • Esc to cancel</span>}
                    </>
                )}

                {tool === 'calibrate' && (
                    <span style={{ fontSize: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icons.AlertTriangle /> Click two points a known distance apart on the drawing
                    </span>
                )}

                <div style={{ flex: 1 }} />
                {hasDoc && (
                    <span style={{ fontSize: '12px', color: pxPerUnit ? '#00ba7c' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {pxPerUnit ? <><Icons.Check /> Page {pageNum} scale set ({pageScale.refFt} ft ref)</> : <><Icons.AlertTriangle /> Page {pageNum} not calibrated</>}
                    </span>
                )}
            </div>

            {/* Main split: counts (left) + canvas */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {showCounts && countsPanel}

                <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', backgroundColor: '#0a0d12', position: 'relative' }}>
                    {loading && <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', color: '#8b98a5', zIndex: 5 }}>Loading…</div>}

                    {!hasDoc && !loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6e767d', gap: '16px' }}>
                            <Icons.FileText />
                            <div style={{ fontSize: '15px' }}>{docs.length === 0 ? 'No drawings added to this project yet.' : 'Select a drawing above.'}</div>
                            {pdfError && <div style={{ color: '#f87171', fontSize: '13px', maxWidth: '460px', textAlign: 'center' }}>{pdfError}</div>}
                            <button style={styles.button('primary')} onClick={() => fileInputRef.current?.click()}><Icons.Upload /> Add a PDF drawing</button>
                            <p style={{ fontSize: '12px', maxWidth: '420px', textAlign: 'center' }}>Tip: split large sets into sections and add each one — you can tab between them.</p>
                        </div>
                    )}

                    {hasDoc && (
                        <div style={{ position: 'relative', width: viewportSize.width, margin: '16px auto' }}>
                            <canvas ref={canvasRef} style={{ display: 'block', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }} />
                            <svg ref={overlayRef} width={viewportSize.width} height={viewportSize.height}
                                style={{ position: 'absolute', top: 0, left: 0, cursor, touchAction: 'none' }}
                                onClick={onOverlayClick} onMouseMove={onOverlayMove} onDoubleClick={onOverlayDouble}>
                                {pageMarkers.map(m => {
                                    const key = markerGroupKey(m);
                                    const color = colorForKey(key);
                                    const isSel = m.id === selectedMarkerId;
                                    if (m.kind === 'count') {
                                        const p = m.points[0];
                                        return (
                                            <g key={m.id} onClick={(e) => { if (tool === 'select') { e.stopPropagation(); setSelectedMarkerId(m.id); } }} style={{ cursor: tool === 'select' ? 'pointer' : cursor }}>
                                                {m.pkg
                                                    ? <rect x={S(p.x) - 9} y={S(p.y) - 9} width={18} height={18} rx={4} fill={color} stroke={isSel ? '#fff' : '#0a0d12'} strokeWidth={isSel ? 3 : 1.5} opacity={0.9} />
                                                    : <circle cx={S(p.x)} cy={S(p.y)} r={9} fill={color} stroke={isSel ? '#fff' : '#0a0d12'} strokeWidth={isSel ? 3 : 1.5} opacity={0.9} />}
                                            </g>
                                        );
                                    }
                                    const pts = m.points.map(p => `${S(p.x)},${S(p.y)}`).join(' ');
                                    const mid = m.points[Math.floor(m.points.length / 2)];
                                    const lenFt = markerLengthFt(m, pxForMarker(m));
                                    const qty = markerQuantity(m, pxForMarker(m));
                                    return (
                                        <g key={m.id} onClick={(e) => { if (tool === 'select') { e.stopPropagation(); setSelectedMarkerId(m.id); } }} style={{ cursor: tool === 'select' ? 'pointer' : cursor }}>
                                            <polyline points={pts} fill="none" stroke={color} strokeWidth={isSel ? 5 : 3} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
                                            {m.points.map((p, i) => <circle key={i} cx={S(p.x)} cy={S(p.y)} r={3} fill={color} />)}
                                            <rect x={S(mid.x) + 6} y={S(mid.y) - 10} width={lenFt ? 82 : 60} height={16} rx={3} fill="#0a0d12" opacity={0.8} />
                                            <text x={S(mid.x) + 10} y={S(mid.y) + 2} fontSize="11" fill="#fff">{lenFt ? `${lenFt.toFixed(1)}ft → ${fmtQty(qty)}` : 'set scale'}</text>
                                        </g>
                                    );
                                })}

                                {tool === 'line' && draftPoints.length > 0 && (
                                    <polyline points={[...draftPoints, hoverPoint].filter(Boolean).map(p => `${S(p.x)},${S(p.y)}`).join(' ')} fill="none" stroke={activeColor} strokeWidth={2} strokeDasharray="6 4" />
                                )}
                                {tool === 'line' && draftPoints.map((p, i) => <circle key={i} cx={S(p.x)} cy={S(p.y)} r={3} fill={activeColor} />)}

                                {calPoints.map((p, i) => <circle key={i} cx={S(p.x)} cy={S(p.y)} r={4} fill="#f59e0b" />)}
                                {calPoints.length === 1 && hoverPoint && (
                                    <line x1={S(calPoints[0].x)} y1={S(calPoints[0].y)} x2={S(hoverPoint.x)} y2={S(hoverPoint.y)} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" />
                                )}
                            </svg>
                        </div>
                    )}

                    {hasDoc && (
                        <div style={{ position: 'sticky', bottom: 0, left: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'rgba(15,20,25,0.92)', borderTop: '1px solid #2f3336' }}>
                            <button style={styles.smallButton} onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1}><Icons.ChevronLeft /></button>
                            <span style={{ fontSize: '12px', color: '#8b98a5', minWidth: '80px', textAlign: 'center' }}>Page {pageNum} / {numPages}</span>
                            <button style={styles.smallButton} onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum >= numPages}><Icons.ChevronRight /></button>
                            <div style={{ width: '1px', height: '20px', backgroundColor: '#2f3336' }} />
                            <button style={styles.smallButton} onClick={() => setRenderScale(s => Math.max(0.2, +(s * 0.8).toFixed(2)))}><Icons.ZoomOut /></button>
                            <span style={{ fontSize: '12px', color: '#8b98a5', minWidth: '44px', textAlign: 'center' }}>{Math.round(renderScale * 100)}%</span>
                            <button style={styles.smallButton} onClick={() => setRenderScale(s => Math.min(5, +(s * 1.25).toFixed(2)))}><Icons.ZoomIn /></button>
                            <button style={styles.smallButton} onClick={() => {
                                const cw = scrollRef.current?.clientWidth || 0;
                                if (cw && baseWidthRef.current) setRenderScale(+((cw - 48) / baseWidthRef.current).toFixed(2));
                            }}>Fit</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Selected-marker mini panel (anchored to whichever edge the counts panel isn't on) */}
            {tool === 'select' && selectedMarkerId && (() => {
                const m = markers.find(x => x.id === selectedMarkerId);
                if (!m) return null;
                const loc = flatLocs.find(l => l.id === m.locationId);
                return (
                    <div style={{ position: 'absolute', left: showCounts ? '340px' : '16px', bottom: '24px', backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '10px', padding: '12px', width: '250px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>{m.pkg && <Icons.Package />}{markerGroupLabel(m)}</span>
                            <button style={styles.iconButton} onClick={() => setSelectedMarkerId(null)}><Icons.X /></button>
                        </div>
                        <div style={{ fontSize: '11px', color: '#8b98a5', marginBottom: '8px' }}>
                            {m.kind === 'count' ? (m.pkg ? 'Package marker' : 'Count marker') : m.lineMode === 'segments' ? `Measure ÷ ${m.spacing}ft` : 'Length measure'} • {loc?.name || '—'}
                        </div>
                        {m.kind === 'count' && (
                            <label style={{ fontSize: '11px', color: '#8b98a5', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                {m.pkg ? 'Packages per mark' : 'Units per mark'}
                                <input type="number" min="1" step="1" value={m.countPer || 1}
                                    onChange={e => { const v = Math.max(1, parseInt(e.target.value) || 1); setMarkers(cur => cur.map(x => x.id === m.id ? { ...x, countPer: v } : x)); }}
                                    style={{ ...styles.inputSmall, width: '60px' }} />
                            </label>
                        )}
                        <button style={{ ...styles.smallButton, width: '100%', justifyContent: 'center', marginBottom: '6px' }} onClick={() => openReassignMarker(m)}>
                            <Icons.Sync /> Reassign to {m.pkg ? 'item' : 'package'}…
                        </button>
                        <button style={{ ...styles.smallButton, backgroundColor: '#5c2626', color: '#f87171', width: '100%', justifyContent: 'center' }}
                            onClick={() => { setMarkers(cur => cur.filter(x => x.id !== m.id)); setSelectedMarkerId(null); }}>
                            <Icons.Trash /> Delete marker
                        </button>
                    </div>
                );
            })()}

            {/* Calibration length input */}
            {calReady && (
                <div style={styles.modal} onClick={() => { setCalReady(null); setCalFeet(''); }}>
                    <div style={{ ...styles.modalContent, width: '360px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}><Icons.Crosshair /> Set page scale</h3>
                        <p style={{ fontSize: '13px', color: '#8b98a5', marginBottom: '12px' }}>How long is the line you just drew, in real-world feet?</p>
                        <input type="number" min="0.1" step="0.5" autoFocus value={calFeet}
                            onChange={e => setCalFeet(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyCalibration(); }}
                            placeholder="e.g. 20" style={{ ...styles.input, marginBottom: '16px' }} />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={styles.button('secondary')} onClick={() => { setCalReady(null); setCalFeet(''); }}>Cancel</button>
                            <button style={styles.button('primary')} onClick={applyCalibration}>Set scale</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Item / package picker */}
            {pickerOpen && (
                <div style={styles.modal} onClick={() => { setPickerOpen(false); setPickerReassign(null); }}>
                    <div style={{ ...styles.modalContent, width: '620px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icons.Search /> {pickerReassign ? 'Reassign markers to…' : 'Choose item or package to place'}
                            </h3>
                            <button style={styles.iconButton} onClick={() => { setPickerOpen(false); setPickerReassign(null); }}><Icons.X /></button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            <button style={{ ...styles.smallButton, backgroundColor: pickerTab === 'components' ? '#1d9bf0' : '#2f3336', color: pickerTab === 'components' ? '#fff' : '#e7e9ea' }} onClick={() => setPickerTab('components')}>Components ({pickerItems.length})</button>
                            <button style={{ ...styles.smallButton, backgroundColor: pickerTab === 'packages' ? '#1d9bf0' : '#2f3336', color: pickerTab === 'packages' ? '#fff' : '#e7e9ea' }} onClick={() => setPickerTab('packages')}>Packages ({pickerPkgs.length})</button>
                        </div>
                        <input autoFocus type="text" placeholder={pickerTab === 'packages' ? 'Search packages…' : 'Search catalog…'} value={pickerQuery}
                            onChange={e => setPickerQuery(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />
                        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                            {pickerTab === 'components' && pickerItems.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: '#6e767d' }}>No matching items</div>}
                            {pickerTab === 'components' && pickerItems.map(c => (
                                <div key={c.id} onClick={() => choosePickerTarget({ kind: 'item', item: c })}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: '1px solid #2f3336', cursor: 'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1a1f26'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: colorForKey(itemKey(c)), flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600' }}>{c.manufacturer} <span style={{ color: '#1d9bf0' }}>{c.model}</span></div>
                                        <div style={{ fontSize: '11px', color: '#6e767d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.partNumber} · {c.description}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '12px', color: '#00ba7c' }}>{fmtCost(c.unitCost)}</div>
                                        <div style={{ fontSize: '11px', color: '#8b98a5' }}>{c.uom}</div>
                                    </div>
                                </div>
                            ))}
                            {pickerTab === 'packages' && pickerPkgs.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: '#6e767d' }}>No matching packages</div>}
                            {pickerTab === 'packages' && pickerPkgs.map(p => {
                                const cost = (p.items || []).reduce((s, i) => s + ((i.qtyPerPackage || i.qty || 1) * (i.unitCost || 0)), 0);
                                return (
                                    <div key={p.id} onClick={() => choosePickerTarget({ kind: 'pkg', pkg: p })}
                                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: '1px solid #2f3336', cursor: 'pointer' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1a1f26'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: colorForKey('pkg:' + p.id), flexShrink: 0 }} />
                                        <Icons.Package />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', fontWeight: '600' }}>{p.name}</div>
                                            <div style={{ fontSize: '11px', color: '#6e767d' }}>{(p.items || []).length} items · <span style={{ color: p._scope === 'catalog' ? '#1d9bf0' : '#00ba7c' }}>{p._scope}</span></div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#00ba7c', flexShrink: 0 }}>{fmtCost(cost)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
