import React from 'react';
const { useState } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { PROJECT_STATUSES } from '../constants';

// Suggested role values for the stakeholder list — typed into a free-text
// input backed by a datalist so PMs can pick or type their own.
const STAKEHOLDER_ROLE_SUGGESTIONS = [
    'GC Contact',
    'EC Contact',
    'Lead Tech',
    'Programmer',
    'Sales / Estimator',
    'IT Contact',
    'Architect',
    'Designer',
    'Owner',
];

const newStakeholderRow = () => ({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    role: '',
    name: '',
    email: '',
    phone: '',
});

export default function EditProjectModal({ project, onClose, onSave, onViewRevision }) {
    const [name, setName] = useState(project.name || '');
    const [client, setClient] = useState(project.client || '');
    const [projectNumber, setProjectNumber] = useState(project.projectNumber || '');
    const [dueDate, setDueDate] = useState(project.dueDate || '');
    const [notes, setNotes] = useState(project.notes || '');
    const [status, setStatus] = useState(project.status || 'developing');
    const pc = project.primaryContact || {};
    const sa = project.siteAddress || {};
    const [contactName, setContactName] = useState(pc.name || '');
    const [contactRole, setContactRole] = useState(pc.role || '');
    const [contactEmail, setContactEmail] = useState(pc.email || '');
    const [contactPhone, setContactPhone] = useState(pc.phone || '');
    const [siteLine1, setSiteLine1] = useState(sa.line1 || '');
    const [siteLine2, setSiteLine2] = useState(sa.line2 || '');
    const [siteCity, setSiteCity] = useState(sa.city || '');
    const [siteState, setSiteState] = useState(sa.state || '');
    const [siteZip, setSiteZip] = useState(sa.zip || '');
    const [contractDate, setContractDate] = useState(project.contractDate || '');
    const [installStart, setInstallStart] = useState(project.installStart || '');
    const [installEnd, setInstallEnd] = useState(project.installEnd || '');
    const [stakeholders, setStakeholders] = useState(
        Array.isArray(project.stakeholders) && project.stakeholders.length > 0
            ? project.stakeholders.map(s => ({ id: s.id || newStakeholderRow().id, role: s.role || '', name: s.name || '', email: s.email || '', phone: s.phone || '' }))
            : []
    );

    const updateStakeholder = (id, patch) => {
        setStakeholders(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    };
    const addStakeholder = () => {
        setStakeholders(prev => [...prev, newStakeholderRow()]);
    };
    const removeStakeholder = (id) => {
        setStakeholders(prev => prev.filter(s => s.id !== id));
    };

    const handleSubmit = () => {
        if (!name.trim()) return;
        const cleanedStakeholders = stakeholders
            .map(s => ({ id: s.id, role: s.role.trim(), name: s.name.trim(), email: s.email.trim(), phone: s.phone.trim() }))
            .filter(s => s.role || s.name || s.email || s.phone);
        onSave({
            ...project,
            name: name.trim(),
            client,
            projectNumber,
            dueDate,
            notes,
            status,
            contractDate: contractDate || '',
            installStart: installStart || '',
            installEnd: installEnd || '',
            stakeholders: cleanedStakeholders,
            primaryContact: {
                name: contactName.trim(),
                role: contactRole.trim(),
                email: contactEmail.trim(),
                phone: contactPhone.trim(),
            },
            siteAddress: {
                line1: siteLine1.trim(),
                line2: siteLine2.trim(),
                city: siteCity.trim(),
                state: siteState.trim(),
                zip: siteZip.trim(),
            },
            updatedAt: new Date().toISOString()
        });
        onClose();
    };

    const sectionLabel = { fontSize: '11px', color: '#6e767d', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600', marginBottom: '10px', paddingBottom: '6px', borderBottom: '1px solid #2f3336' };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '640px' }} onClick={e => e.stopPropagation()}>
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
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Status</label>
                        <select
                            value={status}
                            onChange={e => setStatus(e.target.value)}
                            style={{ ...styles.input, cursor: 'pointer', maxWidth: '260px' }}>
                            {Object.entries(PROJECT_STATUSES).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <div style={sectionLabel}>Key Dates</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Contract Signed</label>
                                <input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Target Completion</label>
                                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Install Start</label>
                                <input type="date" value={installStart} onChange={e => setInstallStart(e.target.value)} style={styles.input} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Install End</label>
                                <input type="date" value={installEnd} onChange={e => setInstallEnd(e.target.value)} style={styles.input} />
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style={sectionLabel}>Primary Contact</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Name</label>
                                <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} style={styles.input} placeholder="Jane Smith" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Role</label>
                                <input type="text" value={contactRole} onChange={e => setContactRole(e.target.value)} style={styles.input} placeholder="Facilities Manager" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Email</label>
                                <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} style={styles.input} placeholder="jane@client.com" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#8b98a5' }}>Phone</label>
                                <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={styles.input} placeholder="555-555-1234" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style={sectionLabel}>Site Address</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input type="text" value={siteLine1} onChange={e => setSiteLine1(e.target.value)} style={styles.input} placeholder="Street address" />
                            <input type="text" value={siteLine2} onChange={e => setSiteLine2(e.target.value)} style={styles.input} placeholder="Suite / floor / building (optional)" />
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                                <input type="text" value={siteCity} onChange={e => setSiteCity(e.target.value)} style={styles.input} placeholder="City" />
                                <input type="text" value={siteState} onChange={e => setSiteState(e.target.value)} style={styles.input} placeholder="State" />
                                <input type="text" value={siteZip} onChange={e => setSiteZip(e.target.value)} style={styles.input} placeholder="Zip" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <div style={{ ...sectionLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 'none', paddingBottom: 0 }}>
                            <span>Stakeholders</span>
                            <button
                                type="button"
                                onClick={addStakeholder}
                                style={{ ...styles.smallButton, padding: '4px 10px', fontSize: '11px' }}
                                title="Add a stakeholder"
                            >
                                <Icons.Plus /> Add
                            </button>
                        </div>
                        <div style={{ borderBottom: '1px solid #2f3336', marginBottom: '10px' }} />
                        <datalist id="stakeholder-role-suggestions">
                            {STAKEHOLDER_ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}
                        </datalist>
                        {stakeholders.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {stakeholders.map(s => (
                                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr 130px 32px', gap: '8px', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            list="stakeholder-role-suggestions"
                                            value={s.role}
                                            onChange={e => updateStakeholder(s.id, { role: e.target.value })}
                                            style={{ ...styles.inputSmall, width: '100%' }}
                                            placeholder="Role"
                                        />
                                        <input type="text" value={s.name} onChange={e => updateStakeholder(s.id, { name: e.target.value })} style={{ ...styles.inputSmall, width: '100%' }} placeholder="Name" />
                                        <input type="email" value={s.email} onChange={e => updateStakeholder(s.id, { email: e.target.value })} style={{ ...styles.inputSmall, width: '100%' }} placeholder="Email" />
                                        <input type="tel" value={s.phone} onChange={e => updateStakeholder(s.id, { phone: e.target.value })} style={{ ...styles.inputSmall, width: '100%' }} placeholder="Phone" />
                                        <button
                                            type="button"
                                            onClick={() => removeStakeholder(s.id)}
                                            style={{ ...styles.iconButton, color: '#f87171', padding: '4px' }}
                                            title="Remove stakeholder"
                                        >
                                            <Icons.X />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: '#6e767d', fontSize: '12px', fontStyle: 'italic', padding: '4px 0' }}>
                                No stakeholders yet. Add the GC, lead tech, programmer, etc.
                            </div>
                        )}
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
                                        <span style={{ fontWeight: '600', color: '#e7e9ea' }}>{rev.label}</span>
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
