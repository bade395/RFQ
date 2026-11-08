let foldersData = [];
let currentCategory = 'الكل';
let activeUrl = '';

const $ = (id) => document.getElementById(id);
const countByType = (items = []) => ({
    files: items.filter(item => item.type === 'file').length,
    folders: items.filter(item => item.type === 'folder').length,
    total: items.length
});

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

async function loadAllData() {
    try {
        const response = await fetch('data/folders-data.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('صيغة بيانات المجلدات غير صحيحة');
        foldersData = data;
        updateTotalStats();
        renderGrid();
        updateCategoryCounts();
    } catch (error) {
        console.error('خطأ في تحميل بيانات المجلدات:', error);
        $('foldersGrid').innerHTML = '<p class="empty-state">تعذر تحميل البيانات. حدّث الصفحة وحاول مرة أخرى.</p>';
    }
}

function updateTotalStats() {
    const totals = foldersData.reduce((sum, folder) => {
        const counts = countByType(folder.items);
        sum.files += counts.files;
        sum.subfolders += counts.folders;
        return sum;
    }, { files: 0, subfolders: 0 });

    if ($('totalFoldersStat')) $('totalFoldersStat').textContent = foldersData.length.toLocaleString('ar');
    if ($('totalItemsStat')) $('totalItemsStat').textContent =
        (totals.files + totals.subfolders).toLocaleString('ar');
    const labels = document.querySelectorAll('.stat-info p');
    if (labels[0]) labels[0].textContent = 'إجمالي المجلدات الرئيسية';
    if (labels[1]) labels[1].textContent =
        `ملفات: ${totals.files.toLocaleString('ar')} — مجلدات فرعية: ${totals.subfolders.toLocaleString('ar')}`;
}

function updateCategoryCounts() {
    const allButton = document.querySelector('.filter-btn[onclick*="الكل"]');
    if (allButton) allButton.textContent = `الكل (${foldersData.length})`;
    document.querySelectorAll('.filter-btn').forEach(button => {
        const match = button.getAttribute('onclick')?.match(/setCategory\('([^']+)'/);
        if (!match || match[1] === 'الكل') return;
        const count = foldersData.filter(folder => folder.category === match[1]).length;
        button.textContent = `${match[1]} (${count})`;
    });
}

function renderGrid() {
    const grid = $('foldersGrid');
    grid.innerHTML = '';

    foldersData.forEach((folder, index) => {
        const counts = countByType(folder.items);
        const card = document.createElement('article');
        card.className = 'folder-card';
        card.dataset.category = folder.category || '';
        card.dataset.search = [folder.name, ...(folder.items || []).map(item => item.name)]
            .join(' ').toLowerCase();

        card.innerHTML = `
            <div class="card-top">
                <div class="folder-emoji">${escapeHtml(folder.icon || '📁')}</div>
                <span class="category-tag">${escapeHtml(folder.category || 'بدون تصنيف')}</span>
            </div>
            <div class="card-body">
                <h3 class="folder-name">${escapeHtml(folder.name)}</h3>
                <div class="files-preview-count">
                    <span>📄</span> ملفات: <strong>${counts.files}</strong>
                    <span style="margin-inline-start:10px">📁</span> مجلدات فرعية: <strong>${counts.folders}</strong>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-inspect" type="button" data-preview="${index}">
                    👁️ معاينة المحتويات (${counts.total})
                </button>
                <a href="${escapeHtml(folder.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-open">🌐 فتح الدرايف</a>
                <button class="btn btn-copy" type="button" data-copy="${index}">📋 نسخ</button>
            </div>`;
        grid.appendChild(card);
    });

    grid.querySelectorAll('[data-preview]').forEach(button => {
        button.addEventListener('click', () => openExplorer(foldersData[Number(button.dataset.preview)]));
    });
    grid.querySelectorAll('[data-copy]').forEach(button => {
        button.addEventListener('click', () =>
            copyFolderUrl(foldersData[Number(button.dataset.copy)].url, button));
    });
    filterFolders();
}

function makeSection(title, icon, items, folder) {
    const section = document.createElement('section');
    section.className = 'preview-section';
    const heading = document.createElement('h4');
    heading.className = 'preview-section-title';
    heading.textContent = `${icon} ${title} (${items.length})`;
    section.appendChild(heading);

    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'preview-empty';
        empty.textContent = 'لا توجد عناصر من هذا النوع مسجلة.';
        section.appendChild(empty);
        return section;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'file-item';
        const nameWrap = document.createElement('div');
        nameWrap.style.cssText = 'display:flex;align-items:center;gap:12px;min-width:0';
        const itemIcon = document.createElement('span');
        itemIcon.style.fontSize = '20px';
        itemIcon.textContent = item.type === 'folder' ? '📁' : fileIcon(item.ext || item.name);
        const name = document.createElement('span');
        name.style.cssText = 'font-size:14px;font-weight:600;color:#f8fafc;overflow-wrap:anywhere';
        name.textContent = item.name;
        nameWrap.append(itemIcon, name);
        const type = document.createElement('span');
        type.style.cssText = 'font-size:11px;padding:4px 10px;border-radius:6px;background:rgba(56,189,248,.1);color:#38bdf8;font-weight:700;white-space:nowrap';
        type.textContent = item.type === 'folder' ? 'مجلد فرعي' : (item.ext || item.name.split('.').pop() || 'ملف').toUpperCase();
        row.append(nameWrap, type);
        section.appendChild(row);
    });
    return section;
}

