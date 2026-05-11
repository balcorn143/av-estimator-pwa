import React from 'react';
const { useState, useEffect, useMemo } = React;
import { styles } from '../styles';
import { Icons } from '../icons';

export default function RevisionPromptModal({ project, onClose, onCreateRevision, manualCreate }) {
    const [label, setLabel] = useState('');
    const [notes, setNotes] = useState('');

    const suggestedLabel = useMemo(() => {
        const revisions = project.revisions || [];
        const revCount = revisions.filter(r => r.label.startsWith('Rev')).length;
        if (revisions.length === 0) return 'Original Bid';
        return 'Rev ' + (revCount + 1);
    }, [project.revisions]);

    useEffect(() => { setLabel(suggestedLabel); }, [suggestedLabel]);

    const handleSubmit = () => {
        if (!label.trim()) return;
        onCreateRevision({ label: label.trim(), notes: notes.trim() });
        onClose();
    };

    const title = manualCreate ? 'Create Revision' : 'New Revision Required';
    const description = manualCreate
        ? 'Save the current project state as a snapshot. You can view or restore this snapshot later.'
        : 'This project has been submitted. Changes require a revision or change order label.';

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '450px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.RotateCcw /> {title}
                </h2>
                <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '16px' }}>
                    {description}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Label *</label>
                        <input
                            type="text" value={label} onChange={e => setLabel(e.target.value)}
                            style={styles.input} placeholder="e.g., Original Bid, Rev 1, CO-1"
                            autoFocus onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Notes (optional)</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }} placeholder="e.g., Initial bid submission, Post-client meeting changes..." />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button style={{ ...styles.button('primary'), opacity: !label.trim() ? 0.5 : 1 }} disabled={!label.trim()} onClick={handleSubmit}>Create Revision</button>
                </div>
            </div>
        </div>
    );
}
