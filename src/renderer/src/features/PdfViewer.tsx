import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Minimize2,
    BookOpen,
    FileText,
    ListFilter,
    Sun,
    Moon,
    Flame,
    RotateCw,
    X,
    Music
} from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
    url: string;
    name: string;
    onClose: () => void;
}

type LayoutMode = 'double' | 'single' | 'scroll';
type ColorMode = 'default' | 'dark' | 'sepia';

interface PdfPageProps {
    pdf: pdfjsLib.PDFDocumentProxy;
    pageNumber: number;
    zoom: number;
    rotation: number;
    containerHeight: number;
    containerWidth: number;
    layout: LayoutMode;
    colorMode: ColorMode;
    onRenderSuccess?: (pageNumber: number, width: number, height: number) => void;
}

const PdfPage: React.FC<PdfPageProps> = ({
    pdf,
    pageNumber,
    zoom,
    rotation,
    containerHeight,
    containerWidth,
    layout,
    colorMode,
    onRenderSuccess
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null);
    const renderTaskRef = useRef<any>(null);

    useEffect(() => {
        let isMounted = true;

        const renderPage = async () => {
            try {
                setLoading(true);
                const page = await pdf.getPage(pageNumber);
                if (!isMounted) return;

                // Determine base unscaled viewport at 1.0
                const unscaledViewport = page.getViewport({ scale: 1.0, rotation });

                // Compute optimal fit scale based on viewport size and layout
                // In double mode, we want 2 pages side-by-side to fit nicely in height and width
                let autoScale = 1.0;
                const availableH = Math.max(containerHeight - 40, 300);
                const availableW = Math.max(containerWidth - 60, 400);

                if (layout === 'double') {
                    // Two pages side-by-side: each page can take up to availableW / 2 - gap
                    const targetWidth = (availableW - 32) / 2;
                    const scaleH = availableH / unscaledViewport.height;
                    const scaleW = targetWidth / unscaledViewport.width;
                    autoScale = Math.min(scaleH, scaleW);
                } else if (layout === 'single') {
                    const scaleH = availableH / unscaledViewport.height;
                    const scaleW = availableW / unscaledViewport.width;
                    autoScale = Math.min(scaleH, scaleW);
                } else {
                    // Scroll layout: fit width
                    autoScale = (availableW - 40) / unscaledViewport.width;
                }

                // Minimum readable scale
                autoScale = Math.max(autoScale, 0.4);

                // Multiply by user-controlled zoom
                const finalScale = autoScale * zoom;

                // Sharp rendering using device pixel ratio
                const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
                const viewport = page.getViewport({ scale: finalScale * dpr, rotation });
                const displayWidth = Math.round(viewport.width / dpr);
                const displayHeight = Math.round(viewport.height / dpr);

                setPageDimensions({ width: displayWidth, height: displayHeight });

                const canvas = canvasRef.current;
                if (!canvas) return;

                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = `${displayWidth}px`;
                canvas.style.height = `${displayHeight}px`;

                const context = canvas.getContext('2d', { alpha: false });
                if (!context) return;

                // Fill clean background before drawing
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);

                // Cancel any previous task
                if (renderTaskRef.current) {
                    try {
                        renderTaskRef.current.cancel();
                    } catch {
                        // ignore
                    }
                }

                renderTaskRef.current = page.render({
                    canvasContext: context,
                    viewport: viewport,
                    canvas: canvas as any
                });

                await renderTaskRef.current.promise;

                if (isMounted) {
                    setLoading(false);
                    onRenderSuccess?.(pageNumber, displayWidth, displayHeight);
                }
            } catch (err: any) {
                if (err?.name !== 'RenderingCancelledException') {
                    console.error(`[PdfViewer] Error rendering page ${pageNumber}:`, err);
                }
            }
        };

        renderPage();

        return () => {
            isMounted = false;
            if (renderTaskRef.current) {
                try {
                    renderTaskRef.current.cancel();
                } catch {
                    // ignore
                }
            }
        };
    }, [pdf, pageNumber, zoom, rotation, containerHeight, containerWidth, layout]);

    return (
        <div
            className={`pdf-page-card ${colorMode}`}
            style={{
                width: pageDimensions ? `${pageDimensions.width}px` : 'auto',
                minHeight: pageDimensions ? `${pageDimensions.height}px` : '400px'
            }}
        >
            {loading && (
                <div className="pdf-page-skeleton" style={{ width: pageDimensions?.width || 380, height: pageDimensions?.height || 540 }}>
                    <div className="pdf-page-spinner">
                        <div className="spinner-glow" />
                        <span>Rendering Page {pageNumber}...</span>
                    </div>
                </div>
            )}
            <canvas
                ref={canvasRef}
                className={`pdf-page-canvas ${loading ? 'rendering' : 'rendered'}`}
            />
            <div className="pdf-page-badge">
                Page {pageNumber}
            </div>
        </div>
    );
};

