require('dotenv').config();
const express = require('express');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== User-Agent Pool (rotate to avoid blocking) =====
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ===== API: Fetch Facebook Group Info =====
app.post('/api/fetch-group-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        let fetchUrl = url.trim();
        if (!fetchUrl.startsWith('http')) fetchUrl = 'https://' + fetchUrl;

        // Ensure mobile URL for better scraping (m.facebook.com returns simpler HTML)
        const mobileUrl = fetchUrl
            .replace('www.facebook.com', 'm.facebook.com')
            .replace('web.facebook.com', 'm.facebook.com');

        console.log(`[Fetch] Trying: ${mobileUrl}`);

        let groupName = '';
        let description = '';

        // Try mobile URL first (often less restricted)
        try {
            const result = await tryFetch(mobileUrl);
            groupName = result.name;
            description = result.description;
        } catch { }

        // If mobile failed or returned generic name, try desktop URL
        if (!groupName || groupName === 'Facebook' || groupName === 'Log in to Facebook') {
            console.log(`[Fetch] Mobile failed, trying desktop...`);
            try {
                const result = await tryFetch(fetchUrl);
                if (result.name && result.name !== 'Facebook' && result.name !== 'Log in to Facebook') {
                    groupName = result.name;
                    description = result.description;
                }
            } catch { }
        }

        // Clean up name
        groupName = cleanGroupName(groupName);

        console.log(`[Fetch] Result: name="${groupName}"`);

        res.json({
            success: true,
            name: groupName || null,
            description: description || null,
        });

    } catch (err) {
        console.error('[Fetch] Error:', err.message);
        res.json({ success: false, name: null, error: err.message });
    }
});

async function tryFetch(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': getRandomUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate',
            'Cache-Control': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    let name = '';
    let description = '';

    // Strategy 1: og:title
    name = $('meta[property="og:title"]').attr('content') || '';

    // Strategy 2: title tag
    if (!name || name === 'Facebook') {
        name = $('title').text() || '';
    }

    // Strategy 3: twitter:title
    if (!name || name === 'Facebook') {
        name = $('meta[name="twitter:title"]').attr('content') || '';
    }

    // Strategy 4: Look for group name in structured data
    if (!name || name === 'Facebook') {
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const json = JSON.parse($(el).html());
                if (json.name && json.name !== 'Facebook') name = json.name;
            } catch { }
        });
    }

    // Strategy 5: Look for h1 or strong elements containing group name
    if (!name || name === 'Facebook') {
        const h1Text = $('h1').first().text().trim();
        if (h1Text && h1Text.length > 2 && h1Text !== 'Facebook') {
            name = h1Text;
        }
    }

    // Get description
    description = $('meta[property="og:description"]').attr('content') || '';

    return { name: name.trim(), description: description.trim() };
}

function cleanGroupName(name) {
    if (!name) return '';
    return name
        .replace(/\s*[\|·\-–—]\s*Facebook$/i, '')
        .replace(/\s*[\|·\-–—]\s*Đăng nhập.*$/i, '')
        .replace(/^Đăng nhập.*$/i, '')
        .replace(/^Log in.*$/i, '')
        .replace(/^Facebook$/i, '')
        .trim();
}

// ===== Fallback =====
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  🚀 Save Face Group: http://localhost:${PORT}\n`);
});
