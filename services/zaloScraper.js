const puppeteer = require('puppeteer');

let browser = null;

async function initBrowser() {
    if (!browser) {
        console.log('[ZaloScraper] Khởi tạo Chrome...');
        browser = await puppeteer.launch({
            headless: 'new', // Khuyến khích dùng headless false nếu Zalo block quá mạnh, nhưng thử 'new' trước
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });
    }
    return browser;
}

async function scrapeZaloGroupInfo(url) {
    let page = null;
    try {
        const b = await initBrowser();
        page = await b.newPage();
        
        // Emulate Mobile User Agent or common Desktop to avoid blocked screen
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // Block images/css to speed up
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const rt = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(rt)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`[ZaloScraper] Fetching: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Try extracting group name from DOM
        let name = 'Unknown Zalo Group';
        let memberCount = 0;
        let creatorName = '';

        try {
            await page.waitForSelector('h1, button, .community-name', { timeout: 10000 });
            
            // 1. Phân tích Tên nhóm từ thẻ title hoặc meta
            const pageTitle = await page.title();
            if (pageTitle && pageTitle.length > 0 && !pageTitle.toLowerCase().includes('đăng nhập')) {
                name = pageTitle.replace(/ - Zalo|Zalo - /gi, '').trim();
            }
            
            // Hoặc lấy từ H1
            const h1Name = await page.evaluate(() => {
                const h1 = document.querySelector('h1');
                return h1 ? h1.innerText.trim() : null;
            });
            if (h1Name && h1Name.length > 0 && !h1Name.toLowerCase().includes('đăng nhập')) {
                name = h1Name;
            }

            // 2. Click nút "Tham gia" để hiện popup thành viên
            const clicked = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('div, span, button, a'));
                const joinBtn = btns.find(b => b.innerText && (b.innerText.trim().includes('Tham gia cộng đồng') || b.innerText.trim().includes('Tham gia nhóm')));
                if(joinBtn) {
                    joinBtn.click();
                    return true;
                }
                return false;
            });

            if (clicked) {
                // Đợi modal xuất hiện
                await new Promise(r => setTimeout(r, 2000));
                
                // 3. Lấy số lượng thành viên
                const membersStr = await page.evaluate(() => {
                    const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.match(/([0-9.,km]+)\s*thành viên/i));
                    return el ? el.innerText.match(/([0-9.,km]+)\s*thành viên/i)[1] : null;
                });
                if (membersStr) {
                    memberCount = parseInt(membersStr.replace(/[,.]/g, ''), 10) || 0;
                }

                // 4. Lấy Tên Trưởng Nhóm / Người tạo
                const creator = await page.evaluate(() => {
                    const els = Array.from(document.querySelectorAll('div, span'));
                    const creatorEl = els.find(e => e.innerText && e.innerText.includes('Tạo bởi'));
                    if (creatorEl) {
                        return creatorEl.innerText.replace('Tạo bởi', '').trim();
                    }
                    return null;
                });
                if (creator) creatorName = creator;
            }

        } catch (error) {
            console.log('Error while parsing Zalo page:', error.message);
        }    
        
        // Original extraction logic (kept for fallback/comparison, though new logic is more specific)
        let groupName = null; // Renamed from 'name' to avoid conflict with new 'name' variable
        let oldMemberCount = null; // Renamed from 'memberCount' to avoid conflict with new 'memberCount' variable

        try {
            const titleContent = await page.title();
            
            // Try to extract from og:title if it exists
            const ogTitle = await page.evaluate(() => {
                const meta = document.querySelector('meta[property="og:title"]');
                return meta ? meta.content : null;
            });

            // Extract Name
            if (ogTitle && ogTitle !== 'Zalo Web') {
                 // "Nhóm XYZ trên Zalo" -> "XYZ"
                 groupName = ogTitle.replace(/^(Nhóm|Group)\s+/i, '').replace(/\s+(trên Zalo)$/i, '').trim();
            } else if (titleContent && titleContent !== 'Zalo Web' && titleContent !== 'Đăng nhập Zalo') {
                 groupName = titleContent.replace(/^(Nhóm|Group)\s+/i, '').replace(/\s+(trên Zalo)$/i, '').trim();
            }

            // Fallback for group name using DOM selectors common in Zalo invite pages
            if (!groupName || groupName === 'Đăng nhập tài khoản Zalo') {
                groupName = await page.evaluate(() => {
                    // Typical Zalo invite page has the group name in an h1 or strong tag
                    const el = document.querySelector('.group-name, h1, .qr-title');
                    return el ? el.innerText.trim() : null;
                });
            }

            // Extract Member Count
            oldMemberCount = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('span, p, div'));
                const memberEl = els.find(el => el.innerText.match(/\d+\s+thành viên/i));
                return memberEl ? memberEl.innerText.trim() : null;
            });
            
        } catch (err) {
            console.log(`[ZaloScraper] DOM extraction failed: ${err.message}`);
        }

        // Prioritize new extraction, fallback to old if new is default
        const nameResult = (name !== 'Unknown Zalo Group' && name !== 'Đăng nhập tài khoản Zalo') ? name : (groupName || 'Zalo Group');
        const membersResult = (memberCount > 0) ? memberCount : (oldMemberCount || '');

        console.log(`[ZaloScraper] Result: name="${nameResult}", members="${membersResult}"`);
        
        return {
            success: true,
            name: nameResult,
            memberCount: membersResult,
            creatorName: creatorName
        };

    } catch (error) {
        console.error(`[ZaloScraper] Error scraping ${url}:`, error.message);
        return { success: false, name: null, error: error.message };
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

async function closeBrowser() {
    if (browser) {
        await browser.close().catch(() => {});
        browser = null;
    }
}

module.exports = {
    scrapeZaloGroupInfo,
    closeBrowser
};