export const PdfViewer: React.FC<PdfViewerProps> = ({ url, name, onClose }) => {
    const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Navigation & Layout State
    // Default to 2-page (double / book view) or user's saved preference
    const [layout, setLayoutState] = useState<LayoutMode>(() => {
        try {
            const saved = localStorage.getItem('guitar_pdf_layout_mode');
            if (saved === 'double' || saved === 'single' || saved === 'scroll') {
                return saved;
            }
        } catch {
            // ignore
        }
        return 'double';
    });

    const [currentPage, setCurrentPage] = useState<number>(1);
    const [zoom, setZoom] = useState<number>(1.0);
    const [rotation, setRotation] = useState<number>(0);

    // Color Mode (Stage / Night Theme) with persistent preference
    const [colorMode, setColorModeState] = useState<ColorMode>(() => {
        try {
            const saved = localStorage.getItem('guitar_pdf_color_mode');
            if (saved === 'default' || saved === 'dark' || saved === 'sepia') {
                return saved;
            }
        } catch {
            // ignore
        }
        return 'default';
    });

    const setLayout = useCallback((mode: LayoutMode | ((prev: LayoutMode) => LayoutMode)) => {
        setLayoutState(prev => {
            const next = typeof mode === 'function' ? mode(prev) : mode;
            try {
                localStorage.setItem('guitar_pdf_layout_mode', next);
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    const setColorMode = useCallback((mode: ColorMode | ((prev: ColorMode) => ColorMode)) => {
        setColorModeState(prev => {
            const next = typeof mode === 'function' ? mode(prev) : mode;
            try {
                localStorage.setItem('guitar_pdf_color_mode', next);
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [pageInputValue, setPageInputValue] = useState<string>('1');

    // Viewport dimensions for responsive layout calculation
    const viewerBodyRef = useRef<HTMLDivElement | null>(null);
    const viewerContainerRef = useRef<HTMLDivElement | null>(null);
    const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
        width: window.innerWidth,
        height: window.innerHeight - 110
    });

    // Update container size on resize
    useEffect(() => {
        const updateSize = () => {
            if (viewerBodyRef.current) {
                const rect = viewerBodyRef.current.getBoundingClientRect();
                setContainerSize({
                    width: rect.width || window.innerWidth,
                    height: rect.height || (window.innerHeight - 110)
                });
            } else {
                setContainerSize({
                    width: window.innerWidth,
                    height: window.innerHeight - 110
                });
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Ensure scrolling starts from the top on page change
    useEffect(() => {
        if (viewerBodyRef.current) {
            viewerBodyRef.current.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [currentPage, layout]);

    // Auto-enter fullscreen if enabled in settings
    useEffect(() => {
        const checkAutoFullscreen = () => {
            try {
                const alwaysFs = localStorage.getItem('guitar_pdf_always_fullscreen') === 'true';
                if (alwaysFs && !document.fullscreenElement) {
                    viewerContainerRef.current?.requestFullscreen?.().catch(() => {});
                }
            } catch {
                // ignore
            }
        };

        checkAutoFullscreen();
    }, []);

    const handleClose = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
        onClose();
    }, [onClose]);

    // Load PDF Document
    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const loadPdf = async () => {
            try {
                const loadingTask = pdfjsLib.getDocument({
                    url,
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/cmaps/',
                    cMapPacked: true
                });
                const loadedPdf = await loadingTask.promise;

                if (isMounted) {
                    setPdf(loadedPdf);
                    setNumPages(loadedPdf.numPages);
                    setCurrentPage(1);
                    setLoading(false);
                }
            } catch (err: any) {
                console.error('[PdfViewer] Failed to load PDF:', err);
                if (isMounted) {
                    setError('Could not load this PDF document. The file format or content might be corrupted.');
                    setLoading(false);
                }
            }
        };

        loadPdf();

        return () => {
            isMounted = false;
        };
    }, [url]);

    // Update page input when currentPage changes
    useEffect(() => {
        if (layout === 'double') {
            const rightPage = currentPage + 1 <= numPages ? currentPage + 1 : null;
            if (rightPage) {
                setPageInputValue(`${currentPage}-${rightPage}`);
            } else {
                setPageInputValue(`${currentPage}`);
            }
        } else {
            setPageInputValue(`${currentPage}`);
        }
    }, [currentPage, layout, numPages]);

    // Page navigation functions
    const canPrev = currentPage > 1;
    const canNext = layout === 'double'
        ? currentPage + 2 <= numPages || (currentPage === 1 && numPages > 2)
        : currentPage < numPages;

    const handlePrev = useCallback(() => {
        if (layout === 'double') {
            setCurrentPage(prev => Math.max(1, prev - 2));
        } else {
            setCurrentPage(prev => Math.max(1, prev - 1));
        }
    }, [layout]);

    const handleNext = useCallback(() => {
        if (layout === 'double') {
            setCurrentPage(prev => {
                if (prev + 2 <= numPages) return prev + 2;
                if (prev + 1 <= numPages) return prev + 1;
                return prev;
            });
        } else {
            setCurrentPage(prev => Math.min(numPages, prev + 1));
        }
    }, [layout, numPages]);

    const handleFirstPage = useCallback(() => {
        setCurrentPage(1);
    }, []);

    const handleLastPage = useCallback(() => {
        if (layout === 'double') {
            // Find last odd page (or last pair start)
            const lastOdd = numPages % 2 === 0 ? numPages - 1 : numPages;
            setCurrentPage(Math.max(1, lastOdd));
        } else {
            setCurrentPage(numPages);
        }
    }, [layout, numPages]);

    const handlePageInputSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = parseInt(pageInputValue.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= numPages) {
            if (layout === 'double') {
                // If user enters an even number e.g. 4, jump to 3 so 3-4 is shown
                const target = parsed % 2 === 0 ? parsed - 1 : parsed;
                setCurrentPage(Math.max(1, target));
            } else {
                setCurrentPage(parsed);
            }
        }
    };

    // Zoom Handlers
    const handleZoomIn = () => setZoom(prev => Math.min(+(prev + 0.15).toFixed(2), 2.5));
    const handleZoomOut = () => setZoom(prev => Math.max(+(prev - 0.15).toFixed(2), 0.5));
    const handleZoomReset = () => setZoom(1.0);

    // Rotate Handler
    const handleRotate = () => {
        setRotation(prev => (prev + 90) % 360);
    };

    // Toggle Fullscreen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            viewerContainerRef.current?.requestFullscreen?.().catch(() => {});
            setIsFullscreen(true);
        } else {
            document.exitFullscreen?.().catch(() => {});
            setIsFullscreen(false);
        }
    };

    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    // Full Keyboard Controls (Left/Right, Space, Esc, Fullscreen, Zoom)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't intercept if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            switch (e.key) {
                case 'Escape':
                    handleClose();
                    break;
                case 'ArrowLeft':
                case 'PageUp':
                case 'a':
                case 'A':
                case 'h':
                    handlePrev();
                    break;
                case 'ArrowRight':
                case 'PageDown':
                case ' ':
                case 'd':
                case 'D':
                case 'l':
                    e.preventDefault(); // Prevent page scroll on space
                    handleNext();
                    break;
                case 'Home':
                    handleFirstPage();
                    break;
                case 'End':
                    handleLastPage();
                    break;
                case '+':
                case '=':
                    handleZoomIn();
                    break;
                case '-':
                case '_':
                    handleZoomOut();
                    break;
                case '0':
                    handleZoomReset();
                    break;
                case 'f':
                case 'F':
                    toggleFullscreen();
                    break;
                case 'r':
                case 'R':
                    handleRotate();
                    break;
                case 'm':
                case 'M':
                    setLayout(prev => prev === 'double' ? 'single' : 'double');
                    break;
                case 'i':
                case 'I':
                    setColorMode(prev => prev === 'dark' ? 'default' : 'dark');
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleClose, handlePrev, handleNext, handleFirstPage, handleLastPage]);

    // Calculate active pages to display based on layout mode
    const pagesToRender = useMemo(() => {
        if (!pdf || numPages === 0) return [];

        if (layout === 'scroll') {
            return Array.from({ length: numPages }, (_, i) => i + 1);
        }

        if (layout === 'double') {
            const pages = [currentPage];
            if (currentPage + 1 <= numPages) {
                pages.push(currentPage + 1);
            }
            return pages;
        }

        // Single page
        return [currentPage];
    }, [pdf, numPages, layout, currentPage]);

    const cleanTitle = name.replace(/\.pdf$/i, '');

    return (
        <div ref={viewerContainerRef} className={`pdf-viewer-overlay ${colorMode}`}>
            {/* Top Navigation Bar */}
            <header className="pdf-viewer-header">
                {/* Left Section: Title & Meta */}
                <div className="pdf-header-left">
                    <div className="pdf-doc-badge">
                        <Music size={14} className="pdf-badge-icon" />
                        <span>PDF TAB</span>
                    </div>
                    <h2 className="pdf-doc-title" title={cleanTitle}>
                        {cleanTitle}
                    </h2>
                </div>

                {/* Center Section: Page Navigation (Hidden in scroll mode) */}
                {layout !== 'scroll' && !loading && !error && (
                    <div className="pdf-header-center">
                        <div className="pdf-nav-pill">
                            <button
                                className="pdf-nav-btn"
                                onClick={handleFirstPage}
                                disabled={!canPrev}
                                title="First Page (Home)"
                            >
                                <ChevronsLeft size={16} />
                            </button>
                            <button
                                className="pdf-nav-btn"
                                onClick={handlePrev}
                                disabled={!canPrev}
                                title="Previous Page (← / PageUp)"
                            >
                                <ChevronLeft size={18} />
                            </button>

                            <form onSubmit={handlePageInputSubmit} className="pdf-page-form">
                                <span className="pdf-page-label">Page</span>
                                <input
                                    type="text"
                                    className="pdf-page-input"
                                    value={pageInputValue}
                                    onChange={e => setPageInputValue(e.target.value)}
                                    title="Type page and press Enter"
                                />
                                <span className="pdf-page-total">/ {numPages}</span>
                            </form>

                            <button
                                className="pdf-nav-btn"
                                onClick={handleNext}
                                disabled={!canNext}
                                title="Next Page (→ / Space / PageDown)"
                            >
                                <ChevronRight size={18} />
                            </button>
                            <button
                                className="pdf-nav-btn"
                                onClick={handleLastPage}
                                disabled={!canNext}
                                title="Last Page (End)"
                            >
                                <ChevronsRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Right Section: Tools & Controls */}
                <div className="pdf-header-right">
                    {!loading && !error && (
                        <>
                            {/* Layout Mode Selector */}
                            <div className="pdf-tool-group" title="Page Layout">
                                <button
                                    className={`pdf-tool-btn ${layout === 'double' ? 'active' : ''}`}
                                    onClick={() => setLayout('double')}
                                    title="Book View (2 Pages Side-by-Side)"
                                >
                                    <BookOpen size={16} />
                                    <span className="btn-text">2-Page</span>
                                </button>
                                <button
                                    className={`pdf-tool-btn ${layout === 'single' ? 'active' : ''}`}
                                    onClick={() => setLayout('single')}
                                    title="Single Page View"
                                >
                                    <FileText size={16} />
                                    <span className="btn-text">1-Page</span>
                                </button>
                                <button
                                    className={`pdf-tool-btn ${layout === 'scroll' ? 'active' : ''}`}
                                    onClick={() => setLayout('scroll')}
                                    title="Continuous Scroll View"
                                >
                                    <ListFilter size={16} />
                                    <span className="btn-text">Scroll</span>
                                </button>
                            </div>

                            {/* Color Theme Selector (Musician Stage Light Modes) */}
                            <div className="pdf-tool-group" title="Reading Theme">
                                <button
                                    className={`pdf-tool-btn ${colorMode === 'default' ? 'active' : ''}`}
                                    onClick={() => setColorMode('default')}
                                    title="Standard White Paper"
                                >
                                    <Sun size={15} />
                                </button>
                                <button
                                    className={`pdf-tool-btn ${colorMode === 'dark' ? 'active' : ''}`}
                                    onClick={() => setColorMode('dark')}
                                    title="Dark / Inverted Mode (Great for dim stages or night)"
                                >
                                    <Moon size={15} />
                                </button>
                                <button
                                    className={`pdf-tool-btn ${colorMode === 'sepia' ? 'active' : ''}`}
                                    onClick={() => setColorMode('sepia')}
                                    title="Warm Sepia Paper"
                                >
                                    <Flame size={15} />
                                </button>
                            </div>

                            {/* Zoom Controls */}
                            <div className="pdf-tool-group zoom-group">
                                <button
                                    className="pdf-tool-btn icon-only"
                                    onClick={handleZoomOut}
                                    disabled={zoom <= 0.5}
                                    title="Zoom Out (-)"
                                >
                                    <ZoomOut size={16} />
                                </button>
                                <button
                                    className="pdf-tool-btn zoom-indicator"
                                    onClick={handleZoomReset}
                                    title="Reset Zoom to 100% (0)"
                                >
                                    {Math.round(zoom * 100)}%
                                </button>
                                <button
                                    className="pdf-tool-btn icon-only"
                                    onClick={handleZoomIn}
                                    disabled={zoom >= 2.5}
                                    title="Zoom In (+)"
                                >
                                    <ZoomIn size={16} />
                                </button>
                            </div>

                            {/* Rotation */}
                            <button
                                className="pdf-tool-btn icon-only single-btn"
                                onClick={handleRotate}
                                title="Rotate Clockwise (R)"
                            >
                                <RotateCw size={16} />
                            </button>

                            {/* Fullscreen */}
                            <button
                                className="pdf-tool-btn icon-only single-btn"
                                onClick={toggleFullscreen}
                                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                            >
                                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                            </button>
                        </>
                    )}

                    {/* Close Button */}
                    <button
                        className="pdf-close-btn"
                        onClick={handleClose}
                        title="Close Viewer (Esc)"
                    >
                        <X size={18} />
                    </button>
                </div>
            </header>

            {/* Main PDF Content Canvas Viewport */}
            <main ref={viewerBodyRef} className={`pdf-viewer-body layout-${layout}`}>
                {/* Floating Quick Navigation Edge Buttons (for 2-page & single-page) */}
                {layout !== 'scroll' && !loading && !error && (
                    <>
                        <button
                            className={`pdf-floating-arrow left ${!canPrev ? 'disabled' : ''}`}
                            onClick={handlePrev}
                            disabled={!canPrev}
                            title="Previous Page (←)"
                            aria-label="Previous Page"
                        >
                            <ChevronLeft size={36} />
                        </button>
                        <button
                            className={`pdf-floating-arrow right ${!canNext ? 'disabled' : ''}`}
                            onClick={handleNext}
                            disabled={!canNext}
                            title="Next Page (→ / Space)"
                            aria-label="Next Page"
                        >
                            <ChevronRight size={36} />
                        </button>
                    </>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="pdf-state-container">
                        <div className="pdf-loading-spinner" />
                        <h3 className="pdf-state-title">Opening PDF Tab</h3>
                        <p className="pdf-state-subtitle">Preparing 2-page sheet music spread...</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="pdf-state-container error">
                        <div className="pdf-error-icon">✕</div>
                        <h3 className="pdf-state-title">Unable to Open PDF</h3>
                        <p className="pdf-state-subtitle">{error}</p>
                        <button className="pdf-btn-primary" onClick={handleClose}>
                            Back to Library
                        </button>
                    </div>
                )}

                {/* Render Pages */}
                {!loading && !error && pdf && (
                    <div className={`pdf-stage ${layout}`}>
                        <div className={`pdf-spread-container layout-${layout}`}>
                            {pagesToRender.map(pageNum => (
                                <PdfPage
                                    key={`${pageNum}-${rotation}-${layout}`}
                                    pdf={pdf}
                                    pageNumber={pageNum}
                                    zoom={zoom}
                                    rotation={rotation}
                                    containerHeight={containerSize.height}
                                    containerWidth={containerSize.width}
                                    layout={layout}
                                    colorMode={colorMode}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* Bottom Quick Bar in Double Mode */}
            {layout === 'double' && !loading && !error && numPages > 0 && (
                <footer className="pdf-viewer-footer">
                    <div className="pdf-footer-hint">
                        <span>Use <strong>← / →</strong> or <strong>Spacebar</strong> to turn pages</span>
                        <span className="dot">•</span>
                        <span>Press <strong>F</strong> for Fullscreen</span>
                        <span className="dot">•</span>
                        <span>Press <strong>Esc</strong> to exit</span>
                    </div>
                </footer>
            )}
        </div>
    );
};
