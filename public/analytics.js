// ============================================================
// Vercel Web Analytics — using @vercel/analytics package
// ============================================================

// Import inject function from CDN (ESM module)
import { inject } from 'https://cdn.jsdelivr.net/npm/@vercel/analytics@2.0.1/dist/index.js';

// Initialize Vercel Analytics with configuration
inject({
    mode: 'auto', // Auto-detect production/development
    debug: false, // Set to true to see console logs in development
    beforeSend: (event) => {
        // Optional: Filter or modify events before sending
        // Return null to prevent sending, or return modified event
        return event;
    }
});

console.log('[Vercel Analytics] Initialized successfully');