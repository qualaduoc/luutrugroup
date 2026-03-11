require('dotenv').config();
const express = require('express');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== API: Fetch Facebook Group Info =====
app.post('/api/fetch-group-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Normalize URL
        let fetchUrl = url.trim();
        if (!fetchUrl.startsWith('http')) {
            fetchUrl = 'https://' + fetchUrl;
        }

        console.log(`[Fetch] Fetching group info: ${fetchUrl}`);

        // Fetch with browser-like headers
        const response = await fetch(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        // Try multiple strategies to extract group name
        let groupName = '';

        // Strategy 1: og:title meta tag
        groupName = $('meta[property="og:title"]').attr('content') || '';

        // Strategy 2: Twitter title
        if (!groupName) {
            groupName = $('meta[name="twitter:title"]').attr('content') || '';
        }

        // Strategy 3: HTML title tag
        if (!groupName) {
            groupName = $('title').text() || '';
        }

        // Strategy 4: Parse from JSON-LD
        if (!groupName) {
            $('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    if (json.name) groupName = json.name;
                } catch { }
            });
        }

        // Clean up the name
        groupName = groupName
            .replace(/\s*\|\s*Facebook$/i, '')
            .replace(/\s*-\s*Facebook$/i, '')
            .replace(/\s*·\s*Facebook$/i, '')
            .trim();

        // Extract description
        let description = $('meta[property="og:description"]').attr('content') || '';
        description = description.trim();

        // Extract member count if available
        let memberInfo = '';
        const descMatch = description.match(/(\d[\d.,]*\s*(thành viên|members|người))/i);
        if (descMatch) {
            memberInfo = descMatch[1];
        }

        console.log(`[Fetch] Result: name="${groupName}", members="${memberInfo}"`);

        res.json({
            success: true,
            name: groupName || null,
            description: description || null,
            memberInfo: memberInfo || null,
        });

    } catch (err) {
        console.error('[Fetch] Error:', err.message);
        res.json({
            success: false,
            name: null,
            description: null,
            memberInfo: null,
            error: err.message,
        });
    }
});

// ===== Fallback: serve index.html =====
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Start =====
app.listen(PORT, () => {
    console.log(`\n  🚀 Save Face Group đang chạy tại: http://localhost:${PORT}\n`);
});
