// ===== Supabase Config =====
const SUPABASE_URL = 'https://vjkqurkuuoucivicrelu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqa3F1cmt1dW91Y2l2aWNyZWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMjcxMTcsImV4cCI6MjA4ODgwMzExN30._brmGyVs738tMZnVZXW_MjMQAHbh24EPHK4B4w_5LuU';

let db = null;

try {
    if (window.supabase && window.supabase.createClient) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[Init] Supabase OK');
    } else {
        console.error('[Init] Supabase library not loaded!');
    }
} catch (err) {
    console.error('[Init] Error:', err);
}

// ===== DOM =====
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginError = document.getElementById('loginError');
const userEmailEl = document.getElementById('userEmail');

// ===== Auth =====
async function handleLogin() {
    if (!db) { showLoginError('Lỗi kết nối. Reload trang.'); return; }

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('btnLogin');

    if (!email || !password) { showLoginError('Nhập email và mật khẩu'); return; }

    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';
    loginError.style.display = 'none';

    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) {
            showLoginError('Sai email hoặc mật khẩu');
            btn.disabled = false;
            btn.textContent = 'Đăng nhập';
            return;
        }
        showApp(data.user);
    } catch (err) {
        showLoginError('Lỗi: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Đăng nhập';
    }
}

async function handleLogout() {
    if (!db) return;
    await db.auth.signOut();
    appScreen.classList.add('hidden');
    loginScreen.style.display = 'flex';
    loginError.style.display = 'none';
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
}

function showApp(user) {
    loginScreen.style.display = 'none';
    appScreen.classList.remove('hidden');
    userEmailEl.textContent = user.email;
    loadGroups();
}

async function checkSession() {
    if (!db) return;
    try {
        const { data: { session } } = await db.auth.getSession();
        if (session?.user) showApp(session.user);
    } catch { }
}

