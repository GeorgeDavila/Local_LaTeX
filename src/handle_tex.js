const BLANK_TEX = `\\documentclass{article}

\\begin{document}

\\end{document}
`;

function normalizeTexName(name, fallback = "document.tex") {
  let n = String(name || "").trim() || fallback;
  if (!/\.tex$/i.test(n)) n += ".tex";
  return n;
}

function openNameDialog({
  title = "Name project",
  description = "Choose a name. It will be saved under tex_projects.",
  confirmLabel = "Confirm",
  defaultName = "document.tex",
} = {}) {
  const modal = document.getElementById("name-modal");
  const titleEl = document.getElementById("name-modal-title");
  const descEl = document.getElementById("name-modal-desc");
  const input = document.getElementById("name-filename");
  const confirmBtn = document.getElementById("name-confirm-btn");

  return new Promise((resolve) => {
    titleEl.textContent = title;
    descEl.innerHTML = description;
    confirmBtn.textContent = confirmLabel;
    input.value = defaultName || "document.tex";
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

    const onConfirm = () => cleanup(normalizeTexName(input.value, defaultName));
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

// Save editor text as a .tex file under tex_projects/
async function save2tex(input, currentName) {
  let name = currentName;
  if (!name) {
    name = await openNameDialog({
      title: "Save project",
      description:
        "Choose a name for your current TeX file. It will be saved under <code>tex_projects</code>.",
      confirmLabel: "Save",
      defaultName: "document.tex",
    });
    if (!name) return null;
  }

  try {
    const result = await window.loa.saveTex(name, input);
    return result.name;
  } catch (e) {
    alert(`Save failed: ${e.message}`);
    return null;
  }
}

async function createNewProject() {
  const name = await openNameDialog({
    title: "New project",
    description:
      "Name your new blank TeX project. It will be created under <code>tex_projects</code>.",
    confirmLabel: "Create",
    defaultName: "untitled.tex",
  });
  if (!name) return null;

  try {
    const result = await window.loa.newProject(name, BLANK_TEX);
    return { name: result.name, content: BLANK_TEX };
  } catch (e) {
    alert(`Could not create project: ${e.message}`);
    return null;
  }
}
