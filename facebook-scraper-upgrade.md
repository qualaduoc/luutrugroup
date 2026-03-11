# Nâng cấp AI lấy thông tin Group Facebook

## Goal
Thay thế `fetch` + `cheerio` bằng **Puppeteer** (headless browser) để lấy đầy đủ thông tin group Facebook: tên, mô tả, số thành viên.

> **Lý do:** Facebook đã xoá hoàn toàn Groups API (4/2024). Fetch thường bị block. Puppeteer mô phỏng trình duyệt thật → tỉ lệ thành công cao hơn.

## Tasks

- [ ] Task 1: Cài `puppeteer` → chạy `npm install puppeteer`
- [ ] Task 2: Tạo `services/facebookScraper.js` — module riêng xử lý scrape bằng Puppeteer
- [ ] Task 3: Cập nhật `server.js` — đổi API `/api/fetch-group-info` dùng module scraper mới
- [ ] Task 4: Cập nhật `public/app.js` — hiển thị thêm mô tả, số thành viên trên card
- [ ] Task 5: Cập nhật `public/style.css` — style cho thông tin mở rộng trên card
- [ ] Task 6: Cập nhật database — thêm cột `description`, `member_count` vào bảng `groups`
- [ ] Task 7: Test: restart server, thêm group mới, bấm "Lấy tên" → xác minh lấy được đầy đủ info
- [ ] Task 8: Commit & push

## Done When
- [ ] Thêm group mới → tự động lấy được tên + mô tả + số thành viên
- [ ] Nút "Lấy tên" → cập nhật đầy đủ thông tin
- [ ] Card hiển thị thông tin mở rộng

## Notes
- Puppeteer tải lần đầu sẽ download Chromium (~170MB)
- Mỗi lần scrape mất 5-10 giây (vì phải đợi trang load)
- Sẽ giới hạn timeout 15 giây để tránh treo
