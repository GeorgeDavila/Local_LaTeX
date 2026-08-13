const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("loa", {
  saveTex: (projectName, content, texFile) =>
    ipcRenderer.invoke("save-tex", projectName, content, texFile),
  listProjects: () => ipcRenderer.invoke("list-projects"),
  loadTex: (projectName, texFile) =>
    ipcRenderer.invoke("load-tex", projectName, texFile),
  newProject: (projectName, content) =>
    ipcRenderer.invoke("new-project", projectName, content),
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
