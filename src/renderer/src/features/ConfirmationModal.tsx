import React from 'react';
import { Icons } from '../components/Icons';

interface ConfirmationModalProps {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    isDestructive = false,
    onConfirm,
    onCancel
}) => {
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#1e1e24',
                padding: 24,
                borderRadius: 8,
                width: 400,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                border: '1px solid #333'
            }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isDestructive && <Icons.Trash2 size={20} color="#f44336" />}
                    {title}
                </h3>

                <p style={{ color: '#ccc', marginBottom: 24, lineHeight: 1.5 }}>
                    {message}
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            padding: '10px 16px', backgroundColor: 'transparent',
                            border: '1px solid #555', borderRadius: 4, color: '#ccc', cursor: 'pointer'
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: isDestructive ? 'rgba(244, 67, 54, 0.1)' : '#bb86fc',
                            border: isDestructive ? '1px solid #f44336' : 'none',
                            borderRadius: 4,
                            color: isDestructive ? '#f44336' : '#000',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
