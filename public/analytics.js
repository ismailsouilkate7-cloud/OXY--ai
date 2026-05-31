// ============================================================
// Vercel Web Analytics — initialized once, runs silently
// ============================================================
(function() {
    // Prevent duplicate initialization
    if (window.__vercelAnalyticsInjected) return;
    window.__vercelAnalyticsInjected = true;

    // Initialize the analytics event queue
    if (typeof window.va === 'undefined') {
        window.va = function() {
            if (!window.vaq) window.vaq = [];
            window.vaq.push(arguments);
        };
    }

    // Load the Vercel Analytics script
    var script = document.createElement('script');
    script.src = '/_vercel/insights/script.js';
    script.defer = true;
    script.dataset.sdkn = '@vercel/analytics';
    script.dataset.sdkv = '2.0.1';
    script.onerror = function() {
        console.log('[Vercel Analytics] Script failed to load. Ensure Web Analytics is enabled in your Vercel project dashboard.');
    };
    document.head.appendChild(script);
})();