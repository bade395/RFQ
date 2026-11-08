const SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const SCRIPT_TOKEN = process.env.GOOGLE_APPS_SCRIPT_TOKEN;

function normalizeItem(item) {
  const rawType = String(item.type || item.kind || item["النوع"] || "").toLowerCase();
  const isFolder = rawType === "folder" || rawType === "مجلد";
  const name = item.name || item["الاسم"] || "";
  const id = item.id || item["معرف العنصر"] || "";
  const mimeType = item.mimeType || item["نوع الملف"] || "";
  const size = item.size ?? item["الحجم"] ?? null;
  const modifiedTime = item.modifiedTime || item["آخر تعديل"] || null;
  const url = item.url || item["الرابط"] || (isFolder
    ? (id ? `https://drive.google.com/drive/folders/${id}` : "")
    : (id ? `https://drive.google.com/file/d/${id}/view` : ""));
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return {
    id: String(id),
    name: String(name),
    type: isFolder ? "folder" : "file",
    mimeType: String(mimeType || ""),
    ext,
    size,
    modifiedTime,
    url
  };
}

function buildFoldersFromFlatItems(items) {
  const groups = new Map();
  for (const raw of items || []) {
    const rootName = String(raw.rootFolder || raw.root || raw["المجلد الرئيسي"] || "").trim();
    if (!rootName) continue;
    if (!groups.has(rootName)) groups.set(rootName, []);
    groups.get(rootName).push(normalizeItem(raw));
  }
  return [...groups.entries()].map(([name, entries]) => ({
    id: name,
    rootId: "",
    name,
    url: "",
    files: entries.filter(item => item.type === "file"),
    folders: entries.filter(item => item.type === "folder")
  }));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!SCRIPT_URL || !SCRIPT_TOKEN) {
    return res.status(503).json({ error: "لم يتم إعداد رابط Google Apps Script ورمز الوصول في Vercel." });
  }

  try {
    const endpoint = new URL(SCRIPT_URL);
    endpoint.searchParams.set("token", SCRIPT_TOKEN);
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Apps Script returned HTTP ${response.status}`);

    const data = await response.json();
    let folders;

    if (Array.isArray(data.folders)) {
      folders = data.folders.map((root, index) => {
        const files = (root.items || []).filter(item => item.type !== "folder").map(normalizeItem);
        const subfolders = (root.items || []).filter(item => item.type === "folder").map(normalizeItem);
        return {
          id: String(index + 1),
          rootId: root.id || "",
          name: root.name,
          url: root.url || (root.id ? `https://drive.google.com/drive/folders/${root.id}` : ""),
          files,
          folders: subfolders,
          fileCount: files.length,
          subfolderCount: subfolders.length
        };
      });
    } else if (Array.isArray(data.items)) {
      folders = buildFoldersFromFlatItems(data.items);
    } else {
      throw new Error(data.error || "استجابة Google Apps Script لا تحتوي على folders أو items");
    }

    if (!folders.length) throw new Error("لم يتم العثور على أي مجلدات في الفهرس");
    return res.status(200).json({
      source: "google-sheets-index",
      scannedAt: data.updatedAt || new Date().toISOString(),
      totals: {
        rootFolders: folders.length,
        files: folders.reduce((sum, folder) => sum + folder.files.length, 0),
        subfolders: folders.reduce((sum, folder) => sum + folder.folders.length, 0)
      },
      folders
    });
  } catch (error) {
    console.error("Google Drive index read failed:", error);
    return res.status(502).json({ error: "تعذر قراءة فهرس Google Drive: " + error.message });
  }
}
