const SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const SCRIPT_TOKEN = process.env.GOOGLE_APPS_SCRIPT_TOKEN;

function flattenItems(items, files = [], folders = []) {
  for (const item of items || []) {
    if (item.type === 'folder') {
      folders.push({
        id: item.id,
        name: item.name,
        type: 'folder',
        url: item.url || (item.id ? `https://drive.google.com/drive/folders/${item.id}` : '')
      });
      flattenItems(item.items || [], files, folders);
    } else {
      files.push({
        id: item.id,
        name: item.name,
        type: 'file',
        mimeType: item.mimeType || '',
        ext: item.name && item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : '',
        size: item.size || null,
        modifiedTime: item.modifiedTime || null,
        url: item.url || ''
      });
    }
  }
  return { files, folders };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!SCRIPT_URL || !SCRIPT_TOKEN) {
    return res.status(503).json({
      error: 'لم يتم إعداد رابط Google Apps Script ورمز الوصول في Vercel.'
    });
  }

  try {
    const endpoint = new URL(SCRIPT_URL);
    endpoint.searchParams.set('token', SCRIPT_TOKEN);

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Apps Script returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.folders)) {
      throw new Error(data.error || 'استجابة Google Apps Script غير صحيحة');
    }

    const folders = data.folders.map((root, index) => {
      const flattened = flattenItems(root.items || []);
      return {
        id: String(index + 1),
        rootId: root.id,
        name: root.name,
        url: root.url,
        files: flattened.files,
        folders: flattened.folders,
        fileCount: flattened.files.length,
        subfolderCount: flattened.folders.length
      };
    });

    return res.status(200).json({
      source: 'google-apps-script-live',
      scannedAt: data.updatedAt || new Date().toISOString(),
      totals: {
        rootFolders: folders.length,
        files: folders.reduce((sum, folder) => sum + folder.fileCount, 0),
        subfolders: folders.reduce((sum, folder) => sum + folder.subfolderCount, 0)
      },
      folders
    });
  } catch (error) {
    console.error('Google Apps Script Drive scan failed:', error);
    return res.status(502).json({
      error: 'تعذر قراءة Google Drive عبر Apps Script: ' + error.message
    });
  }
}
