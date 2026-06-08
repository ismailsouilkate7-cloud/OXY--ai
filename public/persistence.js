// ============================================================
// souilX — Safe Persistence System with Strict Cache Control
// ============================================================

;(function() {
    'use strict';

    // ─── APP VERSION (change this to invalidate all caches) ───
    const APP_VERSION = '1.0.0';

    // ─── WHITELIST: Only these keys are allowed to persist ───
    // Never persist: loading states, API fetch states, ephemeral UI flags
    const ALLOWED_KEYS = [
        'souilx_user_location',
        'souilx_recent_files',
        'souilx_sidebar_closed',
        'souilx_theme'
    ];

    // ─── VERSION TRACKING ───
    const VERSION_KEY = 'souilx_app_version';

    // ─── STORAGE SIZE LIMIT (4.5 MB — conservative for 5 MB quota) ───
    const MAX_STORAGE_BYTES = 4.5 * 1024 * 1024;

    // ─── DEBOUNCE QUEUE ───
    let _writeQueue = {};
    let _writeTimer = null;
    let _readCache = {};

    // ─── Hydration promise (resolved once initial state is loaded) ───
    let _hydrationResolve = null;
    const _hydrationPromise = new Promise((resolve) => {
        _hydrationResolve = resolve;
    });

    // ============================================================
    //  CORE HELPERS
    // ============================================================

    /**
     * Safe JSON parse. Returns defaultVal on failure.
     */
    function _safeParse(raw, defaultVal = null) {
        if (raw === null || raw === undefined) return defaultVal;
        try {
            return JSON.parse(raw);
        } catch {
            return defaultVal;
        }
    }

    /**
     * Get the current storage usage in bytes.
     */
    function _getStorageSize() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const val = localStorage.getItem(key);
            total += (key ? key.length : 0) + (val ? val.length : 0);
        }
        return total;
    }

    /**
     * Estimate the byte size of a value when serialized.
     */
    function _estimateSize(value) {
        try {
            return JSON.stringify(value).length;
        } catch {
            return 0;
        }
    }

    // ============================================================
    //  CACHE VALIDATION
    // ============================================================

    /**
     * Validate cached state on startup.
     * - Checks app version mismatch → resets to defaults
     * - Detects corrupted data → resets to defaults
     * - Detects stale/unrecognized keys → removes them
     *
     * Returns true if cache was valid, false if reset occurred.
     */
    function validateCache() {
        const storedVersion = localStorage.getItem(VERSION_KEY);
        const versionMismatch = (storedVersion !== APP_VERSION);

        let corrupted = false;
        let hadChanges = false;

        if (versionMismatch) {
            console.log('[Persistence] Version changed:',
                storedVersion || '(none)', '→', APP_VERSION);
        }

        // Validate each allowed key's data integrity
        for (const key of ALLOWED_KEYS) {
            const raw = localStorage.getItem(key);
            if (raw === null) continue;

            // Attempt to parse; if it fails, mark as corrupted
            const parsed = _safeParse(raw, Symbol.for('PARSE_FAILED'));
            if (parsed === Symbol.for('PARSE_FAILED')) {
                console.warn('[Persistence] Corrupted data detected for key:', key);
                localStorage.removeItem(key);
                corrupted = true;
                hadChanges = true;
            }
        }

        // Remove any souilX keys that are NOT in the whitelist (stale data)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('souilx_') && !ALLOWED_KEYS.includes(key) && key !== VERSION_KEY) {
                keysToRemove.push(key);
            }
        }
        if (keysToRemove.length > 0) {
            console.log('[Persistence] Removing stale keys:', keysToRemove);
            keysToRemove.forEach(k => localStorage.removeItem(k));
            hadChanges = true;
        }

        // If version mismatch OR any corruption, reset to defaults
        if (versionMismatch || corrupted) {
            console.log('[Persistence] Resetting to defaults (reason:',
                versionMismatch ? 'version mismatch' : 'corrupted data', ')');
            for (const key of ALLOWED_KEYS) {
                localStorage.removeItem(key);
            }
            localStorage.setItem(VERSION_KEY, APP_VERSION);
            // Clear in-memory cache
            _readCache = {};
            window.dispatchEvent(new CustomEvent('oxy:cache-reset', { detail: { reason: versionMismatch ? 'version' : 'corruption' } }));
            return false;
        }

        // Ensure version key exists (first run)
        if (!storedVersion) {
            localStorage.setItem(VERSION_KEY, APP_VERSION);
        }

        return !hadChanges;
    }

    // ============================================================
    //  STORAGE SIZE MONITORING
    // ============================================================

    /**
     * Check if storage is approaching the limit. If so, clean up.
     * Returns true if cleanup was performed.
     */
    function _checkStorageLimit() {
        const usage = _getStorageSize();
        if (usage > MAX_STORAGE_BYTES) {
            console.warn('[Persistence] Storage usage', usage, 'bytes exceeds limit.',
                'Cleaning up less critical data...');

            // Remove least critical items first
            const removalOrder = ['souilx_recent_files', 'souilx_user_location', 'souilx_sidebar_closed'];
            for (const key of removalOrder) {
                const raw = localStorage.getItem(key);
                if (raw) {
                    localStorage.removeItem(key);
                    delete _readCache[key];
                    usage = _getStorageSize();
                    if (usage <= MAX_STORAGE_BYTES * 0.8) break;
                }
            }
            return true;
        }
        return false;
    }

    // ============================================================
    //  HYDRATION (load before render)
    // ============================================================

    /**
     * Hydrate all persisted state into a plain object.
     * Must be called BEFORE the UI renders to avoid flicker.
     * Guarantees no stale data overrides fresh server data.
     */
    function hydrate() {
        const state = {};

        for (const key of ALLOWED_KEYS) {
            const raw = localStorage.getItem(key);
            if (raw === null) {
                state[key] = null;
                continue;
            }

            const parsed = _safeParse(raw, null);
            if (parsed === null) {
                // Raw string value (non-JSON) — used for simple string storage
                state[key] = raw;
            } else {
                state[key] = parsed;
            }

            // Warm the read cache
            _readCache[key] = state[key];
        }

        console.log('[Persistence] Hydrated', Object.keys(state).length, 'state keys');

        // Signal that hydration is complete
        if (_hydrationResolve) {
            _hydrationResolve(state);
            _hydrationResolve = null;
        }

        return state;
    }

    /**
     * Wait for hydration to complete. Returns a promise that resolves
     * with the hydrated state object.
     */
    function onHydrated() {
        return _hydrationPromise;
    }

    // ============================================================
    //  DEBOUNCED / BATCH WRITES
    // ============================================================

    /**
     * Queue a write. Multiple writes to the same key within the
     * debounce window will be coalesced into a single write.
     * Uses requestIdleCallback when available, falls back to rAF.
     */
    function setItem(key, value) {
        if (!ALLOWED_KEYS.includes(key)) {
            console.warn('[Persistence] Key "' + key + '" is not in the whitelist. Ignoring.');
            return;
        }

        // Update in-memory cache immediately
        _readCache[key] = value;
        _writeQueue[key] = value;

        if (_writeTimer !== null) return;

        // Schedule the flush
        const flush = () => {
            _writeTimer = null;
            _flushQueue();
        };

        if (typeof requestIdleCallback === 'function') {
            _writeTimer = requestIdleCallback(flush, { timeout: 500 });
        } else {
            _writeTimer = requestAnimationFrame(flush);
        }
    }

    /**
     * Immediately flush the write queue to localStorage.
     */
    function _flushQueue() {
        const keys = Object.keys(_writeQueue);
        if (keys.length === 0) return;

        const batch = { ..._writeQueue };
        _writeQueue = {};

        // Estimate total size before writing
        let totalEstimate = _getStorageSize();
        for (const [key, value] of Object.entries(batch)) {
            totalEstimate += _estimateSize(value);
        }

        // Check if we'd exceed the limit
        if (totalEstimate > MAX_STORAGE_BYTES) {
            console.warn('[Persistence] Write batch would exceed storage limit.',
                'Attempting cleanup...');
            _checkStorageLimit();
        }

        // Write all batched keys
        for (const [key, value] of Object.entries(batch)) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (err) {
                // Storage full or quota exceeded
                console.error('[Persistence] Failed to write key:', key, err);
                _checkStorageLimit();
                // Retry once after cleanup
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                } catch (retryErr) {
                    console.error('[Persistence] Retry failed for key:', key, retryErr);
                    window.dispatchEvent(new CustomEvent('oxy:storage-full', { detail: { key } }));
                }
            }
        }

        window.dispatchEvent(new CustomEvent('oxy:persist-flush', { detail: { keys } }));
    }

    /**
     * Synchronously read from cache (or localStorage if not cached).
     * Use this for non-critical reads. For critical reads during init,
     * use the hydrated state object from hydrate().
     */
    function getItem(key, defaultVal = null) {
        // Check in-memory cache first
        if (key in _readCache) {
            return _readCache[key] !== undefined ? _readCache[key] : defaultVal;
        }

        // Fall back to localStorage
        const raw = localStorage.getItem(key);
        if (raw === null) return defaultVal;

        const parsed = _safeParse(raw, raw);
        _readCache[key] = parsed;
        return parsed;
    }

    /**
     * Remove a key from storage and cache.
     */
    function removeItem(key) {
        if (!ALLOWED_KEYS.includes(key)) {
            console.warn('[Persistence] Key "' + key + '" is not in the whitelist. Ignoring remove.');
            return;
        }
        delete _readCache[key];
        delete _writeQueue[key];
        localStorage.removeItem(key);
    }

    // ============================================================
    //  SAFE CLEAR
    // ============================================================

    /**
     * Safe clear: remove only souilX-managed keys, keeping everything else.
     * Call this for "Clear Cache" / "Reset Settings" actions.
     */
    function safeClear() {
        console.log('[Persistence] Performing safe clear...');
        for (const key of ALLOWED_KEYS) {
            localStorage.removeItem(key);
            delete _readCache[key];
            delete _writeQueue[key];
        }
        localStorage.setItem(VERSION_KEY, APP_VERSION);
        window.dispatchEvent(new CustomEvent('oxy:cache-cleared'));
    }

    /**
     * Force full clear — removes all souilx_ keys including version.
     * Use only as a last resort or explicit user request.
     */
    function fullClear() {
        console.log('[Persistence] Performing full clear...');
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('souilx_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        _readCache = {};
        _writeQueue = {};
        window.dispatchEvent(new CustomEvent('oxy:cache-cleared'));
    }

    /**
     * Get current storage stats.
     */
    function getStats() {
        return {
            version: localStorage.getItem(VERSION_KEY) || '(none)',
            appVersion: APP_VERSION,
            usageBytes: _getStorageSize(),
            limitBytes: MAX_STORAGE_BYTES,
            usagePercent: ((_getStorageSize() / MAX_STORAGE_BYTES) * 100).toFixed(1) + '%',
            queuedWrites: Object.keys(_writeQueue).length,
            cachedKeys: Object.keys(_readCache).length
        };
    }

    // ============================================================
    //  LEGACY BRIDGE (for backward compatibility with raw calls)
    // ============================================================

    /**
     * Direct setter that bypasses debouncing. Use for critical
     * one-off writes that need to be instantly durable (e.g., before
     * page unload). Prefer setItem() for normal use.
     */
    function setItemSync(key, value) {
        if (!ALLOWED_KEYS.includes(key)) {
            console.warn('[Persistence] Key "' + key + '" is not in the whitelist. Ignoring.');
            return;
        }
        _readCache[key] = value;
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (err) {
            console.error('[Persistence] Sync write failed for key:', key, err);
            _checkStorageLimit();
        }
    }

    // ============================================================
    //  PAGE UNLOAD — flush pending writes
    // ============================================================

    window.addEventListener('beforeunload', function _flushOnUnload() {
        if (Object.keys(_writeQueue).length > 0) {
            _flushQueue();
        }
    });

    // Also flush on visibility change (tab hidden)
    document.addEventListener('visibilitychange', function _flushOnHidden() {
        if (document.hidden && Object.keys(_writeQueue).length > 0) {
            _flushQueue();
        }
    });

    // ============================================================
    //  EXPORT PUBLIC API
    // ============================================================

    window.souilXPersistence = {
        // Core
        validateCache,
        hydrate,
        onHydrated,
        setItem,
        getItem,
        removeItem,

        // Sync write (bypasses debounce)
        setItemSync,

        // Clear
        safeClear,
        fullClear,

        // Monitoring
        getStats,

        // Constants (useful for checking)
        APP_VERSION,
        ALLOWED_KEYS,
        VERSION_KEY,

        // Access to the hydration promise for advanced use
        _hydrationPromise
    };

    // ─── Run cache validation immediately ───
    validateCache();

    console.log('[Persistence] Module loaded. Version:', APP_VERSION);
})();