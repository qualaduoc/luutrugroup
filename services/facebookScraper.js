/**
 * Facebook Group Scraper — Puppeteer
 * Dùng headless browser để lấy thông tin group Facebook
 * Vì Facebook đã xoá Groups API (4/2024), đây là cách duy nhất còn hoạt động
 */

const puppeteer = require('puppeteer');

let browser = null;

// Launch browser once, reuse for multiple scrapes
async function getBrowser() {
    if (!browser || !browser.connected) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-notifications',
                '--lang=vi-VN',
            ],
        });
        console.log('[Scraper] Browser launched');
    }
    return browser;
}

/**
 * Scrape Facebook group info
 * @param {string} url - Facebook group URL
 * @returns {Object} { success, name, description, memberCount, privacy, coverUrl }
 */
async function scrapeGroupInfo(url) {
    let page = null;

    try {
        // Normalize URL
        if (!url.startsWith('http')) url = 'https://' + url;

        // Use mobile URL for faster loading
        const mobileUrl = url
            .replace('www.facebook.com', 'm.facebook.com')
            .replace('web.facebook.com', 'm.facebook.com');

        console.log(`[Scraper] Fetching: ${mobileUrl}`);

        const b = await getBrowser();
        page = await b.newPage();

        // Set viewport and language
        await page.setViewport({ width: 412, height: 915 });
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'vi-VN,vi;q=0.9' });

        // Block unnecessary resources for speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate with timeout
        await page.goto(mobileUrl, {
            waitUntil: 'networkidle2',
            timeout: 15000,
        });

        // Wait for dynamic content to render
        await new Promise(r => setTimeout(r, 3000));

        // Extract info from the page
        const info = await page.evaluate(() => {
            const result = {
                name: '',
                description: '',
                memberCount: '',
                privacy: '',
            };

            // === NAME ===
            // Strategy 1: og:title meta tag
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) result.name = ogTitle.content || '';

            // Strategy 2: title tag
            if (!result.name || result.name === 'Facebook') {
                result.name = document.title || '';
            }

            // Strategy 3: First h1 or strong in header
            if (!result.name || result.name === 'Facebook') {
                const h1 = document.querySelector('h1');
                if (h1 && h1.textContent.trim() !== 'Facebook') {
                    result.name = h1.textContent.trim();
                }
            }

            // Clean name
            result.name = result.name
                .replace(/\s*[\|·\-–—]\s*Facebook$/i, '')
                .replace(/\s*[\|·\-–—]\s*Đăng nhập.*$/i, '')
                .replace(/^Facebook$/i, '')
                .replace(/^Log in.*$/i, '')
                .replace(/^Redirecting.*$/i, '')
                .replace(/^Chuyển hướng.*$/i, '')
                .trim();

            // === DESCRIPTION ===
            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc) result.description = ogDesc.content || '';

            // === MEMBER COUNT ===
            // Look for member count patterns in the page text
            const bodyText = document.body.innerText || '';

            // Pattern: "X thành viên" or "X members"
            const memberPatterns = [
                /(\d[\d.,K]*)\s*(thành viên|members)/i,
                /(\d[\d.,K]*)\s*(người tham gia|participants)/i,
            ];

            for (const pattern of memberPatterns) {
                const match = bodyText.match(pattern);
                if (match) {
                    result.memberCount = match[1] + ' ' + match[2];
                    break;
                }
            }

            // Also try from description
            if (!result.memberCount && result.description) {
                for (const pattern of memberPatterns) {
                    const match = result.description.match(pattern);
                    if (match) {
                        result.memberCount = match[1] + ' ' + match[2];
                        break;
                    }
                }
            }

            // === PRIVACY ===
            const privacyPatterns = ['Nhóm Công khai', 'Nhóm Riêng tư', 'Public group', 'Private group'];
            for (const p of privacyPatterns) {
                if (bodyText.includes(p)) {
                    result.privacy = p;
                    break;
                }
            }

            return result;
        });

        console.log(`[Scraper] Result: name="${info.name}", members="${info.memberCount}", privacy="${info.privacy}"`);

        return {
            success: true,
            name: info.name || null,
            description: info.description || null,
            memberCount: info.memberCount || null,
            privacy: info.privacy || null,
        };

    } catch (err) {
        console.error(`[Scraper] Error: ${err.message}`);
        return {
            success: false,
            name: null,
            description: null,
            memberCount: null,
            privacy: null,
            error: err.message,
        };
    } finally {
        if (page) {
            try { await page.close(); } catch { }
        }
    }
}

// Graceful shutdown
async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
        console.log('[Scraper] Browser closed');
    }
}

module.exports = { scrapeGroupInfo, closeBrowser };
