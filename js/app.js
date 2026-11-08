let foldersData = [];
let currentCategory = 'الكل';
let activeUrl = '';

// 1. دالة جلب البيانات من ملف JSON وحساب الإحصائيات الفعليه ديناميكياً
async function loadAllData() {
    try {
        const response = await fetch('data/folders-data.json');
        foldersData = await response.json();
        
        // تحديث الإحصائيات الإجمالية في أعلى الصفحة تلقائياً
        updateTotalStats();
        
        // عرض المجلدات
        renderGrid();
    } catch (err) {
        console.error("خطأ في تحميل بيانات المجلدات:", err);
    }
}

// دالة حساب وتحديث الإحصائيات الفعليه في أعلى الواجهة
function updateTotalStats() {
    const totalFoldersCount = foldersData.length;
    let totalItemsCount = 0;

    foldersData.forEach(folder => {
        if (folder.items && Array.isArray(folder.items)) {
            totalItemsCount += folder.items.length;
        }
    });

    // تحديث الأرقام الفعليه في كروت الإحصائيات أعلى الواجهة
    const statCards = document.querySelectorAll('.stat-info h4');
    if (statCards.length >= 2) {
        statCards[0].innerText = `${totalFoldersCount} مجلداً`;
        statCards[1].innerText = `${totalItemsCount} عنصراً فعلياً`;
    }
}

// 2. دالة رسم بطاقات المجلدات وحساب العدد الفعلي الخاص بكل مجلد
function renderGrid() {
    const grid = document.getElementById('foldersGrid');
    grid.innerHTML = '';

    foldersData.forEach(folder => {
        const totalItemsCount = folder.items ? folder.items.length : 0;
        
        // تجميع أسماء العناصر للبحث اللحظي
        const searchKeywords = folder.items ? folder.items.map(i => i.name).join(' ') : '';
        
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.setAttribute('data-category', folder.category);
        card.setAttribute('data-search', (folder.name + ' ' + searchKeywords).toLowerCase());

        card.innerHTML = `
            <div class="card-top">
                <div class="folder-emoji">${folder.icon || '📁'}</div>
                <span class="category-tag">${folder.category}</span>
            </div>
            <div class="card-body">
                <h3 class="folder-name">${folder.name}</h3>
                <div class="files-preview-count">
                    <span>📂</span> العدد الفعلي المتاح: <strong>${totalItemsCount}</strong> عنصر (ملفات ومجلدات فرعية)
                </div>
            </div>
            <div class="card-actions">
                <button class="btn btn-inspect" onclick='openExplorer(${JSON.stringify(folder).replace(/'/g, "&apos;")})'>
                    👁️ استعراض كافة المحتويات بالكامل (${totalItemsCount})
                </button>
                <a href="${folder.url}" target="_blank" class="btn btn-open">🌐 فتح الدرايف</a>
                <button class="btn btn-copy" onclick="copyFolderUrl('${folder.url}', this)">📋 نسخ</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// 3. دالة فتح نافذة المعاينة وعرض جميع العناصر بدون استثناء
function openExplorer(folder) {
    activeUrl = folder.url;
    document.getElementById('modalFolderName').innerText = folder.name;
    document.getElementById('modalFolderUrl').innerText = folder.url;
    document.getElementById('modalDriveLink').href = folder.url;

    const filesListDiv = document.getElementById('modalFilesList');
    filesListDiv.innerHTML = '';

    if (!folder.items || folder.items.length === 0) {
        filesListDiv.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">لا توجد عناصر مسجلة داخل هذا المجلد حالياً.</p>';
        document.getElementById('explorerModal').classList.add('active');
        return;
    }

    // عرض جميع العناصر بلا استثناء
    folder.items.forEach(item => {
        let icon = '📄';
        let badgeText = 'ملف';
        let badgeColor = 'rgba(56, 189, 248, 0.1)';
        let badgeTextColor = '#38bdf8';

        if (item.type === 'folder') {
            icon = '📁';
            badgeText = 'مجلد فرعي';
            badgeColor = 'rgba(245, 158, 11, 0.12)';
            badgeTextColor = '#f59e0b';
        } else {
            let ext = (item.ext || item.name.split('.').pop() || '').toLowerCase();
            if (ext === 'dwg') { icon = '📐'; badgeText = 'DWG'; }
            else if (ext === 'xlsx' || ext === 'xls') { icon = '📊'; badgeText = 'EXCEL'; }
            else if (ext === 'pdf') { icon = '📑'; badgeText = 'PDF'; }
            else { badgeText = ext.toUpperCase() || 'FILE'; }
        }

        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 20px;">${icon}</span>
                <span style="font-size: 14px; font-weight: 600; color: #f8fafc;">${item.name}</span>
            </div>
            <span style="font-size: 11px; padding: 4px 10px; border-radius: 6px; background: ${badgeColor}; color: ${badgeTextColor}; font-weight: 700;">${badgeText}</span>
        `;
        filesListDiv.appendChild(fileItem);
    });

    document.getElementById('explorerModal').classList.add('active');
}

// غلق النافذة المنبثقة
function closeModal() {
    document.getElementById('explorerModal').classList.remove('active');
}

function copyModalUrl() {
    copyFolderUrl(activeUrl);
    closeModal();
}

// نسخ الرابط إلى الحافظة
function copyFolderUrl(url, btn = null) {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand("copy");
        if (btn) {
            const origText = btn.innerText;
            btn.innerText = "✔ تم";
            btn.classList.add("copied");
            setTimeout(() => {
                btn.innerText = origText;
                btn.classList.remove("copied");
            }, 2000);
        }
        showToast();
    } catch (err) {
        alert("تعذر النسخ التلقائي.");
    } finally {
        document.body.removeChild(textarea);
    }
}

// إظهار تنبيه النسخ
function showToast() {
    const toast = document.getElementById('toastAlert');
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// الفلترة حسب الفئة
function setCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterFolders();
}

// البحث اللحظي في أسماء المجلدات والملفات
function filterFolders() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const cards = document.querySelectorAll('.folder-card');

    cards.forEach(card => {
        const searchData = card.getAttribute('data-search');
        const category = card.getAttribute('data-category');

        const matchesSearch = searchData.includes(query);
        const matchesCat = (currentCategory === 'الكل') || (category === currentCategory);

        card.style.display = (matchesSearch && matchesCat) ? "flex" : "none";
    });
}

// تشغيل جلب البيانات عند فتح الصفحة
loadAllData();
