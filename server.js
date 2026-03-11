require('dotenv').config();
const express = require('express');
const path = require('path');
const { scrapeGroupInfo, closeBrowser } = require('./services/facebookScraper');

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
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeBrowser();
    server.close();
    process.exit(0);
});
