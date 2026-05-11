import React from 'react';
const { useState, useEffect } = React;
import { styles } from '../styles';
import { Icons } from '../icons';
import { supabase } from '../config';

export default function TeamModal({ team, session, onClose, onTeamUpdate }) {
    const [mode, setMode] = useState(team ? 'view' : 'choose'); // 'choose', 'create', 'join', 'view'
    const [teamName, setTeamName] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    // Load members when viewing team
    useEffect(() => {
        if (team && supabase) {
            supabase.rpc('get_team_members', { p_team_id: team.id })
                .then(({ data, error }) => {
                    if (data) setMembers(data);
                    else if (error) {
                        // Fallback to basic query without emails
                        supabase.from('team_members')
                            .select('user_id, role, joined_at')
                            .eq('team_id', team.id)
                            .then(({ data }) => { if (data) setMembers(data); });
                    }
                });
        }
    }, [team]);

    const createTeam = async () => {
        if (!teamName.trim() || !supabase || !session) return;
        setLoading(true);
        setError('');
        try {
            // Create team
            const { data: newTeam, error: teamErr } = await supabase
                .from('teams')
                .insert({ name: teamName.trim(), created_by: session.user.id })
                .select()
                .single();
            if (teamErr) throw teamErr;

            // Add creator as owner
            const { error: memberErr } = await supabase
                .from('team_members')
                .insert({ team_id: newTeam.id, user_id: session.user.id, role: 'owner' });
            if (memberErr) throw memberErr;

            // Migrate existing projects to team
            const { error: projErr } = await supabase
                .from('projects')
                .update({ team_id: newTeam.id })
                .eq('user_id', session.user.id);
            if (projErr) console.error('Project migration error:', projErr);

            // Migrate user_settings to team
            const { error: settErr } = await supabase
                .from('user_settings')
                .update({ team_id: newTeam.id })
                .eq('user_id', session.user.id);
            if (settErr) console.error('Settings migration error:', settErr);

            onTeamUpdate({ id: newTeam.id, name: newTeam.name, invite_code: newTeam.invite_code, role: 'owner' });
            onClose();
        } catch (e) {
            setError(e.message || 'Failed to create team');
        }
        setLoading(false);
    };

    const joinTeam = async () => {
        if (!inviteCode.trim() || !supabase) return;
        setLoading(true);
        setError('');
        try {
            const { data: teamId, error: rpcErr } = await supabase
                .rpc('join_team_by_code', { code: inviteCode.trim().toLowerCase() });
            if (rpcErr) throw rpcErr;

            // Fetch team details
            const { data: teamData } = await supabase
                .from('teams')
                .select('id, name, invite_code')
                .eq('id', teamId)
                .single();

            if (teamData) {
                // Migrate user's existing projects to team
                await supabase.from('projects')
                    .update({ team_id: teamData.id })
                    .eq('user_id', session.user.id);

                await supabase.from('user_settings')
                    .update({ team_id: teamData.id })
                    .eq('user_id', session.user.id);

                onTeamUpdate({ id: teamData.id, name: teamData.name, invite_code: teamData.invite_code, role: 'member' });
            }
            onClose();
        } catch (e) {
            setError(e.message?.includes('Invalid') ? 'Invalid invite code' : (e.message || 'Failed to join team'));
        }
        setLoading(false);
    };

    const leaveTeam = async () => {
        if (!supabase || !team) return;
        setLoading(true);
        try {
            // Unlink projects from team (keep them as user's own)
            await supabase.from('projects')
                .update({ team_id: null })
                .eq('user_id', session.user.id)
                .eq('team_id', team.id);

            await supabase.from('user_settings')
                .update({ team_id: null })
                .eq('user_id', session.user.id);

            await supabase.from('team_members')
                .delete()
                .eq('team_id', team.id)
                .eq('user_id', session.user.id);

            onTeamUpdate(null);
            onClose();
        } catch (e) {
            setError(e.message || 'Failed to leave team');
        }
        setLoading(false);
    };

    const copyCode = () => {
        if (team?.invite_code) {
            navigator.clipboard.writeText(team.invite_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const inputStyle = { ...styles.input, marginBottom: '12px' };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '450px' }} onClick={e => e.stopPropagation()}>
                {/* View existing team */}
                {mode === 'view' && team && (
                    <>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icons.Users /> {team.name}
                        </h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#8b98a5', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invite Code</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <code style={{ flex: 1, padding: '10px 14px', backgroundColor: '#1a1f26', borderRadius: '8px', border: '1px solid #2f3336', fontSize: '18px', fontFamily: 'monospace', letterSpacing: '0.15em', color: '#1d9bf0' }}>{team.invite_code}</code>
                                <button style={{ ...styles.smallButton, padding: '10px 14px' }} onClick={copyCode}>
                                    {copied ? <><Icons.Check /> Copied</> : <><Icons.Copy /> Copy</>}
                                </button>
                            </div>
                            <p style={{ fontSize: '12px', color: '#6e767d', marginTop: '6px' }}>Share this code with teammates so they can join</p>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#8b98a5', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members ({members.length})</label>
                            {members.map(m => (
                                <div key={m.user_id} style={{ padding: '8px 12px', backgroundColor: '#1a1f26', borderRadius: '6px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', color: '#e7e9ea' }}>{m.user_id === session.user.id ? `${session.user.email} (you)` : (m.email || m.user_id.slice(0, 8) + '...')}</span>
                                    <span style={{ ...styles.badge(m.role === 'owner' ? 'blue' : 'green'), fontSize: '10px' }}>{m.role}</span>
                                </div>
                            ))}
                        </div>

                        {error && <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid #2f3336', paddingTop: '16px' }}>
                            <button style={{ ...styles.button('secondary'), color: '#f87171' }} onClick={leaveTeam} disabled={loading}>
                                {loading ? 'Leaving...' : 'Leave Team'}
                            </button>
                            <button style={styles.button('secondary')} onClick={onClose}>Close</button>
                        </div>
                    </>
                )}

                {/* Choose create or join */}
                {mode === 'choose' && (
                    <>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icons.Users /> Team Setup
                        </h2>
                        <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '20px' }}>Teams let you share projects, packages, and catalog customizations with your coworkers.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                            <button
                                style={{ padding: '16px', backgroundColor: '#1a1f26', border: '2px solid #2f3336', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', color: '#e7e9ea' }}
                                onClick={() => setMode('create')}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#1d9bf0'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = '#2f3336'}
                            >
                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>Create a Team</div>
                                <div style={{ fontSize: '13px', color: '#8b98a5' }}>Start a new team and invite your coworkers</div>
                            </button>
                            <button
                                style={{ padding: '16px', backgroundColor: '#1a1f26', border: '2px solid #2f3336', borderRadius: '10px', cursor: 'pointer', textAlign: 'left', color: '#e7e9ea' }}
                                onClick={() => setMode('join')}
                                onMouseEnter={e => e.currentTarget.style.borderColor = '#00ba7c'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = '#2f3336'}
                            >
                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>Join a Team</div>
                                <div style={{ fontSize: '13px', color: '#8b98a5' }}>Enter an invite code from your team owner</div>
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                        </div>
                    </>
                )}

                {/* Create team */}
                {mode === 'create' && (
                    <>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700' }}>Create a Team</h2>
                        <label style={{ display: 'block', fontSize: '12px', color: '#8b98a5', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team Name</label>
                        <input
                            type="text"
                            value={teamName}
                            onChange={e => setTeamName(e.target.value)}
                            style={inputStyle}
                            placeholder="e.g., AV Design Team"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && createTeam()}
                        />
                        <p style={{ fontSize: '12px', color: '#6e767d', marginBottom: '16px' }}>Your existing projects will be shared with the team.</p>
                        {error && <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button style={styles.button('secondary')} onClick={() => { setMode('choose'); setError(''); }}>Back</button>
                            <button style={{ ...styles.button('primary'), opacity: !teamName.trim() ? 0.5 : 1 }} onClick={createTeam} disabled={!teamName.trim() || loading}>
                                {loading ? 'Creating...' : 'Create Team'}
                            </button>
                        </div>
                    </>
                )}

                {/* Join team */}
                {mode === 'join' && (
                    <>
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700' }}>Join a Team</h2>
                        <label style={{ display: 'block', fontSize: '12px', color: '#8b98a5', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Invite Code</label>
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={e => setInviteCode(e.target.value)}
                            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '16px', letterSpacing: '0.1em' }}
                            placeholder="e.g., a1b2c3d4"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && joinTeam()}
                        />
                        <p style={{ fontSize: '12px', color: '#6e767d', marginBottom: '16px' }}>Ask your team owner for the invite code.</p>
                        {error && <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button style={styles.button('secondary')} onClick={() => { setMode('choose'); setError(''); }}>Back</button>
                            <button style={{ ...styles.button('primary'), backgroundColor: '#00ba7c', opacity: !inviteCode.trim() ? 0.5 : 1 }} onClick={joinTeam} disabled={!inviteCode.trim() || loading}>
                                {loading ? 'Joining...' : 'Join Team'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
