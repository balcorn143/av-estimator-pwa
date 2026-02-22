import React from 'react';
import { styles } from '../styles';
import { Icons } from '../icons';

export default function RevisionHistoryPanel({ project, viewingRevisionId, onViewRevision, onRestoreRevision, onClose }) {
    const revisions = [...(project.revisions || [])].reverse(); // newest first

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '600px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.Clock /> Revision History
                </h2>
                <p style={{ color: '#8b98a5', fontSize: '13px', marginBottom: '16px' }}>
                    {revisions.length} revision{revisions.length !== 1 ? 's' : ''}. Click "View" to browse a snapshot in read-only mode.
                </p>
                {revisions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#6e767d' }}>
                        No revisions yet. Revisions are created when you submit a proposal or make changes to a submitted project.
                    </div>
                ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                        {revisions.map((rev, idx) => {
                            const isViewing = rev.id === viewingRevisionId;
                            const isCurrent = rev.id === project.currentRevision;
                            const hasSnapshot = !!rev.snapshot;
                            return (
                                <div key={rev.id} style={{
                                    padding: '12px 16px',
                                    borderBottom: idx < revisions.length - 1 ? '1px solid #2f3336' : 'none',
                                    backgroundColor: isViewing ? '#3d2e1a' : 'transparent',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: '600', color: isCurrent ? '#f59e0b' : '#e7e9ea', fontSize: '14px' }}>
                                                {rev.label}
                                            </span>
                                            {isCurrent && <span style={{ ...styles.badge('orange'), fontSize: '10px' }}>ACTIVE</span>}
                                            {!hasSnapshot && <span style={{ fontSize: '10px', color: '#6e767d', fontStyle: 'italic' }}>(no snapshot)</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                            {hasSnapshot && (
                                                <>
                                                    <button
                                                        style={{ ...styles.smallButton, backgroundColor: isViewing ? '#f59e0b' : '#2f3336', color: isViewing ? '#000' : '#e7e9ea', fontSize: '12px' }}
                                                        onClick={() => onViewRevision(isViewing ? null : rev.id)}>
                                                        {isViewing ? 'Viewing' : 'View'}
                                                    </button>
                                                    <button
                                                        style={{ ...styles.smallButton, backgroundColor: '#1a3d2e', color: '#00ba7c', fontSize: '12px' }}
                                                        onClick={() => {
                                                            if (confirm(`Restore "${rev.label}"?\n\nThis will replace your current project data with this snapshot. Your current state will be saved as a new revision first.`)) {
                                                                onRestoreRevision(rev.id);
                                                            }
                                                        }}>
                                                        <Icons.RotateCcw /> Restore
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px', color: '#6e767d' }}>
                                        <span>{new Date(rev.createdAt).toLocaleDateString()} {new Date(rev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        {rev.createdBy && <span>by {rev.createdBy}</span>}
                                    </div>
                                    {rev.notes && <div style={{ color: '#8b98a5', fontSize: '12px', marginTop: '4px' }}>{rev.notes}</div>}
                                </div>
                            );
                        })}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
