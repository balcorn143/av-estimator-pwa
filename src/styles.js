export const styles = {
    app: { fontFamily: "'Segoe UI', -apple-system, sans-serif", minHeight: '100vh', backgroundColor: '#0f1419', color: '#e7e9ea' },
    header: { background: 'linear-gradient(180deg, #1a1f26 0%, #151a21 100%)', padding: '12px 24px', borderBottom: '1px solid #2f3336', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 },
    logo: { fontSize: '18px', fontWeight: '700', color: '#1d9bf0', display: 'flex', alignItems: 'center', gap: '8px' },
    nav: { display: 'flex', gap: '4px' },
    navButton: (active) => ({ padding: '8px 16px', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', backgroundColor: active ? '#1d9bf0' : 'transparent', color: active ? '#fff' : '#8b98a5', transition: 'all 0.2s' }),
    main: { display: 'flex', height: 'calc(100vh - 53px)' },
    sidebar: { width: '360px', backgroundColor: '#151a21', borderRight: '1px solid #2f3336', display: 'flex', flexDirection: 'column' },
    sidebarHeader: { padding: '16px', borderBottom: '1px solid #2f3336' },
    sidebarSearch: { padding: '12px 16px', borderBottom: '1px solid #2f3336' },
    sidebarActions: { padding: '12px 16px', borderBottom: '1px solid #2f3336', display: 'flex', gap: '8px', flexWrap: 'wrap' },
    sidebarContent: { flex: 1, overflowY: 'auto', padding: '8px' },
    content: { flex: 1, padding: '24px', overflowY: 'auto', backgroundColor: '#0f1419' },
    card: { backgroundColor: '#1a1f26', borderRadius: '16px', border: '1px solid #2f3336', padding: '20px', marginBottom: '16px' },
    cardTitle: { fontSize: '15px', fontWeight: '600', color: '#e7e9ea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' },
    input: { width: '100%', padding: '10px 14px', backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '8px', color: '#e7e9ea', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
    inputSmall: { padding: '8px 12px', backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '6px', color: '#e7e9ea', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '12px 16px', backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '8px', color: '#e7e9ea', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', minHeight: '150px' },
    button: (v) => ({ padding: '10px 20px', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: v === 'primary' ? '#1d9bf0' : v === 'success' ? '#00ba7c' : v === 'warning' ? '#f59e0b' : v === 'danger' ? '#dc2626' : v === 'purple' ? '#7c3aed' : '#2f3336', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'opacity 0.2s' }),
    smallButton: { padding: '6px 10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', backgroundColor: '#2f3336', color: '#e7e9ea', display: 'inline-flex', alignItems: 'center', gap: '4px' },
    iconButton: { padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer', backgroundColor: 'transparent', color: '#8b98a5', display: 'inline-flex', alignItems: 'center' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' },
    th: { textAlign: 'left', padding: '12px 16px', backgroundColor: '#1a1f26', color: '#8b98a5', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #2f3336', borderRight: '1px solid #3d4450', position: 'sticky', top: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    thResizable: { position: 'relative', userSelect: 'none' },
    resizeHandle: { position: 'absolute', right: '-2px', top: '4px', bottom: '4px', width: '4px', cursor: 'col-resize', backgroundColor: '#4a5568', borderRadius: '2px', zIndex: 2, opacity: 0.6, transition: 'opacity 0.15s, background-color 0.15s' },
    td: { padding: '12px 16px', borderBottom: '1px solid #2f3336', borderRight: '1px solid #2a2f38', color: '#e7e9ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    treeItem: (d, s) => ({ padding: '8px 12px', paddingLeft: `${12 + d * 16}px`, cursor: 'pointer', borderRadius: '8px', backgroundColor: s ? '#1d3a5c' : 'transparent', color: s ? '#e7e9ea' : '#8b98a5', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', border: s ? '1px solid #1d9bf0' : '1px solid transparent' }),
    treeItemTotals: { fontSize: '11px', color: '#6e767d', display: 'flex', gap: '8px', marginLeft: 'auto', flexShrink: 0 },
    badge: (c) => ({ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: c === 'blue' ? '#1d3a5c' : c === 'green' ? '#1a3d2e' : c === 'orange' ? '#3d2e1a' : c === 'red' ? '#3d1a1a' : c === 'purple' ? '#2d1a3d' : '#2f3336', color: c === 'blue' ? '#1d9bf0' : c === 'green' ? '#00ba7c' : c === 'orange' ? '#ffad1f' : c === 'red' ? '#f87171' : c === 'purple' ? '#a78bfa' : '#8b98a5' }),
    modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: '#1a1f26', borderRadius: '16px', border: '1px solid #2f3336', padding: '24px', width: '600px', maxWidth: '90vw', maxHeight: '85vh', overflowY: 'auto' },
    searchResults: { maxHeight: '350px', overflowY: 'auto', border: '1px solid #2f3336', borderRadius: '12px', marginTop: '16px' },
    searchItem: (s) => ({ padding: '14px 16px', cursor: 'pointer', backgroundColor: s ? '#1d3a5c' : 'transparent', borderBottom: '1px solid #2f3336' }),
    emptyState: { textAlign: 'center', padding: '80px 20px', color: '#6e767d' },
    pkgColor: (n) => {
        const c = [
            // Blues
            { bg: 'rgba(29,155,240,0.15)', b: '#1d9bf0' },
            { bg: 'rgba(56,189,248,0.15)', b: '#38bdf8' },
            { bg: 'rgba(14,116,144,0.15)', b: '#0e7490' },
            // Greens
            { bg: 'rgba(0,186,124,0.15)', b: '#00ba7c' },
            { bg: 'rgba(34,197,94,0.15)', b: '#22c55e' },
            { bg: 'rgba(16,185,129,0.15)', b: '#10b981' },
            { bg: 'rgba(132,204,22,0.15)', b: '#84cc16' },
            // Yellows/Oranges
            { bg: 'rgba(255,173,31,0.15)', b: '#ffad1f' },
            { bg: 'rgba(251,191,36,0.15)', b: '#fbbf24' },
            { bg: 'rgba(245,158,11,0.15)', b: '#f59e0b' },
            { bg: 'rgba(249,115,22,0.15)', b: '#f97316' },
            // Reds/Pinks
            { bg: 'rgba(249,24,128,0.15)', b: '#f91880' },
            { bg: 'rgba(239,68,68,0.15)', b: '#ef4444' },
            { bg: 'rgba(244,63,94,0.15)', b: '#f43f5e' },
            { bg: 'rgba(236,72,153,0.15)', b: '#ec4899' },
            // Purples
            { bg: 'rgba(120,86,255,0.15)', b: '#7856ff' },
            { bg: 'rgba(168,85,247,0.15)', b: '#a855f7' },
            { bg: 'rgba(139,92,246,0.15)', b: '#8b5cf6' },
            { bg: 'rgba(192,132,252,0.15)', b: '#c084fc' },
            // Teals/Cyans
            { bg: 'rgba(20,184,166,0.15)', b: '#14b8a6' },
            { bg: 'rgba(6,182,212,0.15)', b: '#06b6d4' },
            { bg: 'rgba(34,211,238,0.15)', b: '#22d3ee' },
            // Others
            { bg: 'rgba(244,114,182,0.15)', b: '#f472b6' },
            { bg: 'rgba(251,146,60,0.15)', b: '#fb923c' },
            { bg: 'rgba(163,230,53,0.15)', b: '#a3e635' },
        ];
        let h = 0;
        for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
        return c[Math.abs(h) % c.length];
    },
    preview: { backgroundColor: '#0f1419', border: '1px solid #2f3336', borderRadius: '8px', padding: '12px', marginTop: '12px', maxHeight: '150px', overflowY: 'auto' },
    previewItem: { padding: '4px 8px', fontSize: '13px', color: '#8b98a5', display: 'flex', alignItems: 'center', gap: '8px' },
    clipboardBanner: { padding: '12px 16px', backgroundColor: '#1a3d2e', borderBottom: '1px solid #2d4a3e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px', color: '#00ba7c' },
    toast: { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#1a1f26', color: '#e7e9ea', padding: '12px 24px', borderRadius: '8px', border: '1px solid #2f3336', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', fontSize: '14px', zIndex: 2000 },
};
