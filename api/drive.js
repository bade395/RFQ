const ROOT_FOLDER_IDS = ["17LjDnWXaZkUBKThaSLnuqPFKbvc_QyDQ","1ALAbvjN7PHuLINh3z-yPPGhVQPIOTyQ_","1LsGAfd3QEg4tVkFiPKd2nYiCn74VPRth","1gZp0gI8Gto1LEATkE-l9TGpnuUr-QeVA","10BPp0CnufY3NAbsj6f2Mxy-VBqETWtwQ","1Pfo92zZ1kixyDvm1SZ8eHpkahYy9mc-c","1fry9JXlgTneq8BNKp2TEfwsBeYFfNMdc","1dSuY8acrhXLtotaVc_FIJ7GKRRKqXi4U","1AYRqNnEzHyDOAnG_g8D2_XqVYNri2lzr","1QMuMrh2msj3oXyMTirtN-BGyfrMBzZjH","1eMhqJtw_dCdlO3jvX-fM7fDmFInYA9Bk","1iPrxKVy5is0Eo2PY5B-ep2tN50hg9nCD","1i7BCIIzbti9i2IxdiXaUTnDb2J-IjZjC","1ibVLcRsHzH1o6EaCQUa4x9Rmc66n-ruB","1YPVzb0VxYlCAb3Vi6ru5BRHM9enaTd7R","1OCRORuQG_qIq5CUWUVndIFyeYXD_l1Us","1vqxWYwGwCae43Ig8xsgGTyhEHe4YzdmZ","1pXfxNFiQSBmFq7ByPgVHa4uTLZZrLrj7","1vIYu--v5bs1the_skkOSQx1C9dE5H47a","1Jj1wp-1F4THytT8aCASjqrpbjtzZAHWB","1cSuyVow_CToNdTRXirE_9w3sJqpvZw7V","14EO6a_hWXNhdoqItcfAZBRuXGU9gik0t","1kw5MegzKTh6-a9JcTwobu5E8XOKVFUPj","1TcPx8c_iwBkqNHhsv71mKA8ct0w_qqqj"];
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

async function listChildren(folderId, apiKey, pageToken) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: '1000',
    fields: 'nextPageToken,files(id,name,mimeType,webViewLink,size,modifiedTime,fileExtension,shortcutDetails(targetId,targetMimeType))',
    key: apiKey,
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await fetch(`${DRIVE_API}?${params}`);
  const body = await response.json();
  if (!response.ok) {
    const message = body?.error?.message || 'Google Drive API request failed';
    throw new Error(message);
  }
  return body;
}

async function scanFolder(folderId, apiKey, visited = new Set(), depth = 0) {
  if (visited.has(folderId) || depth > 30) return { files: [], folders: [] };
  visited.add(folderId);
  const children = [];
  let token;
  do {
    const page = await listChildren(folderId, apiKey, token);
    children.push(...(page.files || []));
    token = page.nextPageToken;
  } while (token);

  const files = [];
  const folders = [];
  for (const item of children) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      folders.push({ id: item.id, name: item.name, type: 'folder', url: item.webViewLink || `https://drive.google.com/drive/folders/${item.id}` });
      const nested = await scanFolder(item.id, apiKey, visited, depth + 1);
      files.push(...nested.files);
      folders.push(...nested.folders);
    } else {
      files.push({
        id: item.id,
        name: item.name,
        type: 'file',
        mimeType: item.mimeType || '',
        ext: item.fileExtension || (item.name.includes('.') ? item.name.split('.').pop() : ''),
        size: item.size || null,
        modifiedTime: item.modifiedTime || null,
        url: item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`
      });
    }
  }
  return { files, folders };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'لم يتم إعداد مفتاح Google Drive API في Vercel بعد.' });
  try {
    const results = await Promise.all(ROOT_FOLDER_IDS.map(async (id, index) => {
      const root = await scanFolder(id, apiKey);
      return { id: String(index + 1), rootId: id, files: root.files, folders: root.folders,
        fileCount: root.files.length, subfolderCount: root.folders.length };
    }));
    return res.status(200).json({
      source: 'google-drive-live',
      scannedAt: new Date().toISOString(),
      totals: {
        rootFolders: ROOT_FOLDER_IDS.length,
        files: results.reduce((sum, item) => sum + item.fileCount, 0),
        subfolders: results.reduce((sum, item) => sum + item.subfolderCount, 0)
      },
      folders: results
    });
  } catch (error) {
    console.error('Google Drive scan failed:', error);
    return res.status(502).json({ error: 'تعذر قراءة Google Drive: ' + error.message });
  }
}
