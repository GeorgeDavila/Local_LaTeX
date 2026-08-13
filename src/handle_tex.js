const BLANK_TEX = `\\documentclass{article}

\\begin{document}

\\end{document}
`;

function normalizeProjectName(name, fallback = "untitled") {
  let n = String(name || "").trim() || fallback;
  n = n.replace(/\.(tex|pdf)$/i, "").replace(/[<>:"|?*\\/]/g, "_").trim();
  return n || fallback;
}

function openNameDialog({
  title = "Name project",
  description = "Choose a name. It will be created as a folder under tex_projects.",
  confirmLabel = "Confirm",
  defaultName = "untitled",
  fieldLabel = "Project name",
} = {}) {
  const modal = document.getElementById("name-modal");
  const titleEl = document.getElementById("name-modal-title");
  const descEl = document.getElementById("name-modal-desc");
  const labelEl = document.querySelector('label[for="name-filename"]');
  const input = document.getElementById("name-filename");
  const confirmBtn = document.getElementById("name-confirm-btn");

  return new Promise((resolve) => {
    titleEl.textContent = title;
    descEl.innerHTML = description;
    if (labelEl) labelEl.textContent = fieldLabel;
    confirmBtn.textContent = confirmLabel;
    input.value = defaultName || "untitled";
    modal.hidden = false;
    input.focus();
    input.select();

    const cleanup = (result) => {
      modal.hidden = true;
      modal.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      confirmBtn.removeEventListener("click", onConfirm);
      resolve(result);
    };

    const onConfirm = () => cleanup(normalizeProjectName(input.value, defaultName));
    const onCancel = () => cleanup(null);

    const onClick = (e) => {
      if (e.target.closest("[data-close-name]")) onCancel();
    };

    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && document.activeElement === input) {
        e.preventDefault();
        onConfirm();
      }
    };

    modal.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    confirmBtn.addEventListener("click", onConfirm);
  });
}

async function save2tex(input, currentProject, currentTexFile) {
  let name = currentProject;
  if (!name) {
    name = await openNameDialog({
      title: "Save project",
      description:
        "Name this project. It will be created as a folder under <code>tex_projects</code>, with a matching <code>.tex</code> file.",
      confirmLabel: "Save",
      defaultName: "untitled",
    });
    if (!name) return null;
  }

  try {
    return await window.loa.saveTex(name, input, currentTexFile);
  } catch (e) {
    alert(`Save failed: ${e.message}`);
    return null;
  }
}

async function exportPreviewPdf(html, currentProject) {
  if (!html) {
    alert("Preview is not ready yet.");
    return null;
  }

  try {
    const result = await window.loa.exportPdf(html, currentProject || "document");
    if (result?.canceled) return null;
    return result.path;
  } catch (e) {
    alert(`Export failed: ${e.message}`);
    return null;
  }
}

async function createNewProject() {
  const name = await openNameDialog({
    title: "New project",
    description:
      "Name your new blank TeX project. It will be created as a folder under <code>tex_projects</code>.",
    confirmLabel: "Create",
    defaultName: "untitled",
  });
  if (!name) return null;

  try {
    const result = await window.loa.newProject(name, BLANK_TEX);
    return { name: result.name, texFile: result.texFile, content: BLANK_TEX };
  } catch (e) {
    alert(`Could not create project: ${e.message}`);
    return null;
  }
}