function fileIcon(value = '') {
    const ext = String(value).toLowerCase().includes('.') ? String(value).split('.').pop().toLowerCase() : String(value).toLowerCase();
    if (ext === 'dwg' || ext === 'dxf') return '📐';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
    if (ext === 'pdf') return '📑';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return '🖼️';
    if (['doc', 'docx'].includes(ext)) return '📝';
    return '📄';
}

function openExplorer(folder) {
    if (!folder) return;
    activeUrl = folder.url || '';
    $('modalFolderName').textContent = folder.name || 'المجلد';
    $('modalFolderUrl').textContent = activeUrl;
    $('modalDriveLink').href = activeUrl || '#';

    const list = $('modalFilesList');
    list.innerHTML = '';
    const files = (folder.items || []).filter(item => item.type === 'file');
    const subfolders = (folder.items || []).filter(item => item.type === 'folder');
    const summary = document.createElement('div');
    summary.className = 'preview-summary';
    summary.textContent = `الإجمالي: ${files.length} ملف و${subfolders.length} مجلد فرعي`;
    list.appendChild(summary);
    list.append(
        makeSection('الملفات', '📄', files, folder),
        makeSection('المجلدات الفرعية', '📁', subfolders, folder)
    );
    $('explorerModal').classList.add('active');
}

function closeModal() {
    $('explorerModal').classList.remove('active');
}
function copyModalUrl() {
    copyFolderUrl(activeUrl);
    closeModal();
}

async function copyFolderUrl(url, button = null) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand('copy');
            textarea.remove();
            if (!copied) throw new Error('copy failed');
        }
        if (button) {
            const original = button.textContent;
            button.textContent = '✔ تم';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = original;
                button.classList.remove('copied');
            }, 1800);
        }
        showToast();
    } catch (error) {
        alert('تعذر نسخ الرابط تلقائياً. انسخه من شريط العنوان.');
    }
}

function showToast() {
    const toast = $('toastAlert');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function setCategory(category, button) {
    currentCategory = category;
    document.querySelectorAll('.filter-btn').forEach(item => item.classList.remove('active'));
    if (button) button.classList.add('active');
    filterFolders();
}

function filterFolders() {
    const query = ($('searchInput')?.value || '').toLowerCase().trim();
    document.querySelectorAll('.folder-card').forEach(card => {
        const matchesSearch = (card.dataset.search || '').includes(query);
        const matchesCategory = currentCategory === 'الكل' || card.dataset.category === currentCategory;
        card.style.display = matchesSearch && matchesCategory ? 'flex' : 'none';
    });
}

document.addEventListener('DOMContentLoaded', loadAllData);