// ===== URL Parser =====
function parseFacebookGroupUrl(url) {
    url = url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace('www.', '').replace('m.', '').replace('web.', '');
        if (!hostname.includes('facebook.com') && !hostname.includes('fb.com')) return null;
        const match = parsed.pathname.match(/\/groups\/([^/?#]+)/);
        if (match && match[1]) {
            const slug = decodeURIComponent(match[1]);
            return { slug, url, name: formatSlugToName(slug) };
        }
    } catch { }
    return null;
}

function formatSlugToName(slug) {
    if (/^\d+$/.test(slug)) return `Group #${slug}`;
    return slug.replace(/[._-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ===== Fetch Group Info (Server-side) =====
async function fetchGroupInfo(url) {
    try {
        const res = await fetch('/api/fetch-group-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        return await res.json();
    } catch {
        return { success: false, name: null };
    }
}

// ===== Toast =====
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${type === 'success' ? '✓' : '✕'} <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ===== CRUD =====
let allGroups = [];

async function loadGroups() {
    if (!db) return;
    const { data, error } = await db.from('groups').select('*').order('created_at', { ascending: false });
    if (error) { showToast('Lỗi tải dữ liệu: ' + error.message, 'error'); return; }
    allGroups = data || [];
    renderGroups(document.getElementById('searchInput').value);
}

async function addGroup() {
    const urlInput = document.getElementById('urlInput');
    const btn = document.getElementById('btnAdd');
    const btnText = document.getElementById('btnAddText');
    const rawUrl = urlInput.value.trim();

    if (!rawUrl) { showToast('Nhập link group Facebook', 'error'); urlInput.focus(); return; }

    const parsed = parseFacebookGroupUrl(rawUrl);
    if (!parsed) { showToast('Link không hợp lệ', 'error'); urlInput.focus(); return; }
    if (allGroups.some(g => g.slug === parsed.slug)) { showToast('Group đã lưu rồi!', 'error'); urlInput.value = ''; return; }

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span> Đang tìm...';

    let groupName = parsed.name;
    let groupDesc = '';
    let memberCount = '';
    let privacy = '';
    const info = await fetchGroupInfo(parsed.url);
    if (info.success && info.name && info.name !== 'Facebook') {
        groupName = info.name;
    }
    if (info.description) groupDesc = info.description;
    if (info.memberCount) memberCount = info.memberCount;
    if (info.privacy) privacy = info.privacy;

    const { data: { user } } = await db.auth.getUser();
    const { error } = await db.from('groups').insert({
        url: parsed.url, slug: parsed.slug, name: groupName,
        description: groupDesc,
        member_count: memberCount,
        privacy: privacy,
        note: 'NHÓM KHÔNG DUYỆT - ĐĂNG CÔNG KHAI',
        created_by: user?.email || 'unknown',
    });

    btn.disabled = false;
    btnText.textContent = 'Thêm';

    if (error) {
        showToast(error.code === '23505' ? 'Group đã tồn tại!' : 'Lỗi: ' + error.message, 'error');
        return;
    }

    urlInput.value = '';
    urlInput.focus();
    await loadGroups();
    showToast(`Đã lưu: ${groupName}`);
}

async function deleteGroup(id) {
    const group = allGroups.find(g => g.id === id);
    if (!group || !confirm(`Xoá "${group.name}"?`)) return;
    const { error } = await db.from('groups').delete().eq('id', id);
    if (error) { showToast('Lỗi xoá', 'error'); return; }
    await loadGroups();
    showToast('Đã xoá');
}

async function updateGroupName(id, newName) {
    if (!newName) return;
    const { error } = await db.from('groups').update({ name: newName }).eq('id', id);
    if (!error) {
        const g = allGroups.find(g => g.id === id);
        if (g) g.name = newName;
        showToast('Đã cập nhật tên');
    }
}

// ===== Lấy tên (Retry fetch) =====
async function retryFetchName(id) {
    const group = allGroups.find(g => g.id === id);
    if (!group) return;

    // Find the button and show loading
    const btn = document.querySelector(`[data-refetch-id="${id}"]`);
    if (btn) {
        btn.classList.add('loading');
        btn.innerHTML = '<span class="spinner"></span> Đang lấy...';
    }

    const info = await fetchGroupInfo(group.url);

    if (info.success && info.name && info.name !== 'Facebook') {
        const updates = { name: info.name };
        if (info.description) updates.description = info.description;
        if (info.memberCount) updates.member_count = info.memberCount;
        if (info.privacy) updates.privacy = info.privacy;
        await db.from('groups').update(updates).eq('id', id);
        Object.assign(group, updates);
        showToast(`Đã cập nhật: ${info.name}`);
        renderGroups(document.getElementById('searchInput').value);
    } else {
        showToast('Không lấy được tên. Thử lại sau.', 'error');
        if (btn) {
            btn.classList.remove('loading');
            btn.innerHTML = '🔄 Lấy tên';
        }
    }
}

// ===== Sửa link =====
async function editGroupUrl(id) {
    const group = allGroups.find(g => g.id === id);
    if (!group) return;

    const newUrl = prompt('Nhập link mới cho group:', group.url);
    if (!newUrl || newUrl === group.url) return;

    const parsed = parseFacebookGroupUrl(newUrl);
    if (!parsed) { showToast('Link không hợp lệ', 'error'); return; }

    const { error } = await db.from('groups').update({
        url: parsed.url,
        slug: parsed.slug,
    }).eq('id', id);

    if (error) { showToast('Lỗi: ' + error.message, 'error'); return; }

    group.url = parsed.url;
    group.slug = parsed.slug;
    showToast('Đã cập nhật link');
    renderGroups(document.getElementById('searchInput').value);
}

function copyLink(url) {
    navigator.clipboard.writeText(url).then(() => showToast('Đã copy link!')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Đã copy link!');
    });
}

function copyAllLinks() {
    if (!allGroups.length) { showToast('Không có link', 'error'); return; }
    navigator.clipboard.writeText(allGroups.map(g => g.url).join('\n'))
        .then(() => showToast(`Đã copy ${allGroups.length} link!`));
}

// ===== Render (3-column grid, compact cards) =====
function renderGroups(filter = '') {
    const list = document.getElementById('groupList');
    document.getElementById('groupCount').textContent = allGroups.length;

    const filtered = filter
        ? allGroups.filter(g =>
            g.name.toLowerCase().includes(filter.toLowerCase()) ||
            g.slug.toLowerCase().includes(filter.toLowerCase()) ||
            g.url.toLowerCase().includes(filter.toLowerCase())
        )
        : allGroups;

    if (!filtered.length) {
        list.innerHTML = `
      <div class="empty-state">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>${filter ? 'Không tìm thấy' : 'Chưa có group nào'}</p>
        <p class="hint">${filter ? 'Thử từ khác' : 'Paste link Facebook group ở trên'}</p>
      </div>`;
        return;
    }

    list.innerHTML = filtered.map((group, i) => {
        const date = new Date(group.created_at).toLocaleDateString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const safeUrl = escapeHtml(group.url);
        const safeName = escapeHtml(group.name);
        const isGenericName = group.name === 'Facebook' || group.name.startsWith('Group #');
        const badgeClass = isGenericName ? 'group-badge no-name' : 'group-badge';
        const badgeText = isGenericName ? 'Chưa có tên' : 'Công khai';
        const memberHtml = group.member_count ? `<span class="group-members">👥 ${escapeHtml(group.member_count)}</span>` : '';
        const privacyHtml = group.privacy ? `<span class="group-privacy">${escapeHtml(group.privacy)}</span>` : '';
        const descHtml = group.description ? `<div class="group-desc" title="${escapeHtml(group.description)}">${escapeHtml(group.description)}</div>` : '';

        return `
      <div class="group-card">
        <div class="group-card-header">
          <div class="group-index">${i + 1}</div>
          <div class="group-name-row">
            <div class="group-name">
              <span class="editable-name" contenteditable="true" spellcheck="false"
                data-id="${group.id}" title="Click sửa tên">${safeName}</span>
              <span class="${badgeClass}">${badgeText}</span>
            </div>
            ${memberHtml}${privacyHtml}
            ${descHtml}
            <div class="group-link" title="${safeUrl}">${safeUrl}</div>
          </div>
        </div>
        <div class="group-meta">
          <span>${escapeHtml(group.created_by || '—')}</span>
          <span>${date}</span>
        </div>
        <div class="group-actions">
          <button class="btn-sm btn-copy" data-url="${safeUrl}" title="Copy link">📋 Copy</button>
          <button class="btn-sm btn-refetch" data-refetch-id="${group.id}" title="Lấy lại tên group">🔄 Lấy tên</button>
          <button class="btn-sm" data-edit-id="${group.id}" title="Sửa URL">✏️ Sửa link</button>
          <button class="btn-sm btn-delete" data-delete-id="${group.id}" title="Xoá">🗑️</button>
        </div>
      </div>`;
    }).join('');

    // Event delegation
    list.querySelectorAll('.btn-copy').forEach(b => b.addEventListener('click', () => copyLink(b.dataset.url)));
    list.querySelectorAll('[data-refetch-id]').forEach(b => b.addEventListener('click', () => retryFetchName(b.dataset.refetchId)));
    list.querySelectorAll('[data-edit-id]').forEach(b => b.addEventListener('click', () => editGroupUrl(b.dataset.editId)));
    list.querySelectorAll('[data-delete-id]').forEach(b => b.addEventListener('click', () => deleteGroup(b.dataset.deleteId)));

    list.querySelectorAll('.editable-name').forEach(el => {
        el.addEventListener('blur', () => {
            const n = el.textContent.trim();
            if (n) updateGroupName(el.dataset.id, n);
        });
        el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

// ===== Export / Import =====
function exportGroups() {
    if (!allGroups.length) { showToast('Không có group', 'error'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(allGroups, null, 2)], { type: 'application/json' }));
    a.download = `fb-groups-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast('Đã xuất backup');
}

async function importGroups() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const imported = JSON.parse(await file.text());
            if (!Array.isArray(imported)) throw 0;
            const slugs = new Set(allGroups.map(g => g.slug));
            const news = imported.filter(g => g.slug && g.url && !slugs.has(g.slug));
            if (!news.length) { showToast('Không có group mới', 'error'); return; }
            const { data: { user } } = await db.auth.getUser();
            const { error } = await db.from('groups').insert(news.map(g => ({
                url: g.url, slug: g.slug, name: g.name || g.slug,
                note: g.note || 'NHÓM KHÔNG DUYỆT - ĐĂNG CÔNG KHAI',
                created_by: user?.email || 'imported',
            })));
            if (error) { showToast('Lỗi import', 'error'); return; }
            await loadGroups();
            showToast(`Import ${news.length} group`);
        } catch { showToast('File lỗi', 'error'); }
    };
    input.click();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    document.getElementById('searchInput').addEventListener('input', e => renderGroups(e.target.value));
    document.getElementById('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') addGroup(); });
    document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
    document.getElementById('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginPassword').focus(); });
});
