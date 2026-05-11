import React from 'react';
import { styles } from '../styles';
import { Icons } from '../icons';

export default function CheckoutModal({ mode, projectName, checkedOutBy, isCheckedOutByOther, onCheckout, onReadOnly, onCheckin, onKeepCheckedOut, onClose }) {
    if (mode === 'checkout') {
        return (
            <div style={styles.modal} onClick={onClose}>
                <div style={{ ...styles.modalContent, width: '450px' }} onClick={e => e.stopPropagation()}>
                    <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icons.Lock /> Open Project
                    </h2>
                    <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '600', color: '#e7e9ea' }}>{projectName}</span>
                    </p>
                    {isCheckedOutByOther ? (
                        <>
                            <div style={{
                                backgroundColor: '#3d2e1a', border: '1px solid #f59e0b', borderRadius: '8px',
                                padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'
                            }}>
                                <Icons.Lock />
                                <span style={{ color: '#ffad1f', fontSize: '13px' }}>
                                    Checked out by <strong>{checkedOutBy}</strong>. You can open in read-only mode.
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button style={styles.button('secondary')} onClick={onClose}>Cancel</button>
                                <button style={styles.button('primary')} onClick={onReadOnly}>
                                    Open Read-Only
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p style={{ color: '#6e767d', fontSize: '13px', marginBottom: '20px' }}>
                                Check out to edit, or open read-only to browse without locking.
                            </p>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button style={styles.button('secondary')} onClick={onReadOnly}>
                                    Open Read-Only
                                </button>
                                <button style={styles.button('primary')} onClick={onCheckout}>
                                    <Icons.Lock /> Check Out &amp; Edit
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // mode === 'checkin'
    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={{ ...styles.modalContent, width: '450px' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icons.Unlock /> Close Project
                </h2>
                <p style={{ color: '#8b98a5', fontSize: '14px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '600', color: '#e7e9ea' }}>{projectName}</span>
                </p>
                <p style={{ color: '#6e767d', fontSize: '13px', marginBottom: '20px' }}>
                    Check in so others can edit, or keep checked out to resume later.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button style={styles.button('secondary')} onClick={onKeepCheckedOut}>
                        Keep Checked Out
                    </button>
                    <button style={styles.button('primary')} onClick={onCheckin}>
                        <Icons.Unlock /> Check In
                    </button>
                </div>
            </div>
        </div>
    );
}
