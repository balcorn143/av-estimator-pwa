import React from 'react'
const { useState } = React
import { styles } from '../styles'
import { Icons } from '../icons'

// Project notes / status log. Date-stamped free-form notes from anyone on
// the project — PM, engineer, lead tech — about the current state of the
// work. Stored inline at project.fieldLog as an array of
// { id, date, body, author }.

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default function FieldLogTab({ project, onPatchProject, session }) {
    const entries = Array.isArray(project?.fieldLog) ? project.fieldLog : [];
    const [body, setBody] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

    const addEntry = () => {
        if (!body.trim()) return;
        const entry = {
            id: genId(),
            date,
            body: body.trim(),
            author: session?.user?.email || '',
            createdAt: new Date().toISOString(),
        };
        onPatchProject({ fieldLog: [entry, ...entries] });
        setBody('');
    };

    const deleteEntry = (id) => {
        onPatchProject({ fieldLog: entries.filter(e => e.id !== id) });
    };

    const sorted = [...entries].sort((a, b) => `${b.date}|${b.createdAt || ''}`.localeCompare(`${a.date}|${a.createdAt || ''}`));

    return (
        <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#e7e9ea' }}>Notes</h3>
            <div style={{ color: '#6e767d', fontSize: '12px', marginBottom: '14px' }}>
                Status notes from anyone on the project — PM, engineer, lead tech. Date-stamped, newest first.
            </div>

            <div style={{ backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...styles.inputSmall, width: '150px', flexShrink: 0 }} />
                    <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        placeholder="What's the current status? (Ctrl+Enter to save)"
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addEntry(); } }}
                        style={{ ...styles.textarea, minHeight: '60px', flex: 1 }}
                    />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <button style={{ ...styles.button('primary'), opacity: body.trim() ? 1 : 0.5 }} disabled={!body.trim()} onClick={addEntry}>
                        <Icons.Plus /> Add Entry
                    </button>
                </div>
            </div>

            {sorted.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e767d', backgroundColor: '#151a21', borderRadius: '12px', border: '1px dashed #2f3336', fontSize: '13px' }}>
                    No notes yet.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {sorted.map(entry => {
                        const entryDate = new Date(entry.date + 'T00:00:00');
                        const dateLabel = Number.isNaN(entryDate.getTime())
                            ? entry.date
                            : entryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' });
                        return (
                            <div key={entry.id} style={{ backgroundColor: '#1a1f26', border: '1px solid #2f3336', borderRadius: '10px', padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <span style={{ fontWeight: '600', color: '#e7e9ea', fontSize: '13px' }}>{dateLabel}</span>
                                        {entry.author && <span style={{ color: '#8b98a5', fontSize: '12px' }}>by {entry.author}</span>}
                                    </div>
                                    <button
                                        onClick={() => deleteEntry(entry.id)}
                                        style={{ ...styles.iconButton, color: '#6e767d', padding: '4px' }}
                                        title="Delete entry"
                                    >
                                        <Icons.X />
                                    </button>
                                </div>
                                <div style={{ color: '#c9d1d9', fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{entry.body}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
