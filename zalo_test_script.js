const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']});
    const page = await browser.newPage();
    
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false, });
    });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        console.log('Loading URL...');
        await page.goto('https://zalo.me/g/wgipzs203', {waitUntil: 'domcontentloaded'});
        
        console.log('Title: ', await page.title());
        await new Promise(r => setTimeout(r, 2000));
        
        // Find and click the join button
        const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('div, span, button, a'));
            const joinBtn = btns.find(b => b.innerText && (b.innerText.includes('Tham gia cộng đồng') || b.innerText.includes('Tham gia nhóm')));
            if(joinBtn) {
                joinBtn.click();
                return true;
            }
            return false;
        });

        if (clicked) {
            console.log('Clicked Join. Waiting for response...');
            await new Promise(r => setTimeout(r, 2000));
            
            const memberCount = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('*'));
                const el = els.find(e => e.innerText && e.innerText.match(/(\d+) thành viên/));
                return el ? el.innerText.match(/(\d+) thành viên/)[0] : 'Không tìm thấy số thành viên';
            });
            
            const leaderName = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('div, span'));
                const leaderParent = els.find(e => e.innerText && e.innerText.includes('Tạo bởi'));
                if (leaderParent && leaderParent.querySelector('span:last-child')) {
                    return leaderParent.querySelector('span:last-child').innerText;
                } else if (leaderParent) {
                    return leaderParent.innerText.replace('Tạo bởi', '').trim();
                }
                return 'Không tìm thấy trưởng nhóm';
            });
            
            console.log('Members:', memberCount);
            console.log('Leader:', leaderName);
        } else {
            console.log('Join button not found.');
        }
        
    } catch(e) {
        console.error('Err:', e);
    }
    
    await browser.close();
})();
