// ============================================================
// OXY AI — Widget Renderer for Structured JSON Responses
// ============================================================
// Detects JSON in AI responses and renders visual widgets/cards
// instead of showing raw JSON text.

const OXYWidgetRenderer = (() => {
    'use strict';

    // Cached user location (set by app.js on init)
    let cachedUserLocation = null;

    // Set user location (called from app.js)
    function setUserLocation(location) {
        cachedUserLocation = location;
    }

    // Get user location (used for default location in widgets)
    function getUserLocation() {
        return cachedUserLocation;
    }

    // === Detect and parse JSON from text ===
    function tryParseJSON(text) {
        if (!text || typeof text !== 'string') return null;

        let jsonStr = text.trim();

        // Extract from markdown code blocks if present (```json ... ``` or ``` ... ```)
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        // Try direct parse first (most common case — AI returns pure JSON)
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.type) {
                return parsed;
            }
        } catch (e) {
            // Not direct JSON, try to find JSON embedded in text
        }

        // Try to extract the largest JSON object that contains a "type" field
        // Use a greedy approach: find the outermost { ... } that parses
        const firstBrace = jsonStr.indexOf('{');
        if (firstBrace !== -1) {
            // Try from the first brace to the end, shrinking from the right
            let depth = 0;
            let inString = false;
            let escape = false;
            for (let i = firstBrace; i < jsonStr.length; i++) {
                const ch = jsonStr[i];
                if (escape) { escape = false; continue; }
                if (ch === '\\' && inString) { escape = true; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (inString) continue;
                if (ch === '{') depth++;
                if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        const candidate = jsonStr.substring(firstBrace, i + 1);
                        try {
                            const parsed = JSON.parse(candidate);
                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.type) {
                                return parsed;
                            }
                        } catch (e) {
                            // Not valid JSON
                        }
                        break;
                    }
                }
            }
        }

        return null;
    }

    // === Check if text looks like it might be JSON (for streaming suppression) ===
    function looksLikeJSON(text) {
        if (!text) return false;
        const trimmed = text.trim();
        // Starts with { or with a code block containing {
        return trimmed.startsWith('{') || /^```(?:json)?\s*\{/.test(trimmed);
    }

    // === Widget Renderers ===

    function renderWeatherForecast(data) {
        const location = data.location || data.city || cachedUserLocation || 'Unknown Location';
        const current = data.current || {};
        const forecast = data.forecast || data.days || [];
        const unit = data.unit || '°C';

        const currentTemp = current.temp ?? current.temperature ?? '--';
        const currentCondition = current.condition || current.description || '';
        const currentIcon = current.icon || getWeatherIcon(currentCondition);
        const currentHumidity = current.humidity ?? '--';
        const currentWind = current.wind ?? current.windSpeed ?? '--';
        const high = current.high ?? current.maxTemp ?? '--';
        const low = current.low ?? current.minTemp ?? '--';
        const feelsLike = current.feelsLike ?? current.feels_like ?? null;
        const uvIndex = current.uvIndex ?? current.uv ?? null;
        const visibility = current.visibility ?? null;
        const pressure = current.pressure ?? null;

        let forecastHtml = '';
        if (forecast.length > 0) {
            forecastHtml = forecast.slice(0, 7).map(day => {
                const dayName = day.day || day.date || '--';
                const dayIcon = day.icon || getWeatherIcon(day.condition || '');
                const dayHigh = day.high ?? day.maxTemp ?? '--';
                const dayLow = day.low ?? day.minTemp ?? '--';
                const dayCondition = day.condition || '';
                return `
                    <div class="wx-forecast-day">
                        <span class="wx-day-name">${formatDayName(dayName)}</span>
                        <span class="wx-day-icon">${dayIcon}</span>
                        <span class="wx-day-condition">${escapeHtml(dayCondition)}</span>
                        <span class="wx-day-temps">
                            <span class="wx-high">${dayHigh}${unit}</span>
                            <span class="wx-low">${dayLow}${unit}</span>
                        </span>
                    </div>
                `;
            }).join('');
        }

        // Build extra details row items
        const extraDetails = [];
        if (feelsLike !== null) extraDetails.push({ icon: 'fa-solid fa-temperature-half', value: `${feelsLike}${unit}`, label: 'Feels Like' });
        if (uvIndex !== null) extraDetails.push({ icon: 'fa-solid fa-sun', value: uvIndex, label: 'UV Index' });
        if (visibility !== null) extraDetails.push({ icon: 'fa-solid fa-eye', value: visibility, label: 'Visibility' });
        if (pressure !== null) extraDetails.push({ icon: 'fa-solid fa-gauge', value: pressure, label: 'Pressure' });

        const extraDetailsHtml = extraDetails.length > 0 ? `
            <div class="wx-details-row wx-extra-details">
                ${extraDetails.map(d => `
                    <div class="wx-detail">
                        <i class="${d.icon}"></i>
                        <span>${escapeHtml(String(d.value))}</span>
                        <span class="wx-detail-label">${d.label}</span>
                    </div>
                `).join('')}
            </div>
        ` : '';

        const summary = data.summary || data.description || '';

        return `
            <div class="oxy-widget wx-forecast-widget">
                <div class="wx-current-main">
                    <div class="wx-location">
                        <i class="fa-solid fa-location-dot"></i>
                        <span>${escapeHtml(location)}</span>
                    </div>
                    <div class="wx-temp-row">
                        <div class="wx-temp-main">
                            <span class="wx-temp-value">${escapeHtml(String(currentTemp))}</span>
                            <span class="wx-temp-unit">${escapeHtml(unit)}</span>
                        </div>
                        <div class="wx-condition-icon">${currentIcon}</div>
                    </div>
                    <div class="wx-condition-text">${escapeHtml(currentCondition)}</div>
                    <div class="wx-details-row">
                        <div class="wx-detail">
                            <i class="fa-solid fa-droplet"></i>
                            <span>${escapeHtml(String(currentHumidity))}%</span>
                            <span class="wx-detail-label">Humidity</span>
                        </div>
                        <div class="wx-detail">
                            <i class="fa-solid fa-wind"></i>
                            <span>${escapeHtml(String(currentWind))}</span>
                            <span class="wx-detail-label">Wind</span>
                        </div>
                        <div class="wx-detail">
                            <i class="fa-solid fa-arrow-up"></i>
                            <span>${escapeHtml(String(high))}${escapeHtml(unit)}</span>
                            <span class="wx-detail-label">High</span>
                        </div>
                        <div class="wx-detail">
                            <i class="fa-solid fa-arrow-down"></i>
                            <span>${escapeHtml(String(low))}${escapeHtml(unit)}</span>
                            <span class="wx-detail-label">Low</span>
                        </div>
                    </div>
                    ${extraDetailsHtml}
                </div>
                ${forecastHtml ? `
                <div class="wx-forecast-section">
                    <div class="wx-section-title">
                        <i class="fa-solid fa-calendar-days"></i>
                        Forecast
                    </div>
                    <div class="wx-forecast-days">
                        ${forecastHtml}
                    </div>
                </div>
                ` : ''}
                ${summary ? `<div class="wx-summary">${escapeHtml(summary)}</div>` : ''}
                <div class="wx-footer">
                    <i class="fa-regular fa-clock"></i>
                    <span>Weather data · OXY AI</span>
                </div>
            </div>
        `;
    }

    function renderWeatherAnalysis(data) {
        const location = data.location || data.city || cachedUserLocation || 'Weather Analysis';
        const summary = data.summary || data.analysis || data.description || '';
        const alerts = data.alerts || [];
        const recommendations = data.recommendations || data.tips || [];
        const details = data.details || {};

        const alertsHtml = alerts.length > 0 ? `
            <div class="wx-alerts-section">
                <div class="wx-section-title"><i class="fa-solid fa-triangle-exclamation"></i> Alerts</div>
                ${alerts.map(a => `
                    <div class="wx-alert-item ${(a.severity || '').toLowerCase() === 'high' ? 'wx-alert-high' : 'wx-alert-info'}">
                        <span class="wx-alert-title">${escapeHtml(a.title || a.message || String(a))}</span>
                        ${a.description ? `<span class="wx-alert-desc">${escapeHtml(a.description)}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : '';

        const recsHtml = recommendations.length > 0 ? `
            <div class="wx-recs-section">
                <div class="wx-section-title"><i class="fa-solid fa-lightbulb"></i> Recommendations</div>
                <ul class="wx-recs-list">
                    ${recommendations.map(r => `
                        <li>${escapeHtml(typeof r === 'string' ? r : (r.text || r.message || String(r)))}</li>
                    `).join('')}
                </ul>
            </div>
        ` : '';

        const detailsHtml = Object.keys(details).length > 0 ? `
            <div class="wx-details-grid">
                ${Object.entries(details).map(([key, value]) => `
                    <div class="wx-detail-item">
                        <span class="wx-detail-key">${escapeHtml(formatKey(key))}</span>
                        <span class="wx-detail-val">${escapeHtml(String(value))}</span>
                    </div>
                `).join('')}
            </div>
        ` : '';

        return `
            <div class="oxy-widget wx-analysis-widget">
                <div class="wx-analysis-header">
                    <i class="fa-solid fa-cloud-sun"></i>
                    <span>${escapeHtml(location)}</span>
                </div>
                ${summary ? `<div class="wx-analysis-text">${escapeHtml(summary)}</div>` : ''}
                ${detailsHtml}
                ${alertsHtml}
                ${recsHtml}
                <div class="wx-footer">
                    <i class="fa-regular fa-clock"></i>
                    <span>Weather analysis · OXY AI</span>
                </div>
            </div>
        `;
    }

    function renderAnalysisCard(data) {
        const title = data.title || 'Analysis';
        const icon = data.icon || 'fa-solid fa-chart-simple';
        const value = data.value || data.mainValue || '';
        const subtitle = data.subtitle || '';
        const items = data.items || data.metrics || data.data || [];
        const color = data.color || data.accentColor || '#6366f1';
        const trend = data.trend || null;

        const trendHtml = trend ? `
            <span class="ac-trend ${trend.direction === 'up' ? 'ac-trend-up' : trend.direction === 'down' ? 'ac-trend-down' : 'ac-trend-neutral'}">
                <i class="fa-solid fa-arrow-${trend.direction === 'up' ? 'up' : trend.direction === 'down' ? 'down' : 'right'}"></i>
                ${escapeHtml(String(trend.value || ''))}
            </span>
        ` : '';

        const itemsHtml = items.length > 0 ? `
            <div class="ac-items">
                ${items.map(item => {
                    const label = item.label || item.name || '';
                    const val = item.value !== undefined ? item.value : (item.count !== undefined ? item.count : '');
                    const pct = item.percentage !== undefined ? item.percentage : (item.pct !== undefined ? item.pct : null);
                    const barColor = item.color || color;
                    return `
                        <div class="ac-item">
                            <div class="ac-item-header">
                                <span class="ac-item-label">${escapeHtml(String(label))}</span>
                                <span class="ac-item-value">${escapeHtml(String(val))}</span>
                            </div>
                            ${pct !== null ? `
                            <div class="ac-bar-track">
                                <div class="ac-bar-fill" style="width: ${Math.min(100, Math.max(0, Number(pct)))}%; background: ${barColor};"></div>
                            </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        ` : '';

        return `
            <div class="oxy-widget ac-widget" style="--accent: ${color};">
                <div class="ac-header">
                    <div class="ac-title-row">
                        <i class="${icon}" style="color: ${color};"></i>
                        <span class="ac-title">${escapeHtml(title)}</span>
                    </div>
                    ${trendHtml}
                </div>
                ${value ? `<div class="ac-value">${escapeHtml(String(value))}</div>` : ''}
                ${subtitle ? `<div class="ac-subtitle">${escapeHtml(subtitle)}</div>` : ''}
                ${itemsHtml}
                <div class="wx-footer">
                    <i class="fa-regular fa-clock"></i>
                    <span>Analysis report · OXY AI</span>
                </div>
            </div>
        `;
    }

    function renderInfoCard(data) {
        const title = data.title || 'Information';
        const icon = data.icon || 'fa-solid fa-circle-info';
        const description = data.description || data.text || data.content || '';
        const items = data.items || data.bullets || data.points || [];
        const color = data.color || data.accentColor || '#3b82f6';
        const timestamp = data.timestamp || data.date || null;
        const badge = data.badge || data.tag || null;

        const itemsHtml = items.length > 0 ? `
            <div class="ic-items">
                ${items.map(item => {
                    if (typeof item === 'string') {
                        return `<div class="ic-item"><i class="fa-solid fa-circle-check" style="color: ${color};"></i><span>${escapeHtml(item)}</span></div>`;
                    }
                    const itemLabel = item.label || item.title || '';
                    const itemDesc = item.description || item.text || item.value || '';
                    const itemIcon = item.icon || 'fa-solid fa-circle-check';
                    return `
                        <div class="ic-item">
                            <i class="${itemIcon}" style="color: ${item.color || color};"></i>
                            <div class="ic-item-text">
                                ${itemLabel ? `<span class="ic-item-label">${escapeHtml(itemLabel)}</span>` : ''}
                                ${itemDesc ? `<span class="ic-item-desc">${escapeHtml(String(itemDesc))}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : '';

        return `
            <div class="oxy-widget ic-widget" style="--accent: ${color};">
                <div class="ic-header">
                    <div class="ic-icon-wrap" style="background: ${color}18; color: ${color};">
                        <i class="${icon}"></i>
                    </div>
                    <div class="ic-header-text">
                        <span class="ic-title">${escapeHtml(title)}</span>
                        ${timestamp ? `<span class="ic-timestamp">${escapeHtml(timestamp)}</span>` : ''}
                    </div>
                    ${badge ? `<span class="ic-badge" style="background: ${color}20; color: ${color};">${escapeHtml(badge)}</span>` : ''}
                </div>
                ${description ? `<div class="ic-description">${escapeHtml(description)}</div>` : ''}
                ${itemsHtml}
                <div class="wx-footer">
                    <i class="fa-regular fa-circle-check"></i>
                    <span>Information card · OXY AI</span>
                </div>
            </div>
        `;
    }

    function renderChartData(data) {
        const title = data.title || 'Chart';
        // For chart_data type, chartType is a separate field; for other types, use the type itself
        const chartType = data.chartType || data.chart_type || 'bar';
        const labels = data.labels || data.categories || [];
        const datasets = data.datasets || data.values || data.data || [];
        const color = data.color || data.accentColor || '#6366f1';
        const colors = data.colors || null;

        let chartHtml = '';

        if (chartType === 'bar' || chartType === 'horizontal' || chartType === 'column') {
            const vals = datasets.map(d => {
                if (typeof d === 'number') return d;
                if (d && d.value !== undefined) return Number(d.value);
                return 0;
            });
            const maxVal = Math.max(...vals, 1);

            chartHtml = `
                <div class="cd-chart cd-bar-chart ${chartType === 'horizontal' ? 'cd-horizontal' : ''}">
                    ${labels.map((label, i) => {
                        const val = vals[i] !== undefined ? vals[i] : 0;
                        const pct = (val / maxVal) * 100;
                        const barColor = colors ? (colors[i] || color) : color;
                        return `
                            <div class="cd-bar-row">
                                <span class="cd-bar-label">${escapeHtml(String(label))}</span>
                                <div class="cd-bar-track">
                                    <div class="cd-bar-fill" style="width: ${pct.toFixed(1)}%; background: ${barColor};"></div>
                                </div>
                                <span class="cd-bar-value">${val}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else if (chartType === 'pie' || chartType === 'donut') {
            const vals = datasets.map(d => typeof d === 'number' ? d : (d && d.value !== undefined ? Number(d.value) : 0));
            const total = vals.reduce((sum, v) => sum + v, 0);

            const slices = labels.map((label, i) => {
                const val = vals[i] !== undefined ? vals[i] : 0;
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                const sliceColor = colors ? (colors[i] || getChartColor(i)) : getChartColor(i);
                return { label, value: val, pct, color: sliceColor };
            });

            // Build conic gradient for pie
            let cumulative = 0;
            const conicParts = slices.map(s => {
                const start = cumulative;
                cumulative += s.pct;
                return `${s.color} ${start}% ${cumulative}%`;
            });

            const segments = slices.map(s => `
                <div class="cd-legend-item">
                    <span class="cd-legend-dot" style="background: ${s.color};"></span>
                    <span class="cd-legend-label">${escapeHtml(String(s.label))}</span>
                    <span class="cd-legend-value">${s.value} (${s.pct}%)</span>
                </div>
            `).join('');

            const isDonut = chartType === 'donut';
            chartHtml = `
                <div class="cd-chart cd-pie-chart">
                    <div class="cd-pie-visual">
                        <div class="cd-pie-svg" style="background: conic-gradient(${conicParts.join(', ')}); border-radius: 50%; width: 120px; height: 120px; ${isDonut ? 'mask: radial-gradient(circle at center, transparent 35%, black 36%); -webkit-mask: radial-gradient(circle at center, transparent 35%, black 36%);' : ''}"></div>
                        ${isDonut ? `<span class="cd-pie-total">${total}</span>` : ''}
                    </div>
                    <div class="cd-legend">${segments}</div>
                </div>
            `;
        } else if (chartType === 'line') {
            // Simple line chart as a sparkline using CSS
            const vals = datasets.map(d => typeof d === 'number' ? d : (d && d.value !== undefined ? Number(d.value) : 0));
            const maxVal = Math.max(...vals, 1);
            const minVal = Math.min(...vals, 0);
            const range = maxVal - minVal || 1;

            const points = vals.map((v, i) => {
                const x = labels.length > 1 ? (i / (labels.length - 1)) * 100 : 50;
                const y = 100 - ((v - minVal) / range) * 80 - 10;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');

            chartHtml = `
                <div class="cd-chart cd-line-chart">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="cd-line-svg">
                        <defs>
                            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
                                <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                            </linearGradient>
                        </defs>
                        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
                    </svg>
                    <div class="cd-line-labels">
                        ${labels.map((l, i) => `<span>${escapeHtml(String(l))}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        const summary = data.summary || data.insight || '';

        return `
            <div class="oxy-widget cd-widget" style="--accent: ${color};">
                <div class="cd-header">
                    <i class="fa-solid fa-chart-${chartType === 'pie' || chartType === 'donut' ? 'pie' : chartType === 'line' ? 'line' : 'bar'}" style="color: ${color};"></i>
                    <span class="cd-title">${escapeHtml(title)}</span>
                </div>
                ${chartHtml}
                ${summary ? `<div class="cd-summary">${escapeHtml(summary)}</div>` : ''}
                <div class="wx-footer">
                    <i class="fa-regular fa-chart-bar"></i>
                    <span>Data visualization · OXY AI</span>
                </div>
            </div>
        `;
    }

    // === Helpers ===

    function getWeatherIcon(condition) {
        if (!condition) return '🌤️';
        const c = condition.toLowerCase();
        if (c.includes('thunder') || c.includes('storm') || c.includes('lightning')) return '⛈️';
        if (c.includes('snow') || c.includes('blizzard') || c.includes('sleet') || c.includes('ice')) return '❄️';
        if (c.includes('fog') || c.includes('mist') || c.includes('haze') || c.includes('smoke')) return '🌫️';
        if (c.includes('rain') || c.includes('drizzle') || c.includes('shower') || c.includes('precip')) return '🌧️';
        if (c.includes('partly') || (c.includes('cloud') && c.includes('sun'))) return '⛅';
        if (c.includes('overcast') || (c.includes('cloud') && !c.includes('sun'))) return '☁️';
        if (c.includes('wind') || c.includes('breez') || c.includes('gust')) return '💨';
        if (c.includes('night') || c.includes('moon') || c.includes('clear') && c.includes('night')) return '🌙';
        if (c.includes('sun') || c.includes('clear') || c.includes('fair') || c.includes('bright')) return '☀️';
        if (c.includes('cloud')) return '☁️';
        return '🌤️';
    }

    function formatDayName(day) {
        if (!day) return '--';
        const trimmed = String(day).trim();
        // If it's a date string like "2024-01-15", try to parse it
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
            try {
                const d = new Date(trimmed);
                return d.toLocaleDateString('en-US', { weekday: 'short' });
            } catch (e) {}
        }
        // If it's already a short name (Mon, Tue, etc.)
        if (trimmed.length <= 3) return trimmed;
        return trimmed.substring(0, 3);
    }

    function formatKey(key) {
        return String(key)
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^./, s => s.toUpperCase())
            .trim();
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function getChartColor(index) {
        const palette = [
            '#6366f1', '#a855f7', '#3b82f6', '#10b981',
            '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
            '#f97316', '#8b5cf6'
        ];
        return palette[index % palette.length];
    }

    // === Main Render Function ===
    function render(data) {
        if (!data || !data.type) return null;

        switch (data.type) {
            // Weather variants
            case 'weather':
            case 'weather_card':
            case 'weather_forecast':
                return renderWeatherForecast(data);

            // Weather analysis variants
            case 'weather_analysis':
                return renderWeatherAnalysis(data);

            // Analysis card variants
            case 'analysis_card':
                return renderAnalysisCard(data);

            // Info card variants
            case 'info_card':
                return renderInfoCard(data);

            // Chart data variants
            case 'chart_data':
            case 'chart':
                return renderChartData(data);

            default:
                return null;
        }
    }

    // === Check if text is a renderable widget ===
    function detectAndRender(text) {
        const data = tryParseJSON(text);
        if (!data) return null;

        const html = render(data);
        if (html) {
            return { html, data };
        }
        return null;
    }

    // === Public API ===
    return {
        tryParseJSON,
        render,
        detectAndRender,
        looksLikeJSON,
        setUserLocation,
        getUserLocation
    };
})();
