import React, { useState, useEffect } from 'react';
import { ITabAttributes } from '../../../shared/types';
import { Icons } from '../components/Icons';

interface UploadModalProps {
    fileName: string;
    initialAttributes?: ITabAttributes;
    onConfirm: (attributes: ITabAttributes) => Promise<void> | void;
    onCancel: () => void;
    isEditMode?: boolean;
    batchProgress?: { current: number, total: number };
    pdfPreview?: string | null;
    suggestedAttributes?: { tuning?: string, capo?: number };
}

export const UploadModal: React.FC<UploadModalProps> = ({
    fileName,
    initialAttributes,
    onConfirm,
    onCancel,
    isEditMode = false,
    batchProgress,
    pdfPreview,
    suggestedAttributes
}) => {
    const [tuning, setTuning] = useState('');
    const [capo, setCapo] = useState<number | ''>('');
    const [status, setStatus] = useState<'To Learn' | 'Learning' | 'Learned' | 'None'>('None');
    const [isFavorite, setIsFavorite] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

    useEffect(() => {
        if (initialAttributes) {
            setTuning(initialAttributes.tuning || 'Standard');
            setCapo(initialAttributes.capo !== undefined ? initialAttributes.capo : '');
            setStatus(initialAttributes.status as any || 'None');
            setIsFavorite(!!initialAttributes.isFavorite);
        } else if (suggestedAttributes) {
            // Use suggested attributes from PDF analysis
            if (suggestedAttributes.tuning) {
                setTuning(suggestedAttributes.tuning);
            }
            if (suggestedAttributes.capo !== undefined) {
                setCapo(suggestedAttributes.capo);
            }
        }
    }, [initialAttributes, suggestedAttributes]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onConfirm({
                tuning: tuning || 'Standard',
                capo: capo === '' ? 0 : Number(capo),
                status,
                isFavorite
            });
        } finally {
            // Note: If onConfirm closes the modal, this component will unmount
            setIsSubmitting(false);
        }
    };

    const hasPdfPreview = !!pdfPreview;

    return (
        <>
            {/* Fullscreen Preview Overlay */}
            {isPreviewFullscreen && pdfPreview && (
                <div
                    onClick={() => setIsPreviewFullscreen(false)}
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2000,
                        cursor: 'zoom-out',
                        padding: 40
                    }}
                >
                    <img
                        src={pdfPreview}
                        alt="PDF Preview Fullscreen"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            borderRadius: 8,
                            boxShadow: '0 8px 40px rgba(0,0,0,0.5)'
                        }}
                    />
                    <div style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
                        color: '#fff',
                        fontSize: 14,
                        opacity: 0.7
                    }}>
                        Click anywhere to close
                    </div>
                </div>
            )}

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
                    width: hasPdfPreview ? 700 : 400,
                    maxWidth: '95vw',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                    border: '1px solid #333',
                    display: 'flex',
                    gap: 24
                }}>
                    {/* PDF Preview Panel */}
                    {hasPdfPreview && (
                        <div style={{
                            flex: '0 0 280px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8
                        }}>
                            <span style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                PDF Preview
                            </span>
                            <div
                                onClick={() => setIsPreviewFullscreen(true)}
                                style={{
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    border: '1px solid #333',
                                    background: '#fff',
                                    cursor: 'zoom-in'
                                }}
                            >
                                <img
                                    src={pdfPreview}
                                    alt="PDF Preview"
                                    style={{
                                        width: '100%',
                                        height: 'auto',
                                        display: 'block'
                                    }}
                                />
                            </div>
                            <span style={{ color: '#666', fontSize: 11, fontStyle: 'italic' }}>
                                Click to enlarge
                            </span>
                        </div>
                    )}

                    {/* Form Panel */}
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0, color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                                {isEditMode ? <Icons.Edit size={20} color="#bb86fc" /> : <Icons.Upload size={20} color="#bb86fc" />}
                                {isEditMode ? 'Edit Tab Details' : 'Upload Details'}
                            </h3>
                            {batchProgress && (
                                <div style={{
                                    background: 'rgba(187, 134, 252, 0.2)',
                                    color: '#bb86fc',
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    fontSize: 12,
                                    fontWeight: 600
                                }}>
                                    {batchProgress.current} / {batchProgress.total}
                                </div>
                            )}
                        </div>

                        <p style={{ color: '#ccc', marginBottom: 20, wordBreak: 'break-all', fontSize: 13 }}>
                            File: <span style={{ color: '#fff' }}>{fileName}</span>
                        </p>

                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: 6, fontSize: 14 }}>Tuning</label>
                                <select
                                    value={tuning}
                                    onChange={(e) => setTuning(e.target.value)}
                                    style={{
                                        width: '100%', padding: '10px', backgroundColor: '#2b2b36',
                                        border: '1px solid #444', borderRadius: 4, color: '#fff',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    <option value="">Select Tuning...</option>
                                    <option value="Standard">Standard (E A D G B E)</option>
                                    <option value="Drop D">Drop D (D A D G B E)</option>
                                    <option value="Eb Standard">Eb Standard (Eb Ab Db Gb Bb Eb)</option>
                                    <option value="D Standard">D Standard (D G C F A D)</option>
                                    <option value="Open D">Open D (D A D F# A D)</option>
                                    <option value="Open G">Open G (D G D G B D)</option>
                                    <option value="DADGAD">DADGAD</option>
                                    <option value="FADGBE">FADGBE</option>
                                    <option value="Custom">Custom</option>
                                </select>
                                {tuning === 'Custom' && (
                                    <input
                                        type="text"
                                        placeholder="Enter custom tuning"
                                        onChange={(e) => setTuning(e.target.value)}
                                        style={{
                                            marginTop: 8,
                                            width: '100%', padding: '10px', backgroundColor: '#2b2b36',
                                            border: '1px solid #444', borderRadius: 4, color: '#fff',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                )}
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: 6, fontSize: 14 }}>Capo Position</label>
                                <input
                                    type="number"
                                    min="0" max="12"
                                    value={capo}
                                    onChange={(e) => setCapo(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0 (No Capo)"
                                    style={{
                                        width: '100%', padding: '10px', backgroundColor: '#2b2b36',
                                        border: '1px solid #444', borderRadius: 4, color: '#fff',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: 6, fontSize: 14 }}>Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as any)}
                                    style={{
                                        width: '100%', padding: '10px', backgroundColor: '#2b2b36',
                                        border: '1px solid #444', borderRadius: 4, color: '#fff',
                                        boxSizing: 'border-box'
                                    }}
                                >
                                    <option value="None">None</option>
                                    <option value="To Learn">To Learn</option>
                                    <option value="Learning">Learning</option>
                                    <option value="Learned">Learned</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input
                                    type="checkbox"
                                    id="fav"
                                    checked={isFavorite}
                                    onChange={(e) => setIsFavorite(e.target.checked)}
                                    style={{ width: 16, height: 16 }}
                                />
                                <label htmlFor="fav" style={{ color: '#fff', cursor: 'pointer' }}>Mark as Favorite</label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    style={{
                                        padding: '10px 16px', backgroundColor: 'transparent',
                                        border: '1px solid #555', borderRadius: 4, color: '#ccc', cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    style={{
                                        padding: '10px 20px', backgroundColor: isSubmitting ? '#555' : '#bb86fc',
                                        border: 'none', borderRadius: 4, color: '#000', fontWeight: 'bold',
                                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                        opacity: isSubmitting ? 0.7 : 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8
                                    }}
                                >
                                    {isSubmitting && <Icons.RefreshCw size={16} className="animate-spin" />}
                                    {isSubmitting ? (isEditMode ? 'Saving...' : 'Uploading...') : (isEditMode ? 'Save Changes' : 'Upload')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
};
