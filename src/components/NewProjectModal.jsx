import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';

export default function NewProjectModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [client, setClient] = useState('');
    const [projectNumber, setProjectNumber] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [notes, setNotes] = useState('');

    const handleSubmit = () => {
        if (!name.trim()) return;
        onCreate({ name: name.trim(), client, projectNumber, dueDate, notes });
        onClose();
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '500px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.Plus /> New Project
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
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Due Date</label>
                        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={styles.input} />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...styles.textarea, minHeight: '80px' }} placeholder="Project notes..." />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                    <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                    <button style={{ ...styles.button('primary'), opacity: !name.trim() ? 0.5 : 1 }} disabled={!name.trim()} onClick={handleSubmit}>Create Project</button>
                </div>
            </div>
        </div>
    );
}
