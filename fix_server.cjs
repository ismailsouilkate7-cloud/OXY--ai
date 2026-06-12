const fs = require('fs');

let c = fs.readFileSync('server.js', 'utf8');
const lines = c.split(/\r?\n/);

const newLines = [
    ...lines.slice(0, 1995),
    `async function performWebSearch(query) {
    if (!query) {
        return null;
    }
    
    console.log('[Tavily] Searching: ' + query);
    
    if (!process.env.TAVILY_API_KEY) {
        console.error('[Tavily] Failed: Missing TAVILY_API_KEY in environment');
        return null;
    }

    try {
        const timeoutMs = 15000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                api_key: process.env.TAVILY_API_KEY,
                query: query,
                search_depth: "advanced",
                max_results: 5,
                include_answer: true,
                include_raw_content: false
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error('Tavily API returned status: ' + response.status);
        }

        const data = await response.json();
        const results = data.results || [];
        
        let formattedResults = results.map(r => ({
            title: r.title || '',
            url: r.url || '',
            description: r.content || ''
        })).filter(r => r.title && r.url);

        if (data.answer) {
            formattedResults.unshift({
                title: "Tavily AI Answer",
                url: "https://tavily.com",
                description: data.answer
            });
        }

        if (formattedResults.length === 0) {
            console.log('[Tavily] Success: 0 results');
            return null;
        }

        console.log('[Tavily] Success: ' + formattedResults.length + ' results');
        return formattedResults;

    } catch (error) {
        const errorMessage = error.name === 'AbortError' ? 'Timeout after 15000ms' : (error.message || 'Unknown error');
        console.error('[Tavily] Failed: ' + errorMessage);
        return null;
    }
}`,
    ...lines.slice(2015)
];

fs.writeFileSync('server.js', newLines.join('\n'));
console.log('Fixed server.js');
