require('dotenv').config();
const express = require('express');
const path = require('path');
const { scrapeGroupInfo, closeBrowser } = require('./services/facebookScraper');
const { scrapeZaloGroupInfo, closeBrowser: closeZaloBrowser } = require('./services/zaloScraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== API: Fetch Facebook Group Info (Puppeteer) =====
app.post('/api/fetch-group-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        const result = await scrapeGroupInfo(url);
        res.json(result);

    } catch (err) {
        console.error('[API] Error:', err.message);
        res.json({ success: false, name: null, error: err.message });
    }
});

// ===== API: Fetch Zalo Group Info (Puppeteer) =====
app.post('/api/fetch-zalo-info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        const result = await scrapeZaloGroupInfo(url);
        res.json(result);

    } catch (err) {
        console.error('[API] Error Zalo:', err.message);
        res.json({ success: false, name: null, error: err.message });
    }
});

// ===== API: Batch Scrape (SSE - Server-Sent Events for real-time progress) =====
app.post('/api/batch-scrape', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'urls array required' });
    }

    // Giới hạn tối đa 50 URL mỗi lần
    const limited = urls.slice(0, 50);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log(`[Batch] Processing ${limited.length} URLs...`);

    for (let i = 0; i < limited.length; i++) {
        const url = limited[i];
        try {
            const result = await scrapeGroupInfo(url);
            const event = {
                index: i,
                total: limited.length,
                url,
                ...result,
            };
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch (err) {
            res.write(`data: ${JSON.stringify({
                index: i, total: limited.length, url,
                success: false, name: null, error: err.message,
            })}\n\n`);
        }
    }

    // Send done signal
    res.write(`data: ${JSON.stringify({ done: true, total: limited.length })}\n\n`);
    res.end();
});

// ===== Fallback =====
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Start =====
const server = app.listen(PORT, () => {
    console.log(`\n  🚀 Save Face Group: http://localhost:${PORT}\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Server] Shutting down...');
    await closeBrowser();
    await closeZaloBrowser();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeBrowser();
    await closeZaloBrowser();
    server.close();
    process.exit(0);
});
