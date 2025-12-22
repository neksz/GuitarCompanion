import React, { useEffect, useState } from 'react';
import { IGuitarTab, ITabAttributes } from '../../../shared/types';
import { UploadModal } from './UploadModal';
import { ConfirmationModal } from './ConfirmationModal';
import { Icons } from '../components/Icons';
import { api } from '../services/api';

interface FileBrowserProps {
    searchQuery?: string;
    activeCategory: string;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ searchQuery = '', activeCategory = 'all' }) => {
    const [tabs, setTabs] = useState<IGuitarTab[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [capoFilter, setCapoFilter] = useState('');
    // Store regular File object for Web, and path for Electron
    const [uploadFile, setUploadFile] = useState<{ file: File, path: string } | null>(null);
    const [editTab, setEditTab] = useState<IGuitarTab | null>(null);
    const [deleteTab, setDeleteTab] = useState<IGuitarTab | null>(null); // State for deletion confirmation

    const loadTabs = async (showSpinner = true) => {
        try {
            if (showSpinner) setLoading(true);
            const files = await api.getFiles();
            setTabs(files);
        } catch (e) {
            console.error(e);
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    useEffect(() => {
        // Auto-load tabs on mount
        loadTabs();

        // For web version: retry loading if empty (session might still be restoring)
        const retryInterval = setInterval(async () => {
            if (tabs.length === 0) {
                console.log('[FileBrowser] Retrying tab load (session might still be restoring)...');
                const files = await api.getFiles();
                if (files.length > 0) {
                    setTabs(files);
                    setLoading(false);
                    clearInterval(retryInterval);
                }
            } else {
                clearInterval(retryInterval);
            }
        }, 1000);

        // Clean up interval after 10 seconds
        setTimeout(() => clearInterval(retryInterval), 10000);

        return () => clearInterval(retryInterval);
    }, []);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // In Web, path is empty/fake. In Electron, getFilePath returns real path.
        const filePath = api.getFilePath(file);

        // We set both. Our API abstraction handles which one to use.
        setUploadFile({ file, path: filePath || '' });

        // Reset input
        e.target.value = '';
    };

    const handleConfirmUpload = async (attributes: ITabAttributes) => {
        if (!uploadFile) return;

        try {
            // Pass both file object and path. The implementation decides which to use.
            const res = await api.uploadFile(uploadFile.file, uploadFile.path, uploadFile.file.name, attributes);
            if (res.success) {
                await loadTabs();
            } else {
                alert('Upload failed: ' + res.error);
            }
        } catch (err) {
            console.error('Upload Error:', err);
            alert('Upload failed');
        } finally {
            setUploadFile(null);
        }
    };

    // Confirm Edit
    const handleConfirmEdit = async (attributes: ITabAttributes) => {
        if (!editTab) return;

        try {
            const res = await api.updateAttributes(editTab.id, attributes);
            if (res.success) {
                // Optimistically update or reload
                await loadTabs();
            } else {
                alert('Update failed: ' + res.error);
            }
        } catch (err) {
            console.error(err);
            alert('Update failed');
        } finally {
            setEditTab(null);
        }
    };

    // Trigger Delete Logic
    const handleDeleteClick = (e: React.MouseEvent, tab: IGuitarTab) => {
        e.stopPropagation();
        setDeleteTab(tab);
    };

    // Confirm Delete
    const handleConfirmDelete = async () => {
        if (!deleteTab) return;

        const idToDelete = deleteTab.id;

        try {
            const res = await api.deleteFile(idToDelete);
            if (res.success) {
                // Optimistic update: Remove immediately from UI
                setTabs(prev => prev.filter(t => t.id !== idToDelete));

                // We do NOT reload here to prevent the backend (which might be slow to update) 
                // from overwriting our optimistic removal. Next manual refresh will sync.
            } else {
                alert('Delete failed: ' + res.error);
            }
        } catch (err) {
            console.error(err);
            alert('Delete failed');
        } finally {
            setDeleteTab(null);
        }
    };

    const handleOpen = async (tab: IGuitarTab) => {
        try {
            await api.openFile(tab.id, tab.name);
        } catch (e) {
            console.error(e);
            alert('Failed to open file');
        }
    };

    const handleDownload = async (e: React.MouseEvent, tab: IGuitarTab) => {
        e.stopPropagation(); // Prevent opening
        try {
            const res = await api.downloadFile(tab.id, tab.name);
            if (res.success) {
                // In web, download is handled by browser. In electron, it might show success alert.
                // We can just imply success if no error.
            } else if (!res.canceled) {
                alert('Download failed: ' + (res.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert('Download failed');
        }
    };

    // Trigger Edit Modal
    const handleEditClick = (e: React.MouseEvent, tab: IGuitarTab) => {
        e.stopPropagation();
        setEditTab(tab);
    };

    const filteredTabs = tabs.filter(tab => {
        const title = tab.name.toLowerCase();
        const tuning = (tab.attributes?.tuning || '').toLowerCase();
        const status = tab.attributes?.status || 'None';
        const capo = tab.attributes?.capo;

        // 1. Text Search (Reverted Capo check here)
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            if (!title.includes(query) && !tuning.includes(query)) return false;
        }

        // 2. Capo Filter
        if (capoFilter !== '') {
            if (capo !== Number(capoFilter)) return false;
        }

        // 3. Category Filter (Sidebar)
        if (activeCategory === 'favorites' && !tab.attributes?.isFavorite) return false;

        // "Learning List" logic: Show "Learning" and "To Learn"
        // But if User uses the Filter Buttons, should we allow them to override?
        // User requested: "stats Nothing be a pickabe state, this should not appear in the Learning list"
        // So for 'learning' category, we default to excluding 'None' and 'Learned'.
        // However, if the user explicitly selects filters, maybe we should respect that?
        // Let's stick to the request: "search in the learning list... multiple spect"

        if (activeCategory === 'learning') {
            // Strict category rules first
            if (status === 'None' || status === 'Learned') return false;
        }

        // 4. Multi-select Status Filter
        // If filters are active, item MUST match one of them
        if (selectedStatuses.length > 0) {
            if (!selectedStatuses.includes(status)) return false;
        }

        return true;
    });

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#aaa', gap: 10 }}>
            <div className="spinner"></div> Loading Library...
        </div>
    );

    return (
        <div style={{ padding: 30, color: '#fff', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>My Library</h2>
                    <p style={{ margin: '5px 0 0', color: '#888', fontSize: 13 }}>{filteredTabs.length} tabs found</p>

                    <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                        {/* Status Filter Bar */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            {['To Learn', 'Learning', 'Learned', 'None'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setSelectedStatuses(prev =>
                                        prev.includes(s)
                                            ? prev.filter(st => st !== s)
                                            : [...prev, s]
                                    )}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: 12,
                                        border: '1px solid ' + (selectedStatuses.includes(s) ? '#bb86fc' : '#444'),
                                        background: selectedStatuses.includes(s) ? 'rgba(187, 134, 252, 0.15)' : 'transparent',
                                        color: selectedStatuses.includes(s) ? '#bb86fc' : '#888',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        <div style={{ width: 1, height: 20, background: '#444' }}></div>

                        {/* Capo Filter Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#888' }}>Capo:</span>
                            <input
                                type="number"
                                min="0" max="12"
                                placeholder="#"
                                value={capoFilter}
                                onChange={(e) => setCapoFilter(e.target.value)}
                                className="no-spin"
                                style={{
                                    width: 30, // Reduced width since no spinners
                                    background: '#2b2b36',
                                    border: '1px solid ' + (capoFilter ? '#bb86fc' : '#444'),
                                    borderRadius: 4,
                                    color: '#fff',
                                    padding: '4px 8px',
                                    fontSize: 12,
                                    textAlign: 'center'
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                        onClick={() => loadTabs(true)}
                        title="Refresh List"
                        style={{
                            background: '#2b2b36',
                            border: '1px solid #333',
                            color: '#ccc',
                            width: 38,
                            height: 38,
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#2b2b36'; e.currentTarget.style.color = '#ccc'; }}
                    >
                        <Icons.RefreshCw size={18} />
                    </button>

                    {/* Label triggers the input by id, providing 100% reliable click area */}
                    <input
                        id="upload-input"
                        type="file"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                    <label
                        htmlFor="upload-input"
                        style={{
                            background: '#bb86fc',
                            border: 'none',
                            color: '#121212',
                            padding: '10px 20px',
                            height: 38,
                            borderRadius: 8,
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            boxShadow: '0 4px 12px rgba(187, 134, 252, 0.2)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(187, 134, 252, 0.3)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(187, 134, 252, 0.2)'; }}
                    >
                        <Icons.Upload size={18} />
                        Upload Tab
                    </label>
                </div>
            </div>

            {filteredTabs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666', border: '2px dashed #333', borderRadius: 12 }}>
                    <Icons.FileText size={48} style={{ opacity: 0.3, marginBottom: 10 }} />
                    <p>No tabs found. Upload some to get started!</p>
                </div>
            ) : (
                <div style={{ border: '1px solid #333', borderRadius: 8, overflow: 'hidden', background: '#1e1e24' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#2b2b36', color: '#bbb', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Tuning</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Capo</th>
                                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                                <th style={{ padding: '12px 16px', width: 40 }}>Favorited</th>
                                <th style={{ padding: '12px 16px', width: 120, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTabs.map((tab) => (
                                <tr
                                    key={tab.id}
                                    style={{ borderBottom: '1px solid #2b2b36', cursor: 'pointer', transition: 'background 0.2s' }}
                                    onClick={() => handleOpen(tab)}
                                    title="Click to open"
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#25252e'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <td style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8,
                                            background: 'rgba(187, 134, 252, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#bb86fc', flexShrink: 0
                                        }}>
                                            <Icons.Music size={20} />
                                        </div>
                                        <span style={{ fontWeight: 500, fontSize: 14 }}>{tab.name}</span>
                                    </td>
                                    <td style={{ padding: '14px 16px', color: '#aaa', fontSize: 14 }}>
                                        {tab.attributes?.tuning || 'Standard'}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: '#aaa', fontSize: 14 }}>
                                        {tab.attributes?.capo && tab.attributes.capo > 0 ? `Capo ${tab.attributes.capo}` : '-'}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {tab.attributes?.status && (
                                            <span style={{
                                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                                background: tab.attributes.status === 'Learned' ? 'rgba(76, 175, 80, 0.2)' :
                                                    tab.attributes.status === 'Learning' ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                                                color: tab.attributes.status === 'Learned' ? '#4caf50' :
                                                    tab.attributes.status === 'Learning' ? '#ffc107' : '#aaa'
                                            }}>
                                                {tab.attributes.status}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        {tab.attributes?.isFavorite && <Icons.Star size={16} fill="#bb86fc" color="#bb86fc" />}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                            <button
                                                onClick={(e) => handleDownload(e, tab)}
                                                title="Download Tab"
                                                style={{
                                                    background: 'transparent', border: 'none', color: '#888',
                                                    cursor: 'pointer', padding: 8, borderRadius: 6,
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <Icons.Download size={18} />
                                            </button>
                                            <button
                                                onClick={(e) => handleEditClick(e, tab)}
                                                title="Edit Details"
                                                style={{
                                                    background: 'transparent', border: 'none', color: '#888',
                                                    cursor: 'pointer', padding: 8, borderRadius: 6,
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <Icons.Edit size={18} />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteClick(e, tab)}
                                                title="Delete Tab"
                                                style={{
                                                    background: 'transparent', border: 'none', color: '#888',
                                                    cursor: 'pointer', padding: 8, borderRadius: 6,
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.color = '#f44336'; e.currentTarget.style.background = 'rgba(244, 67, 54, 0.1)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <Icons.Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {uploadFile && (
                <UploadModal
                    fileName={uploadFile.file.name}
                    onConfirm={handleConfirmUpload}
                    onCancel={() => setUploadFile(null)}
                />
            )}

            {editTab && (
                <UploadModal
                    fileName={editTab.name}
                    initialAttributes={editTab.attributes}
                    isEditMode={true}
                    onConfirm={handleConfirmEdit}
                    onCancel={() => setEditTab(null)}
                />
            )}

            {deleteTab && (
                <ConfirmationModal
                    title="Delete Tab"
                    message={`Are you sure you want to delete "${deleteTab.name}"? This action cannot be undone.`}
                    confirmLabel="Delete"
                    isDestructive={true}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeleteTab(null)}
                />
            )}
        </div>
    );
};
