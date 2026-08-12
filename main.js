const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const projectsDir = path.join(__dirname, "tex_projects");

function ensureProjectsDir() {
  fs.mkdirSync(projectsDir, { recursive: true });
}

function safeTexName(filename) {
  const safe = path
    .basename(String(filename || "document.tex"))
    .replace(/[<>:"|?*\\/]/g, "_");
  return /\.tex$/i.test(safe) ? safe : `${safe}.tex`;
}

ipcMain.handle("save-tex", async (_event, filename, content) => {
  ensureProjectsDir();
  const name = safeTexName(filename);
  const filePath = path.join(projectsDir, name);
  fs.writeFileSync(filePath, content ?? "", "utf8");
  return { name, path: filePath };
});

ipcMain.handle("list-projects", async () => {
  ensureProjectsDir();
  return fs
    .readdirSync(projectsDir)
    .filter((f) => f.toLowerCase().endsWith(".tex"))
    .sort((a, b) => a.localeCompare(b));
});

ipcMain.handle("load-tex", async (_event, filename) => {
  const name = safeTexName(filename);
  const filePath = path.join(projectsDir, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Project not found: ${name}`);
  }
  return { name, content: fs.readFileSync(filePath, "utf8") };
});

ipcMain.handle("new-project", async (_event, filename, content) => {
  ensureProjectsDir();
  const name = safeTexName(filename);
  const filePath = path.join(projectsDir, name);
  if (fs.existsSync(filePath)) {
    throw new Error(`Project already exists: ${name}`);
  }
  fs.writeFileSync(filePath, content ?? "", "utf8");
  return { name, path: filePath };
});

let isDirty = false;
ipcMain.on("set-dirty", (_event, dirty) => {
  isDirty = !!dirty;
});

const createWindow = () => {
  let allowClose = false;

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("close", async (e) => {
    if (allowClose || !isDirty) return;

    e.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Save", "Don't Save", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      title: "Unsaved Changes",
      message: "You have unsaved changes.",
      detail: "Do you want to save before leaving?",
      noLink: true,
    });

    if (response === 2) return; // Cancel

    if (response === 1) {
      // Don't Save
      isDirty = false;
      allowClose = true;
      win.close();
      return;
    }

    // Save
    const result = await new Promise((resolve) => {
      const onResult = (_event, ok) => {
        ipcMain.removeListener("save-before-close-result", onResult);
        resolve(!!ok);
      };
      ipcMain.on("save-before-close-result", onResult);
      win.webContents.send("request-save-before-close");
    });

    if (result) {
      isDirty = false;
      allowClose = true;
      win.close();
    }
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));
};

app.whenReady().then(() => {
  createWindow();
});
