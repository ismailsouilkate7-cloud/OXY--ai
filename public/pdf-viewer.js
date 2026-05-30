// ============================================================
// OXY AI — Client-side PDF Viewer (browser-only)
// ============================================================
// Loads pdf.js dynamically from CDN to avoid Vercel/Node.js crashes.
// Contains "typeof window === 'undefined'" guard for SSR safety.
// ============================================================

// Safety guard — this file only runs in browser
if (typeof window !== 'undefined') {
    // ============================================================
    // PDFViewer — Singleton object
    // ============================================================
    const PDFViewer = (() => {
        'use strict';

        let pdfjsLib = null;
        let isLoaded = false;
        let loadPromise = null;
        let currentPdf = null;
        let currentPage = 1;
        let totalPages = 0;
        let scale = 1.5;
        let fileName = '';

        // DOM elements (created dynamically)
        let viewerEl = null;
        let overlayEl = null;
        let containerEl = null;
        let canvasEl = null;
        let toolbarEl = null;

        // ============================================================
        // Load pdf.js dynamically from CDN
        // ============================================================
        function loadPdfJs() {
            if (pdfjsLib) return Promise.resolve(pdfjsLib);
            if (loadPromise) return loadPromise;

            loadPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                script.integrity = 'sha512-TXTS1SCE4U6vTYBxkBRthrJ+1iV+O3ODGKE9f0l7RgAKK+2xMvIXEFP/qVKRgWqvbPy33vDqW5NjB3lgBKEv2Q==';
                script.crossOrigin = 'anonymous';
                script.onload = () => {
                    // Set worker source
                    pdfjsLib = window.pdfjsLib;
                    if (pdfjsLib) {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                        isLoaded = true;
                        console.log('[PDF Viewer] pdf.js loaded from CDN');
                        resolve(pdfjsLib);
                    } else {
                        reject(new Error('pdf.js failed to initialize'));
                    }
                };
                script.onerror = () => {
                    loadPromise = null;
                    reject(new Error('Failed to load pdf.js from CDN'));
                };
                document.head.appendChild(script);
            });

            return loadPromise;
        }

        // ============================================================
        // Create viewer DOM
        // ============================================================
        function createViewer() {
            if (viewerEl) return;

            // Overlay
            overlayEl = document.createElement('div');
            overlayEl.className = 'pdf-overlay';
            overlayEl.addEventListener('click', (e) => {
                if (e.target === overlayEl) closeViewer();
            });

            // Viewer container
            viewerEl = document.createElement('div');
            viewerEl.className = 'pdf-viewer';

            // Toolbar
            toolbarEl = document.createElement('div');
            toolbarEl.className = 'pdf-toolbar';
            toolbarEl.innerHTML = [
                '<div class="pdf-toolbar-left">',
                '    <span class="pdf-toolbar-title" id="pdf-toolbar-title">PDF Viewer</span>',
                '</div>',
                '<div class="pdf-toolbar-center">',
                '    <button class="pdf-tb-btn" id="pdf-prev-btn" title="Previous Page">',
                '        <i class="fa-solid fa-chevron-left"></i>',
                '    </button>',
                '    <span class="pdf-page-info" id="pdf-page-info">- / -</span>',
                '    <button class="pdf-tb-btn" id="pdf-next-btn" title="Next Page">',
                '        <i class="fa-solid fa-chevron-right"></i>',
                '    </button>',
                '    <span class="pdf-zoom-info" id="pdf-zoom-info">100%</span>',
                '</div>',
                '<div class="pdf-toolbar-right">',
                '    <button class="pdf-tb-btn" id="pdf-zoom-in-btn" title="Zoom In">',
                '        <i class="fa-solid fa-magnifying-glass-plus"></i>',
                '    </button>',
                '    <button class="pdf-tb-btn" id="pdf-zoom-out-btn" title="Zoom Out">',
                '        <i class="fa-solid fa-magnifying-glass-minus"></i>',
                '    </button>',
                '    <button class="pdf-tb-btn" id="pdf-download-btn" title="Download">',
                '        <i class="fa-solid fa-download"></i>',
                '    </button>',
                '    <button class="pdf-tb-btn pdf-tb-close" id="pdf-close-btn" title="Close">',
                '        <i class="fa-solid fa-xmark"></i>',
                '    </button>',
                '</div>'
            ].join('');

            // Container for canvas
            containerEl = document.createElement('div');
            containerEl.className = 'pdf-container';

            // Canvas
            canvasEl = document.createElement('canvas');
            canvasEl.className = 'pdf-canvas';
            containerEl.appendChild(canvasEl);

            // Loading indicator
            const loadingEl = document.createElement('div');
            loadingEl.className = 'pdf-loading';
            loadingEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Loading PDF\u2026</span>';
            loadingEl.id = 'pdf-loading';
            containerEl.appendChild(loadingEl);

            viewerEl.appendChild(toolbarEl);
            viewerEl.appendChild(containerEl);
            overlayEl.appendChild(viewerEl);
            document.body.appendChild(overlayEl);

            // Bind toolbar events
            document.getElementById('pdf-close-btn').addEventListener('click', closeViewer);
            document.getElementById('pdf-prev-btn').addEventListener('click', prevPage);
            document.getElementById('pdf-next-btn').addEventListener('click', nextPage);
            document.getElementById('pdf-zoom-in-btn').addEventListener('click', zoomIn);
            document.getElementById('pdf-zoom-out-btn').addEventListener('click', zoomOut);
            document.getElementById('pdf-download-btn').addEventListener('click', downloadPdf);

            // Keyboard navigation
            document.addEventListener('keydown', handleKeydown);
        }

        // ============================================================
        // Keyboard handler
        // ============================================================
        function handleKeydown(e) {
            if (!overlayEl || overlayEl.style.display !== 'flex') return;

            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    closeViewer();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    prevPage();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    nextPage();
                    break;
            }
        }

        // ============================================================
        // Open PDF from URL
        // ============================================================
        async function openPdf(url, name) {
            try {
                fileName = name || url.split('/').pop() || 'document.pdf';

                // Create viewer if not exists
                createViewer();

                // Show overlay and loading
                overlayEl.style.display = 'flex';
                document.getElementById('pdf-loading').style.display = 'flex';
                canvasEl.style.display = 'none';
                document.getElementById('pdf-toolbar-title').textContent = fileName;

                // Load pdf.js if needed
                await loadPdfJs();

                // Load the PDF document
                const loadingTask = pdfjsLib.getDocument(url);
                currentPdf = await loadingTask.promise;
                totalPages = currentPdf.numPages;
                currentPage = 1;
                scale = 1.5;

                // Render first page
                await renderPage(currentPage);

                // Update toolbar
                updateToolbar();

                // Hide loading
                document.getElementById('pdf-loading').style.display = 'none';
                canvasEl.style.display = 'block';

                // Prevent body scroll
                document.body.style.overflow = 'hidden';

            } catch (err) {
                console.error('[PDF Viewer] Error opening PDF:', err);
                document.getElementById('pdf-loading').innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444"></i><span style="color:#ef4444">Failed to load PDF</span>';
                if (typeof showToast === 'function') {
                    showToast('Failed to load PDF. The file may be corrupted or unreachable.', 'error');
                }
            }
        }

        // ============================================================
        // Render a specific page
        // ============================================================
        async function renderPage(pageNum) {
            if (!currentPdf) return;

            try {
                const page = await currentPdf.getPage(pageNum);
                const viewport = page.getViewport({ scale });

                // Set canvas dimensions
                canvasEl.width = viewport.width;
                canvasEl.height = viewport.height;

                // Render the page
                const ctx = canvasEl.getContext('2d');
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };

                await page.render(renderContext).promise;
                currentPage = pageNum;
                updateToolbar();

            } catch (err) {
                console.error('[PDF Viewer] Error rendering page:', err);
            }
        }

        // ============================================================
        // Toolbar helpers
        // ============================================================
        function updateToolbar() {
            document.getElementById('pdf-page-info').textContent = currentPage + ' / ' + totalPages;
            var zoomPct = Math.round(scale * 100 / 1.5);
            document.getElementById('pdf-zoom-info').textContent = zoomPct + '%';
        }

        function prevPage() {
            if (currentPdf && currentPage > 1) {
                renderPage(currentPage - 1);
            }
        }

        function nextPage() {
            if (currentPdf && currentPage < totalPages) {
                renderPage(currentPage + 1);
            }
        }

        function zoomIn() {
            if (currentPdf) {
                scale = Math.min(scale + 0.25, 4.0);
                renderPage(currentPage);
            }
        }

        function zoomOut() {
            if (currentPdf) {
                scale = Math.max(scale - 0.25, 0.5);
                renderPage(currentPage);
            }
        }

        function downloadPdf() {
            if (!fileName) return;
            var titleEl = document.getElementById('pdf-toolbar-title');
            if (titleEl) {
                var anchor = document.createElement('a');
                anchor.download = fileName;
                anchor.target = '_blank';
                anchor.href = window.location.href;
                anchor.click();
            }
        }

        // ============================================================
        // Close viewer
        // ============================================================
        function closeViewer() {
            if (overlayEl) {
                overlayEl.style.display = 'none';
            }
            if (currentPdf) {
                try { currentPdf.destroy(); } catch(e) { /* ignore */ }
                currentPdf = null;
            }
            currentPage = 1;
            totalPages = 0;
            document.body.style.overflow = '';
        }

        // ============================================================
        // Public API
        // ============================================================
        function init() {
            createViewer();
        }

        return {
            init: init,
            openPdf: openPdf,
            closeViewer: closeViewer,
            prevPage: prevPage,
            nextPage: nextPage,
            zoomIn: zoomIn,
            zoomOut: zoomOut,
            downloadPdf: downloadPdf,
            get isLoaded() { return isLoaded; }
        };
    })();

    // Export to window
    window.OXYPDFViewer = PDFViewer;

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { PDFViewer.init(); });
    } else {
        PDFViewer.init();
    }
}