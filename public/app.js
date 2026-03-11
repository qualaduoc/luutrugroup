// ===== Supabase Config =====
const SUPABASE_URL = 'https://vjkqurkuuoucivicrelu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqa3F1cmt1dW91Y2l2aWNyZWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMjcxMTcsImV4cCI6MjA4ODgwMzExN30._brmGyVs738tMZnVZXW_MjMQAHbh24EPHK4B4w_5LuU';

let db = null;

// Initialize Supabase
try {
    if (window.supabase && window.supabase.createClient) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[Init] Supabase client created successfully');
    } else {
        console.error('[Init] Supabase library not loaded!');
    }
} catch (err) {
    console.error('[Init] Supabase init error:', err);
}

// ===== DOM Elements =====
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginError = document.getElementById('loginError');
const userEmailEl = document.getElementById('userEmail');

// ===== Auth =====
async function handleLogin() {
    console.log('[Login] handleLogin called');

    if (!db) {
        showLoginError('Lỗi kết nối Supabase. Hãy reload trang.');
        console.error('[Login] Supabase client is null');
        return;
    }

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('btnLogin');

    console.log('[Login] Email:', email);

    if (!email || !password) {
        showLoginError('Vui lòng nhập email và mật khẩu');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';
    loginError.style.display = 'none';

    try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });

        console.log('[Login] Response:', { data, error });

        if (error) {
            console.error('[Login] Error:', error.message);
            showLoginError('Sai email hoặc mật khẩu');
            btn.disabled = false;
            btn.textContent = 'Đăng nhập';
            return;
        }

        showApp(data.user);
    } catch (err) {
        console.error('[Login] Exception:', err);
        showLoginError('Lỗi kết nối: ' + err.message);
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
    document.getElementById('loginPassword').value = '';
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

// Check session on load
async function checkSession() {
    if (!db) return;
    try {
        const { data: { session } } = await db.auth.getSession();
        console.log('[Session] Check:', session ? 'found' : 'none');
        if (session?.user) {
            showApp(session.user);
        }
    } catch (err) {
        console.error('[Session] Error:', err);
    }
}

// ===== Facebook URL Parser =====
function parseFacebookGroupUrl(url) {
    url = url.trim();
    if (!url.startsWith('http')) url = 'https://' + url;

    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace('www.', '').replace('m.', '').replace('web.', '');
        if (!hostname.includes('facebook.com') && !hostname.includes('fb.com')) return null;

        const match = parsed.pathname.match(/\/groups\/([^/?#]+)/);
        if (match && match[1]) {
            const groupSlug = decodeURIComponent(match[1]);
            return {
                slug: groupSlug,
                url: url,
                name: formatSlugToName(groupSlug)
            };
        }
    } catch { }
    return null;
}

function formatSlugToName(slug) {
    if (/^\d+$/.test(slug)) return `Group #${slug}`;
    return slug.replace(/[._-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ===== Fetch Group Info (AI - Server-side) =====
async function fetchGroupInfo(url) {
    try {
        const res = await fetch('/api/fetch-group-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await res.json();
        return data;
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

// ===== CRUD Operations =====
let allGroups = [];

async function loadGroups() {
    if (!db) return;
    const { data, error } = await db
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Load error:', error);
        showToast('Không thể tải dữ liệu: ' + error.message, 'error');
        return;
    }

    allGroups = data || [];
    renderGroups(document.getElementById('searchInput').value);
}

async function addGroup() {
    const urlInput = document.getElementById('urlInput');
    const btn = document.getElementById('btnAdd');
    const btnText = document.getElementById('btnAddText');
    const rawUrl = urlInput.value.trim();

    if (!rawUrl) {
        showToast('Vui lòng nhập link group Facebook', 'error');
        urlInput.focus();
        return;
    }

    const parsed = parseFacebookGroupUrl(rawUrl);
    if (!parsed) {
        showToast('Link không hợp lệ. VD: facebook.com/groups/abc', 'error');
        urlInput.focus();
        return;
    }

    if (allGroups.some(g => g.slug === parsed.slug)) {
        showToast('Group này đã được lưu rồi!', 'error');
        urlInput.value = '';
        return;
    }

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span> Đang tìm...';

    let groupName = parsed.name;
    const info = await fetchGroupInfo(parsed.url);
    if (info.success && info.name) {
        groupName = info.name;
    }

    const { data: { user } } = await db.auth.getUser();

    const { error } = await db.from('groups').insert({
        url: parsed.url,
        slug: parsed.slug,
        name: groupName,
        note: 'NHÓM KHÔNG DUYỆT - ĐĂNG CÔNG KHAI',
        created_by: user?.email || 'unknown',
    });

    btn.disabled = false;
    btnText.textContent = 'Thêm';

    if (error) {
        if (error.code === '23505') {
            showToast('Group này đã tồn tại!', 'error');
        } else {
            console.error('Insert error:', error);
            showToast('Lỗi khi lưu: ' + error.message, 'error');
        }
        return;
    }

    urlInput.value = '';
    urlInput.focus();
    await loadGroups();
    showToast(`Đã lưu: ${groupName}`);
}

async function deleteGroup(id) {
    const group = allGroups.find(g => g.id === id);
    if (!group || !confirm(`Xoá group "${group.name}"?`)) return;

    const { error } = await db.from('groups').delete().eq('id', id);
    if (error) {
        showToast('Lỗi khi xoá: ' + error.message, 'error');
        return;
    }

    await loadGroups();
    showToast('Đã xoá group');
}

async function updateGroupName(id, newName) {
    if (!newName) return;
    const { error } = await db.from('groups').update({ name: newName }).eq('id', id);
    if (error) {
        showToast('Lỗi khi cập nhật', 'error');
        return;
    }
    const group = allGroups.find(g => g.id === id);
    if (group) group.name = newName;
    showToast('Đã cập nhật tên');
}

function copyLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('Đã copy link!');
    }).catch(() => {
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
    if (allGroups.length === 0) {
        showToast('Không có link nào', 'error');
        return;
    }
    const links = allGroups.map(g => g.url).join('\n');
    navigator.clipboard.writeText(links).then(() => {
        showToast(`Đã copy ${allGroups.length} link!`);
    });
}

// ===== Render =====
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

    if (filtered.length === 0) {
        list.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>${filter ? 'Không tìm thấy group nào' : 'Chưa có group nào được lưu'}</p>
        <p class="hint">${filter ? 'Thử tìm kiếm khác' : 'Paste link Facebook group vào ô bên trên'}</p>
      </div>`;
        return;
    }

    list.innerHTML = filtered.map((group, i) => {
        const date = new Date(group.created_at).toLocaleDateString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const safeUrl = escapeHtml(group.url);
        return `
      <div class="group-card">
        <div class="group-index">${i + 1}</div>
        <div class="group-info">
          <div class="group-name">
            <span class="editable-name" contenteditable="true" spellcheck="false"
              data-id="${group.id}" title="Click để sửa tên">${escapeHtml(group.name)}</span>
            <span class="group-badge">Công khai</span>
          </div>
          <div class="group-link" title="${safeUrl}">${safeUrl}</div>
          <div class="group-meta">
            <span>Thêm bởi: ${escapeHtml(group.created_by || '—')}</span>
            <span>${date}</span>
          </div>
        </div>
        <div class="group-actions">
          <button class="btn-icon btn-copy" data-url="${safeUrl}" title="Copy link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="btn-icon btn-delete" data-id="${group.id}" title="Xoá">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>`;
    }).join('');

    // Event delegation for buttons
    list.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => copyLink(btn.dataset.url));
    });

    list.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteGroup(btn.dataset.id));
    });

    // Inline editing
    list.querySelectorAll('.editable-name').forEach(el => {
        el.addEventListener('blur', () => {
            const newName = el.textContent.trim();
            if (newName) updateGroupName(el.dataset.id, newName);
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ===== Export / Import =====
function exportGroups() {
    if (allGroups.length === 0) {
        showToast('Không có group nào', 'error');
        return;
    }
    const blob = new Blob([JSON.stringify(allGroups, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fb-groups-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Đã xuất file backup');
}

async function importGroups() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const text = await file.text();
        try {
            const imported = JSON.parse(text);
            if (!Array.isArray(imported)) throw new Error();

            const existingSlugs = new Set(allGroups.map(g => g.slug));
            const newGroups = imported.filter(g => g.slug && g.url && !existingSlugs.has(g.slug));

            if (newGroups.length === 0) {
                showToast('Không có group mới để import', 'error');
                return;
            }

            const { data: { user } } = await db.auth.getUser();
            const rows = newGroups.map(g => ({
                url: g.url,
                slug: g.slug,
                name: g.name || g.slug,
                note: g.note || 'NHÓM KHÔNG DUYỆT - ĐĂNG CÔNG KHAI',
                created_by: user?.email || 'imported',
            }));

            const { error } = await db.from('groups').insert(rows);
            if (error) {
                showToast('Lỗi khi import: ' + error.message, 'error');
                return;
            }

            await loadGroups();
            showToast(`Đã import ${newGroups.length} group mới`);
        } catch {
            showToast('File không hợp lệ', 'error');
        }
    };
    input.click();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] DOMContentLoaded');
    checkSession();

    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderGroups(e.target.value);
    });

    document.getElementById('urlInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addGroup();
    });

    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    document.getElementById('loginEmail').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('loginPassword').focus();
    });
});
