const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("loa", {
  saveTex: (filename, content) =>
    ipcRenderer.invoke("save-tex", filename, content),
  listProjects: () => ipcRenderer.invoke("list-projects"),
  loadTex: (filename) => ipcRenderer.invoke("load-tex", filename),
  newProject: (filename, content) =>
    ipcRenderer.invoke("new-project", filename, content),
  exportPdf: (html, suggestedName) =>
    ipcRenderer.invoke("export-pdf", html, suggestedName),
  setDirty: (dirty) => ipcRenderer.send("set-dirty", dirty),
  onRequestSaveBeforeClose: (handler) => {
    ipcRenderer.on("request-save-before-close", async () => {
      try {
        const ok = await handler();
        ipcRenderer.send("save-before-close-result", !!ok);
      } catch {
        ipcRenderer.send("save-before-close-result", false);
      }
    });
  },
});
