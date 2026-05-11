import { useState, useCallback, useRef, useEffect } from 'react';

export default function useFlexibleColumns(initialColumns, layoutKey) {
    const [columns, setColumns] = useState(initialColumns);
    const resizing = useRef(null);
    const dragging = useRef(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [savedLayouts, setSavedLayouts] = useState(() => {
        if (!layoutKey) return [];
        try {
            const stored = JSON.parse(localStorage.getItem('av-estimator-column-layouts') || '{}');
            return stored[layoutKey] || [];
        } catch { return []; }
    });

    const startResize = (colIndex, e) => {
        e.preventDefault();
        e.stopPropagation();
        resizing.current = { colIndex, startX: e.clientX, startWidth: columns[colIndex].width };

        const onMouseMove = (e) => {
            if (resizing.current) {
                const diff = e.clientX - resizing.current.startX;
                const newWidth = Math.min(800, Math.max(40, resizing.current.startWidth + diff));
                setColumns(prev => {
                    const next = [...prev];
                    next[resizing.current.colIndex] = { ...next[resizing.current.colIndex], width: newWidth };
                    return next;
                });
            }
        };

        const onMouseUp = () => {
            resizing.current = null;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const startDrag = (colIndex, e) => {
        if (columns[colIndex].fixed) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', colIndex.toString());
        dragging.current = colIndex;
    };

    const onDragOver = (colIndex, e) => {
        e.preventDefault();
        if (columns[colIndex].fixed) return;
        if (dragging.current !== null && dragging.current !== colIndex) {
            setDragOverIndex(colIndex);
        }
    };

    const onDragLeave = () => {
        setDragOverIndex(null);
    };

    const onDrop = (targetIndex, e) => {
        e.preventDefault();
        if (columns[targetIndex].fixed) return;
        const sourceIndex = dragging.current;
        if (sourceIndex !== null && sourceIndex !== targetIndex) {
            setColumns(prev => {
                const next = [...prev];
                const [removed] = next.splice(sourceIndex, 1);
                next.splice(targetIndex, 0, removed);
                return next;
            });
        }
        dragging.current = null;
        setDragOverIndex(null);
    };

    const onDragEnd = () => {
        dragging.current = null;
        setDragOverIndex(null);
    };

    // Layout preset management (only when layoutKey is provided)
    const persistLayouts = (layouts) => {
        if (!layoutKey) return;
        try {
            const stored = JSON.parse(localStorage.getItem('av-estimator-column-layouts') || '{}');
            stored[layoutKey] = layouts;
            localStorage.setItem('av-estimator-column-layouts', JSON.stringify(stored));
        } catch {}
    };

    const saveLayout = (name) => {
        if (!layoutKey || !name) return;
        const layout = { name, columns: columns.map(c => ({ id: c.id, label: c.label, width: c.width, fixed: c.fixed })) };
        const updated = savedLayouts.filter(l => l.name !== name);
        updated.push(layout);
        setSavedLayouts(updated);
        persistLayouts(updated);
    };

    const loadLayout = (name) => {
        const layout = savedLayouts.find(l => l.name === name);
        if (!layout) return;
        // Merge saved widths/order with current columns (in case new columns were added since save)
        const savedMap = {};
        layout.columns.forEach((c, i) => { savedMap[c.id] = { ...c, order: i }; });
        const merged = [];
        const used = new Set();
        // First, add columns in saved order
        layout.columns.forEach(sc => {
            const current = columns.find(c => c.id === sc.id) || initialColumns.find(c => c.id === sc.id);
            if (current) {
                merged.push({ ...current, width: sc.width });
                used.add(sc.id);
            }
        });
        // Then add any new columns that weren't in the saved layout
        initialColumns.forEach(c => {
            if (!used.has(c.id)) merged.push({ ...c });
        });
        setColumns(merged);
    };

    const deleteLayout = (name) => {
        if (!layoutKey) return;
        const updated = savedLayouts.filter(l => l.name !== name);
        setSavedLayouts(updated);
        persistLayouts(updated);
    };

    const resetColumns = () => {
        setColumns(initialColumns);
    };

    return { columns, startResize, startDrag, onDragOver, onDragLeave, onDrop, onDragEnd, dragOverIndex, savedLayouts, saveLayout, loadLayout, deleteLayout, resetColumns };
}
