const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  load: () => ipcRenderer.invoke("data:load"),
  save: (data) => ipcRenderer.invoke("data:save", data),
  saveSync: (data) => ipcRenderer.sendSync("data:saveSync", data),
  pickFiles: () => ipcRenderer.invoke("assets:pick"),
  importPaths: (paths) => ipcRenderer.invoke("assets:importPaths", paths),
  saveFile: (name, ext, bytes) => ipcRenderer.invoke("assets:saveBuffer", name, ext, bytes),
  deleteAsset: (fileName) => ipcRenderer.invoke("assets:delete", fileName),
  revealAsset: (fileName) => ipcRenderer.invoke("assets:reveal", fileName),
  openAsset: (fileName) => ipcRenderer.invoke("assets:open", fileName),
  openDataFolder: () => ipcRenderer.invoke("app:openDataFolder"),
  exportBackup: (data) => ipcRenderer.invoke("backup:export", data),
  importBackup: () => ipcRenderer.invoke("backup:import"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onMenu: (cb) => ipcRenderer.on("menu", (_e, action) => cb(action)),
});
