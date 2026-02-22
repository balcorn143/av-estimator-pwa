import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { PROJECT_STATUSES } from '../constants';

export default function EditProjectModal({ project, onClose, onSave, onViewRevision }) {
    const [name, setName] = useState(project.name || '');
    const [client, setClient] = useState(project.client || '');
    const [projectNumber, setProjectNumber] = useState(project.projectNumber || '');
    const [dueDate, setDueDate] = useState(project.dueDate || '');
    const [notes, setNotes] = useState(project.notes || '');
    const [status, setStatus] = useState(project.status || 'developing');

    const handleSubmit = () => {
        if (!name.trim()) return;
        onSave({
            ...project,
            name: name.trim(),
            client,
            projectNumber,
            dueDate,
            notes,
            status,
            updatedAt: new Date().toISOString()
        });
        onClose();
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '500px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.Edit /> Edit Project
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Project Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            style={styles.input}
                            placeholder="e.g., Corporate HQ AV Refresh"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Client</label>
                            <input type="text" value={client} onChange={e => setClient(e.target.value)} style={styles.input} placeholder="Client name" />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Project Number</label>
                            <input type="text" value={projectNumber} onChange={e => setProjectNumber(e.target.value)} style={styles.input} placeholder="e.g., P-2024-001" />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Due Date</label>
                            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={styles.input} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Status</label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value)}
                                style={{ ...styles.input, cursor: 'pointer' }}>
                                {Object.entries(PROJECT_STATUSES).map(([key, val]) => (
                                    <option key={key} value={key}>{val.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...styles.textarea, minHeight: '80px' }} placeholder="Project notes..." />
                    </div>
                </div>
                {project.revisions?.length > 0 && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Revision History</label>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #2f3336', borderRadius: '8px' }}>
                            {project.revisions.map(rev => (
                                <div key={rev.id} style={{ padding: '8px 12px', borderBottom: '1px solid #2f3336', fontSize: '13px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '600', color: rev.id === project.currentRevision ? '#f59e0b' : '#e7e9ea' }}>{rev.label}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {rev.snapshot && onViewRevision && (
                                                <button
                                                    onClick={() => onViewRevision(rev.id)}
                                                    style={{ background: 'none', border: '1px solid #2f3336', borderRadius: '4px', color: '#1d9bf0', fontSize: '11px', padding: '2px 8px', cursor: 'pointer' }}
                                                >View</button>
                                            )}
                                            <span style={{ color: '#6e767d', fontSize: '11px' }}>{new Date(rev.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    {rev.createdBy && <div style={{ color: '#6e767d', fontSize: '11px', marginTop: '1px' }}>by {rev.createdBy}</div>}
                                    {rev.notes && <div style={{ color: '#8b98a5', fontSize: '12px', marginTop: '2px' }}>{rev.notes}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button style={{ ...styles.button('primary'), opacity: !name.trim() ? 0.5 : 1 }} disabled={!name.trim()} onClick={handleSubmit}>Save Changes</button>
                </div>
            </div>
        </div>
    );
}
