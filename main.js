const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu, nativeTheme } = require("electron");

nativeTheme.themeSource = "dark";
const path = require("node:path");
const fs = require("node:fs");
const fsp = fs.promises;
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

// Images are served to the window through asset://local/<file name>
protocol.registerSchemesAsPrivileged([
  { scheme: "asset", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const dataDir = () => app.getPath("userData");
const dataFile = () => path.join(dataDir(), "gridnote-data.json");
const assetsDir = () => path.join(dataDir(), "assets");
const windowFile = () => path.join(dataDir(), "window.json");

let win = null;

/* ---------- data file ---------- */
async function readData() {
  try {
    return JSON.parse(await fsp.readFile(dataFile(), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    // A broken file is kept aside so nothing is lost, and the app starts empty.
    try { await fsp.rename(dataFile(), dataFile() + ".broken-" + Date.now()); } catch {}
    return null;
  }
}

let backedUp = false;
function writeDataSync(data) {
  fs.mkdirSync(dataDir(), { recursive: true });
  if (!backedUp && fs.existsSync(dataFile())) {
    fs.copyFileSync(dataFile(), dataFile() + ".bak");
    backedUp = true;
  }
  const tmp = dataFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), "utf8");
  fs.renameSync(tmp, dataFile());
}

/* ---------- assets ---------- */
const safeName = (name) => typeof name === "string" && /^[\w.-]+$/.test(name);
const newFileName = (ext) => Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex") + ext;

const cleanExt = (ext) => {
  const e = String(ext || "").toLowerCase().replace(/^\./, "").replace(/[^a-z0-9]/g, "").slice(0, 12);
  return e ? "." + e : "";
};

async function copyIn(src) {
  const st = await fsp.stat(src);
  if (!st.isFile()) return null;
  const ext = cleanExt(path.extname(src));
  await fsp.mkdir(assetsDir(), { recursive: true });
  const fileName = newFileName(ext);
  await fsp.copyFile(src, path.join(assetsDir(), fileName));
  const { size } = await fsp.stat(path.join(assetsDir(), fileName));
  return { fileName, name: path.basename(src, path.extname(src)), size, ext: ext.slice(1) };
}

/* ---------- window ---------- */
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(windowFile(), "utf8")); } catch { return {}; }
}
function saveWindowState() {
  if (!win) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(windowFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {}
}

function createWindow() {
  const st = loadWindowState();
  win = new BrowserWindow({
    width: st.width || 1280,
    height: st.height || 820,
    x: st.x,
    y: st.y,
    minWidth: 820,
    minHeight: 560,
    title: "Gridnote",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#0e1014",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (st.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "src", "index.html"));
  win.on("close", saveWindowState);
  win.on("closed", () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // Dropping a file on the window must never replace the app with that file.
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

const sendMenu = (action) => () => win && win.webContents.send("menu", action);

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "New Project", accelerator: "CmdOrCtrl+Shift+N", click: sendMenu("new-project") },
        { label: "Paste Notes…", accelerator: "CmdOrCtrl+I", click: sendMenu("import-notes") },
        { label: "Add Files…", accelerator: "CmdOrCtrl+O", click: sendMenu("add-files") },
        { type: "separator" },
        { label: "Export Backup…", click: sendMenu("export-backup") },
        { label: "Import Backup…", click: sendMenu("import-backup") },
        { label: "Open Data Folder", click: () => shell.openPath(dataDir()) },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
        { type: "separator" },
        { label: "Find", accelerator: "CmdOrCtrl+F", click: sendMenu("find") },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Checklist", accelerator: "CmdOrCtrl+1", click: sendMenu("tab-list") },
        { label: "Assets", accelerator: "CmdOrCtrl+2", click: sendMenu("tab-assets") },
        { type: "separator" },
        { label: "Sounds On/Off", accelerator: "CmdOrCtrl+M", click: sendMenu("toggle-sound") },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Gridnote",
          click: () => dialog.showMessageBox(win, {
            type: "info",
            title: "About Gridnote",
            message: "Gridnote " + app.getVersion(),
            detail: "Task lists, ideas and assets for game development.\n\nYour data is stored in:\n" + dataDir(),
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- IPC ---------- */
function registerIpc() {
  ipcMain.handle("data:load", () => readData());
  ipcMain.handle("data:save", (_e, data) => { writeDataSync(data); return true; });
  ipcMain.on("data:saveSync", (e, data) => {
    try { writeDataSync(data); e.returnValue = true; } catch { e.returnValue = false; }
  });

  ipcMain.handle("assets:pick", async () => {
    const res = await dialog.showOpenDialog(win, {
      title: "Add files",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "All files", extensions: ["*"] },
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tga", "psd"] },
        { name: "3D models", extensions: ["glb", "gltf", "fbx", "obj", "stl", "blend", "dae", "rbxm", "rbxmx"] },
        { name: "Audio", extensions: ["wav", "mp3", "ogg", "flac", "m4a"] },
        { name: "Video", extensions: ["mp4", "webm", "mov"] },
      ],
    });
    if (res.canceled) return [];
    const out = [];
    for (const p of res.filePaths) { const r = await copyIn(p); if (r) out.push(r); }
    return out;
  });

  ipcMain.handle("assets:importPaths", async (_e, paths) => {
    const out = [];
    for (const p of Array.isArray(paths) ? paths : []) {
      if (typeof p !== "string" || !p) continue;
      try { const r = await copyIn(p); if (r) out.push(r); } catch {}
    }
    return out;
  });

  ipcMain.handle("assets:saveBuffer", async (_e, name, ext, bytes) => {
    const clean = cleanExt(ext) || ".bin";
    await fsp.mkdir(assetsDir(), { recursive: true });
    const fileName = newFileName(clean);
    await fsp.writeFile(path.join(assetsDir(), fileName), Buffer.from(bytes));
    return { fileName, name: String(name || "Pasted file"), size: bytes.byteLength, ext: clean.slice(1) };
  });

  ipcMain.handle("assets:delete", async (_e, fileName) => {
    if (!safeName(fileName)) return false;
    try { await fsp.unlink(path.join(assetsDir(), fileName)); } catch {}
    return true;
  });
  ipcMain.handle("assets:reveal", (_e, fileName) => {
    if (safeName(fileName)) shell.showItemInFolder(path.join(assetsDir(), fileName));
  });
  ipcMain.handle("assets:open", (_e, fileName) => {
    if (safeName(fileName)) return shell.openPath(path.join(assetsDir(), fileName));
  });
  ipcMain.handle("app:openDataFolder", () => shell.openPath(dataDir()));

  ipcMain.handle("backup:export", async (_e, data) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await dialog.showSaveDialog(win, {
      title: "Export backup",
      defaultPath: `gridnote-backup-${stamp}.json`,
      filters: [{ name: "Gridnote backup", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePath) return false;
    await fsp.writeFile(res.filePath, JSON.stringify(data, null, 1), "utf8");
    return true;
  });
  ipcMain.handle("backup:import", async () => {
    const res = await dialog.showOpenDialog(win, {
      title: "Import backup",
      properties: ["openFile"],
      filters: [{ name: "Gridnote backup", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return JSON.parse(await fsp.readFile(res.filePaths[0], "utf8"));
  });
}

/* ---------- app lifecycle ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    protocol.handle("asset", async (req) => {
      const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\/+/, ""));
      if (!safeName(name)) return new Response("Bad request", { status: 400 });
      const res = await net.fetch(pathToFileURL(path.join(assetsDir(), name)).toString());
      // The window loads from file://, so fetch() (text preview, 3D models) needs a CORS header.
      const headers = new Headers(res.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    });
    registerIpc();
    buildMenu();
    createWindow();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
