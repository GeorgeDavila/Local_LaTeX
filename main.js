const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const projectsDir = path.join(__dirname, "tex_projects");

function ensureProjectsDir() {
  fs.mkdirSync(projectsDir, { recursive: true });
}

function assertInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid path");
  }
}

function safeProjectName(name) {
  const raw = path.basename(String(name || "untitled").trim());
  const base = raw.replace(/\.(tex|pdf)$/i, "");
  return base.replace(/[<>:"|?*\\/]/g, "_").replace(/^\.+$/, "") || "untitled";
}

function safeTexName(filename, fallback = "document.tex") {
  const safe = path
    .basename(String(filename || fallback))
    .replace(/[<>:"|?*\\/]/g, "_");
  return /\.tex$/i.test(safe) ? safe : `${safe}.tex`;
}

function projectDir(name) {
  const project = safeProjectName(name);
  const dir = path.join(projectsDir, project);
  assertInside(projectsDir, dir);
  return { name: project, dir };
}

function listTexFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".tex"))
    .sort((a, b) => a.localeCompare(b));
}

function pickTexFile(dir, projectName, requested) {
  const texFiles = listTexFiles(dir);
  if (requested) {
    const want = safeTexName(requested);
    const match = texFiles.find((f) => f.toLowerCase() === want.toLowerCase());
    if (match) return match;
  }
  const preferred = `${projectName}.tex`;
  const named = texFiles.find((f) => f.toLowerCase() === preferred.toLowerCase());
  if (named) return named;
  const main = texFiles.find((f) => f.toLowerCase() === "main.tex");
  if (main) return main;
  if (texFiles.length) return texFiles[0];
  return preferred;
}

function migrateLooseTexFiles() {
  ensureProjectsDir();
  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".tex")) continue;
    const { name, dir } = projectDir(entry.name);
    fs.mkdirSync(dir, { recursive: true });
    const destTex = path.join(dir, `${name}.tex`);
    const srcTex = path.join(projectsDir, entry.name);
    if (!fs.existsSync(destTex)) fs.renameSync(srcTex, destTex);
    const srcPdf = path.join(projectsDir, `${name}.pdf`);
    const destPdf = path.join(dir, `${name}.pdf`);
    if (fs.existsSync(srcPdf) && !fs.existsSync(destPdf)) {
      fs.renameSync(srcPdf, destPdf);
    }
  }
}

ipcMain.handle("save-tex", async (_event, projectName, content, texFile) => {
  migrateLooseTexFiles();
  const { name, dir } = projectDir(projectName);
  fs.mkdirSync(dir, { recursive: true });
  const file = requestedTexName(dir, name, texFile);
  const filePath = path.join(dir, file);
  assertInside(dir, filePath);
  fs.writeFileSync(filePath, content ?? "", "utf8");
  return { name, texFile: file, path: filePath };
});

function requestedTexName(dir, projectName, texFile) {
  if (texFile) return safeTexName(texFile, `${projectName}.tex`);
  return pickTexFile(dir, projectName);
}

ipcMain.handle("list-projects", async () => {
  migrateLooseTexFiles();
  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => ({
      name: d.name,
      texFiles: listTexFiles(path.join(projectsDir, d.name)),
    }))
    .filter((p) => p.texFiles.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle("load-tex", async (_event, projectName, texFile) => {
  migrateLooseTexFiles();
  const { name, dir } = projectDir(projectName);
  if (!fs.existsSync(dir)) {
    throw new Error(`Project not found: ${name}`);
  }
  const file = pickTexFile(dir, name, texFile);
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No .tex file in project: ${name}`);
  }
  return { name, texFile: file, content: fs.readFileSync(filePath, "utf8") };
});

ipcMain.handle("new-project", async (_event, projectName, content) => {
  migrateLooseTexFiles();
  const { name, dir } = projectDir(projectName);
  if (fs.existsSync(dir)) {
    throw new Error(`Project already exists: ${name}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const texFile = `${name}.tex`;
  const filePath = path.join(dir, texFile);
  fs.writeFileSync(filePath, content ?? "", "utf8");
  return { name, texFile, path: filePath };
});

function safePdfName(filename) {
  const raw = path.basename(String(filename || "document.pdf"));
  const base = raw.replace(/\.(tex|pdf)$/i, "") || "document";
  const safe = base.replace(/[<>:"|?*\\/]/g, "_");
  return `${safe}.pdf`;
}

async function htmlToPdfBuffer(html) {
  const tmpHtml = path.join(
    app.getPath("temp"),
    `local-latex-${process.pid}-${Date.now()}.html`
  );
  fs.writeFileSync(tmpHtml, html ?? "", "utf8");

  const pdfWin = new BrowserWindow({
    show: false,
    width: 850,
    height: 1100,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await pdfWin.loadFile(tmpHtml);
    await pdfWin.webContents.executeJavaScript(
      "document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 250)))"
    );
    return await pdfWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    pdfWin.destroy();
    fs.unlink(tmpHtml, () => {});
  }
}

ipcMain.handle("export-pdf", async (event, html, suggestedName) => {
  const parent = BrowserWindow.fromWebContents(event.sender);
  migrateLooseTexFiles();
  let defaultDir = projectsDir;
  if (suggestedName) {
    const { dir } = projectDir(suggestedName);
    if (fs.existsSync(dir)) defaultDir = dir;
  }
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: "Export PDF",
    defaultPath: path.join(defaultDir, safePdfName(suggestedName)),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const pdfData = await htmlToPdfBuffer(html);
  fs.writeFileSync(filePath, pdfData);
  return { canceled: false, path: filePath };
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
