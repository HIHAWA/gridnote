(() => {
"use strict";

/* =========================================================
   Gridnote: renderer
   The whole state lives in memory and is written to one JSON
   file by main.js. Text edits update the page in place; changes
   to structure re-render the project view.
   ========================================================= */

const api = window.api || browserApi();

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (typeof v !== "string" && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const size = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const short = (t, n = 48) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const svg = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICON = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  dots: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  chev: svg('<path d="M6 9l6 6 6-6"/>'),
  tag: svg('<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1.2"/>'),
  clip: svg('<path d="M20 11.5l-8.3 8.3a5 5 0 0 1-7-7L13 4.5a3.5 3.5 0 0 1 5 5l-8.3 8.3a2 2 0 0 1-2.8-2.8L14.5 7.4"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  notes: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>'),
  folder: svg('<path d="M3 6h6l2 2h10v11H3z"/>'),
};
const KIND_ICON = {
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  model: svg('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>'),
  audio: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  video: svg('<rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3"/>'),
  code: svg('<path d="M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/>'),
  other: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>'),
};
const KINDS = [
  ["image", "Images", ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "tga", "psd", "dds", "exr", "hdr"], "var(--s1)"],
  ["model", "3D models", ["glb", "gltf", "fbx", "obj", "stl", "blend", "dae", "3ds", "max", "ma", "mb", "usd", "usdz", "ply", "rbxm", "rbxmx", "vox"], "var(--s5)"],
  ["audio", "Audio", ["wav", "mp3", "ogg", "flac", "m4a", "aac", "aiff", "opus"], "var(--s3)"],
  ["video", "Video", ["mp4", "webm", "mov", "mkv", "avi", "m4v"], "var(--s2)"],
  ["code", "Code & text", ["lua", "luau", "txt", "md", "json", "cs", "js", "ts", "py", "gd", "cpp", "c", "h", "hpp", "java", "shader", "glsl", "hlsl", "cfg", "ini", "xml", "yaml", "yml", "csv", "toml"], "var(--s6)"],
];
const kindOf = (ext) => (KINDS.find((k) => k[2].includes(String(ext || "").toLowerCase())) || ["other"])[0];
const kindColor = (kind) => (KINDS.find((k) => k[0] === kind) || [0, 0, 0, "var(--ink-2)"])[3];
const BROWSER_IMG = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"];
const MODEL_PREVIEW = ["glb", "gltf", "fbx", "obj", "stl"];
const PLAYABLE_VIDEO = ["mp4", "webm", "mov", "m4v"];
const PLAYABLE_AUDIO = ["wav", "mp3", "ogg", "flac", "m4a", "aac", "opus"];

const LABELS = [
  { id: "bug", name: "Bug" },
  { id: "important", name: "Important" },
  { id: "check", name: "To check" },
  { id: "idea", name: "Idea" },
  { id: "wip", name: "In progress" },
  { id: "blocked", name: "Blocked" },
];
const labelName = (id) => (LABELS.find((l) => l.id === id) || { name: id }).name;
const COLORS = 6;

/* ---------- state ---------- */
const S = {
  projects: {}, items: {}, files: {},
  pid: null, tab: "list", q: "", filter: "all", kind: "all", collapsed: {}, sound: true,
  ready: false,
};

/* ---------- saving ---------- */
let dirty = false, saveTimer = null;
const snapshot = () => ({
  version: 2, projects: S.projects, items: S.items, files: S.files,
  prefs: { pid: S.pid, tab: S.tab, collapsed: S.collapsed, sound: S.sound },
});
function save() {
  dirty = true;
  setSaved(false);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 350);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  dirty = false;
  try {
    await api.save(snapshot());
    setSaved(true);
  } catch (e) {
    dirty = true;
    toast("Couldn’t save your changes. Check that the disk isn’t full.");
  }
}
window.addEventListener("beforeunload", () => {
  if (dirty) { try { api.saveSync(snapshot()); } catch (e) {} }
});
function setSaved(ok) {
  const el = $("#saved");
  if (!el) return;
  el.classList.toggle("busy", !ok);
  el.textContent = ok ? "All changes saved" : "Saving…";
}

/* ---------- toast with optional Undo ---------- */
let toastTimer = null;
function toast(msg, action) {
  const t = $("#toast");
  t.replaceChildren(h("span", { text: msg }));
  if (action) t.append(h("button", { onclick: () => { t.hidden = true; action.run(); } }, action.label));
  t.hidden = false;
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3000);
}

/* ---------- sound ---------- */
const Sound = {
  ctx: null, combo: 0, comboTimer: null,
  ac() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  tone(freq, at, dur, type = "sine", gain = 0.1) {
    const c = this.ac(), t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  play(name) {
    if (!S.sound) return;
    try {
      switch (name) {
        case "check": {
          // Each tick within a few seconds of the last one climbs a little higher.
          const step = Math.min(this.combo, 7);
          const base = 587.33 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12][step] / 12);
          this.combo++;
          clearTimeout(this.comboTimer);
          this.comboTimer = setTimeout(() => { this.combo = 0; }, 3500);
          this.tone(base, 0, 0.16, "triangle", 0.11);
          this.tone(base * 1.5, 0.055, 0.22, "sine", 0.07);
          break;
        }
        case "uncheck": this.tone(392, 0, 0.12, "triangle", 0.06); this.tone(330, 0.05, 0.14, "sine", 0.04); break;
        case "add": this.tone(880, 0, 0.07, "sine", 0.045); break;
        case "delete": this.tone(260, 0, 0.1, "triangle", 0.05); this.tone(196, 0.05, 0.12, "sine", 0.04); break;
        case "star": this.tone(1318.5, 0, 0.09, "sine", 0.05); this.tone(1760, 0.04, 0.12, "sine", 0.035); break;
        case "section": [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.075, 0.32, "triangle", 0.08)); break;
        case "project": [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => this.tone(f, i * 0.085, 0.5, "triangle", 0.085)); break;
      }
    } catch (e) {}
  },
};

/* ---------- particles ---------- */
const FX = {
  parts: [], raf: 0,
  reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  burst(x, y, count, spread = 1) {
    if (this.reduced) return;
    const colors = ["#52d197", "#f2b54a", "#6ea8ff", "#ff7a8a", "#b48cff", "#4fd3db"];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 4.5) * spread;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2.2 * spread, life: 1, size: 2 + Math.random() * 3.5,
        color: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
    }
    if (!this.raf) this.loop();
  },
  loop() {
    const cv = $("#fx"), ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.parts) {
      p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.018;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    this.raf = this.parts.length ? requestAnimationFrame(() => this.loop()) : 0;
    if (!this.raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  },
};

/* ---------- derived data ---------- */
const projectsSorted = () => Object.values(S.projects).sort((a, b) => (a.order || 0) - (b.order || 0));
const itemsOf = (pid) => Object.values(S.items).filter((i) => i.projectId === pid);
const itemsIn = (pid, sid) => itemsOf(pid).filter((i) => i.section === sid).sort((a, b) => (a.order || 0) - (b.order || 0));
const filesOf = (pid) => Object.values(S.files).filter((f) => f.projectId === pid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const filesForItem = (id) => Object.values(S.files).filter((f) => f.itemId === id && S.items[id]);
const filesForSection = (p, sid) => filesOf(p.id).filter((f) => f.sectionId === sid && !(f.itemId && S.items[f.itemId]));
const fileSrc = (f) => f.dataUrl || "asset://local/" + encodeURIComponent(f.fileName);
const filtering = () => !!S.q.trim() || S.filter !== "all";
function matches(item) {
  const q = S.q.trim().toLowerCase();
  if (q && !item.text.toLowerCase().includes(q)) return false;
  switch (S.filter) {
    case "all": return true;
    case "todo": return !item.done;
    case "done": return !!item.done;
    case "starred": return (item.stars || 0) > 0;
    default: return (item.tags || []).includes(S.filter);
  }
}
const autoTags = (text) => /do sprawdzenia|sprawdzi[cć]|to check/i.test(text) ? ["check"] : [];
function linkLabel(f) {
  const p = S.projects[f.projectId];
  if (f.itemId && S.items[f.itemId]) return "↳ " + short(S.items[f.itemId].text, 34);
  const sec = p && p.sections.find((s) => s.id === f.sectionId);
  return sec ? "↳ " + sec.name : "";
}

/* ---------- mutations ---------- */
function newItem(pid, sid, text, order) {
  const it = { id: uid(), projectId: pid, section: sid, text, done: false, stars: 0, tags: autoTags(text), order: order ?? Date.now(), createdAt: Date.now() };
  S.items[it.id] = it;
  save();
  return it;
}
function insertAfter(item, text) {
  const list = itemsIn(item.projectId, item.section);
  const idx = list.findIndex((i) => i.id === item.id);
  const next = list[idx + 1];
  const order = next ? (item.order + next.order) / 2 : item.order + 1000;
  return newItem(item.projectId, item.section, text, order);
}
function deleteItems(ids, undoLabel) {
  const removed = ids.map((id) => S.items[id]).filter(Boolean);
  for (const it of removed) delete S.items[it.id];
  save();
  if (undoLabel && removed.length) {
    Sound.play("delete");
    toast(undoLabel, { label: "Undo", run: () => { for (const it of removed) S.items[it.id] = it; save(); render(); } });
  }
}
function renumber(pid, sid, list) {
  list.forEach((it, i) => { it.order = (i + 1) * 1000; it.section = sid; it.projectId = pid; });
  save();
}
let enterId = null;

/* ---------- notes parser ---------- */
function parseNotes(text) {
  const sections = [];
  let cur = null, last = null;
  const ensure = () => { if (!cur) { cur = { name: "Notes", items: [] }; sections.push(cur); } };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^(?:-{1,3}|[•*·–—]|\[\s?[xX ]?\])\s*(.*)$/);
    if (bullet) {
      const t = bullet[1].trim();
      if (!t) continue;
      ensure();
      last = { text: t, done: /^\[\s?[xX]\]/.test(line) };
      cur.items.push(last);
      continue;
    }
    if (/^[^:]{1,40}:$/.test(line)) {
      const name = line.slice(0, -1).trim();
      cur = sections.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (!cur) { cur = { name, items: [] }; sections.push(cur); }
      last = null;
      continue;
    }
    if (last) last.text += "\n" + line;
    else { ensure(); last = { text: line, done: false }; cur.items.push(last); }
  }
  for (const s of sections) for (const it of s.items) it.tags = autoTags(it.text);
  return sections;
}
function importParsed(parsed, target, newName) {
  let p;
  if (target === "new" || !S.projects[S.pid]) {
    p = { id: uid(), name: newName || "Imported notes", sections: [], order: Date.now(), createdAt: Date.now() };
    S.projects[p.id] = p;
  } else {
    p = S.projects[S.pid];
  }
  const base = Date.now();
  let n = 0;
  for (const s of parsed) {
    let sec = p.sections.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    if (!sec) { sec = { id: uid(), name: s.name, color: (p.sections.length % COLORS) + 1 }; p.sections.push(sec); }
    for (const it of s.items) {
      const item = newItem(p.id, sec.id, it.text, base + (++n));
      item.done = !!it.done;
      item.tags = it.tags;
    }
  }
  S.pid = p.id; S.tab = "list"; S.q = ""; S.filter = "all";
  save();
  render();
  toast(`Imported ${plural(n, "task")} into ${plural(parsed.length, "section")}.`);
}

/* ---------- render ---------- */
let focusNext = null;
function render() {
  closeMenu();
  const main = $("#main");
  const scroll = main.scrollTop;
  const active = document.activeElement;
  const keep = !focusNext && active && active.id ? { id: active.id, sel: "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null } : null;

  const list = projectsSorted();
  if (!S.projects[S.pid]) S.pid = list[0] ? list[0].id : null;

  renderSidebar(list);
  const p = S.projects[S.pid];
  $("#head").replaceChildren(p ? renderHead(p) : "");
  $("#content").replaceChildren(!S.ready ? "" : p ? (S.tab === "assets" ? renderAssets(p) : renderSections(p)) : renderWelcome());
  main.scrollTop = scroll;
  enterId = null;

  if (!CSS.supports("field-sizing", "content")) document.querySelectorAll("textarea.itext").forEach(autosize);

  const target = focusNext || keep;
  if (target) {
    const el = document.getElementById(target.id);
    if (el) {
      el.focus({ preventScroll: !focusNext });
      if ("setSelectionRange" in el) {
        try {
          if (focusNext && focusNext.pos != null) { const pos = focusNext.pos === "end" ? el.value.length : focusNext.pos; el.setSelectionRange(pos, pos); }
          else if (keep && keep.sel) el.setSelectionRange(keep.sel[0], keep.sel[1]);
        } catch (e) {}
      }
    }
  }
  focusNext = null;
}
function autosize(el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }

function ring(pct) {
  const c = 2 * Math.PI * 6;
  return h("span", { style: "display:grid", html: `<svg class="pring" viewBox="0 0 16 16" aria-hidden="true"><circle class="bg" cx="8" cy="8" r="6"/><circle class="fg" cx="8" cy="8" r="6" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 8 8)"/></svg>` });
}
function renderSidebar(list) {
  $("#sidebar").replaceChildren(
    h("div", { class: "brand" }, h("img", { src: "icon.png", alt: "" }), "Gridnote"),
    h("div", { class: "side-label", text: "Projects" }),
    h("nav", { class: "plist" },
      list.map((p) => {
        const its = itemsOf(p.id);
        const done = its.filter((i) => i.done).length;
        return h("button", { class: "pbtn", id: "side-" + p.id, "aria-current": String(p.id === S.pid), title: p.name,
          onclick: () => { S.pid = p.id; S.q = ""; S.filter = "all"; S.kind = "all"; resetSelection(); save(); render(); $("#main").scrollTop = 0; } },
          h("span", { id: "side-ring-" + p.id, style: "display:grid" }, ring(its.length ? done / its.length : 0)),
          h("span", { class: "pname", id: "side-name-" + p.id, text: p.name || "Untitled" }),
          h("span", { class: "mono", id: "side-open-" + p.id, title: "Tasks left", text: String(its.length - done) }));
      }),
      h("button", { class: "pbtn", onclick: newProjectModal },
        h("span", { style: "width:16px;text-align:center", text: "+" }), h("span", { class: "pname", text: "New project" }))),
    h("div", { class: "side-actions" },
      h("button", { onclick: importModal, html: ICON.notes + "<span>Paste notes…</span>" }),
      h("button", { onclick: () => api.openDataFolder(), html: ICON.folder + "<span>Open data folder</span>" }),
      h("button", { id: "sound-btn", onclick: toggleSound, html: (S.sound ? ICON.sound : ICON.mute) + `<span>Sounds ${S.sound ? "on" : "off"}</span>` })),
    h("div", { class: "saved", id: "saved", text: "All changes saved" }));
}
function toggleSound() {
  S.sound = !S.sound;
  save();
  const b = $("#sound-btn");
  if (b) b.innerHTML = (S.sound ? ICON.sound : ICON.mute) + `<span>Sounds ${S.sound ? "on" : "off"}</span>`;
  if (S.sound) Sound.play("add");
  toast(S.sound ? "Sounds on." : "Sounds off.");
}

function renderWelcome() {
  return h("div", { class: "empty" },
    h("h2", { text: "Welcome to Gridnote" }),
    h("p", { text: "A home for everything your game needs: bugs, ideas, tasks and the files that go with them, like sprites, models, sounds and scripts. It all stays on this computer." }),
    h("p", { text: "Start a new project, or paste the notes you keep in Notepad. Lines that start with “--” become tasks, and a line that ends with a colon, like “BUGS:”, starts a new section." }),
    h("div", { class: "row" },
      h("button", { class: "btn primary", onclick: newProjectModal }, "New project"),
      h("button", { class: "btn", onclick: importModal }, "Paste notes")));
}

function renderHead(p) {
  const items = itemsOf(p.id);
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const files = filesOf(p.id);
  const title = h("input", { class: "ptitle", id: "ptitle", value: p.name, "aria-label": "Project name", spellcheck: "false",
    oninput: (e) => { p.name = e.target.value; const s = document.getElementById("side-name-" + p.id); if (s) s.textContent = p.name || "Untitled"; save(); },
    onkeydown: (e) => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); } });

  let chips;
  if (S.tab !== "assets") {
    const count = (fn) => items.filter(fn).length;
    const chip = (key, label, n, dot) => h("button", { class: "chip", "aria-pressed": String(S.filter === key), onclick: () => { S.filter = S.filter === key && key !== "all" ? "all" : key; render(); } },
      dot ? h("span", { class: "dot", style: `background:${dot}` }) : null, label, n != null ? h("span", { class: "n", text: String(n) }) : null);
    chips = h("div", { class: "chips", role: "group", "aria-label": "Show" },
      chip("all", "All"), chip("todo", "To do", count((i) => !i.done)), chip("done", "Done", count((i) => i.done)),
      h("span", { class: "sep" }),
      chip("starred", "★ Priority", count((i) => i.stars > 0)),
      LABELS.map((l) => { const n = count((i) => (i.tags || []).includes(l.id)); return n || S.filter === l.id ? chip(l.id, l.name, n, `var(--l-${l.id})`) : null; }));
  } else {
    const n = (k) => files.filter((f) => (f.kind || kindOf(f.ext)) === k).length;
    chips = h("div", { class: "chips", role: "group", "aria-label": "File type" },
      h("button", { class: "chip", "aria-pressed": String(S.kind === "all"), onclick: () => { S.kind = "all"; render(); } }, "All", h("span", { class: "n", text: String(files.length) })),
      [...KINDS.map((k) => [k[0], k[1], k[3]]), ["other", "Other", "var(--ink-2)"]].map(([k, label, c]) => n(k) || S.kind === k
        ? h("button", { class: "chip", "aria-pressed": String(S.kind === k), onclick: () => { S.kind = S.kind === k ? "all" : k; render(); } },
            h("span", { class: "dot", style: `background:${c}` }), label, h("span", { class: "n", text: String(n(k)) }))
        : null));
  }

  return h("div", { class: "phead" },
    h("div", { class: "title-row" }, title,
      h("button", { class: "icon", html: ICON.dots, title: "Project options", "aria-label": "Project options", onclick: (e) => projectMenu(e.currentTarget, p) })),
    h("div", { class: "progress" },
      h("div", { class: "bar", role: "progressbar", "aria-label": "Project progress", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100" },
        h("span", { id: "pbar", style: `width:${pct}%` })),
      h("span", { class: "mono pstat", id: "pstat", text: `${done} / ${items.length} done · ${pct}%` })),
    h("div", { class: "toolbar" },
      h("div", { class: "tabs", role: "tablist" },
        h("button", { class: "tab", role: "tab", id: "tab-list", "aria-selected": String(S.tab !== "assets"), onclick: () => setTab("list") }, `Tasks · ${items.length}`),
        h("button", { class: "tab", role: "tab", id: "tab-assets", "aria-selected": String(S.tab === "assets"), onclick: () => setTab("assets") }, `Assets · ${files.length}`)),
      h("label", { class: "search", html: ICON.search },
        h("input", { id: "search", type: "search", value: S.q, placeholder: S.tab === "assets" ? "Search files" : "Search tasks", "aria-label": "Search",
          oninput: (e) => { S.q = e.target.value; render(); },
          onkeydown: (e) => { if (e.key === "Escape") { S.q = ""; render(); e.target.blur(); } } })),
      h("span", { class: "spacer" }),
      S.tab === "assets" && files.length && !SEL.on
        ? h("button", { class: "btn", title: "Select several files (Ctrl+A selects all)", onclick: () => { SEL.on = true; render(); } }, "Select")
        : null,
      S.tab === "assets"
        ? h("button", { class: "btn primary", onclick: () => addFiles() }, "Add files")
        : h("button", { class: "btn", onclick: importModal }, "Paste notes")),
    chips);
}
function setTab(tab) { S.tab = tab; S.q = ""; resetSelection(); save(); render(); }

function refreshStats() {
  const p = S.projects[S.pid];
  if (!p) return;
  const items = itemsOf(p.id);
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const bar = $("#pbar"), stat = $("#pstat");
  if (bar) bar.style.width = pct + "%";
  if (stat) stat.textContent = `${done} / ${items.length} done · ${pct}%`;
  const open = document.getElementById("side-open-" + p.id);
  if (open) open.textContent = String(items.length - done);
  const r = document.getElementById("side-ring-" + p.id);
  if (r) r.replaceChildren(ring(items.length ? done / items.length : 0));
  for (const sec of p.sections) {
    const c = document.getElementById("count-" + sec.id);
    if (!c) continue;
    const list = items.filter((i) => i.section === sec.id);
    const d = list.filter((i) => i.done).length;
    c.textContent = `${d}/${list.length}`;
    const card = c.closest(".sec");
    if (card) card.classList.toggle("complete", list.length > 0 && d === list.length);
  }
}

/* ---------- tasks view ---------- */
function renderSections(p) {
  const filt = filtering();
  const cards = p.sections.map((sec) => {
    const all = itemsIn(p.id, sec.id);
    const visible = all.filter(matches);
    if (filt && !visible.length) return null;
    const collapsed = !!S.collapsed[sec.id] && !filt;
    const doneN = all.filter((i) => i.done).length;
    const ul = h("ul", { class: "items", dataset: { sid: sec.id } }, collapsed ? [] : visible.map((it) => renderItem(it, p)));
    if (!filt) wireListDrop(ul, p, sec);
    const secFiles = filesForSection(p, sec.id);
    const card = h("article", { class: "sec" + (collapsed ? " collapsed" : "") + (all.length && doneN === all.length ? " complete" : ""), style: `--sc:var(--s${sec.color || 1})`, dataset: { sid: sec.id } });
    card.append(
      h("div", { class: "sec-head" },
        filt ? h("span", { style: "width:18px" }) : h("span", { class: "sec-grip", title: "Drag to move the section", text: "⠿",
          onmousedown: () => { card.draggable = true; } }),
        h("button", { class: "icon chev", html: ICON.chev, title: collapsed ? "Expand" : "Collapse", "aria-label": collapsed ? "Expand section" : "Collapse section", "aria-expanded": String(!collapsed),
          onclick: () => { S.collapsed[sec.id] = !S.collapsed[sec.id]; save(); render(); } }),
        h("input", { class: "sec-name", id: "secname-" + sec.id, value: sec.name, "aria-label": "Section name", spellcheck: "false",
          oninput: (e) => { sec.name = e.target.value; save(); },
          onkeydown: (e) => {
            if (e.key === "Escape") e.target.blur();
            if (e.key === "Enter") { e.preventDefault(); const a = document.getElementById("add-" + sec.id); (a || e.target).focus(); }
          } }),
        h("span", { class: "mono count", id: "count-" + sec.id, text: `${doneN}/${all.length}` }),
        h("button", { class: "icon", html: ICON.dots, title: "Section options", "aria-label": "Section options", onclick: (e) => sectionMenu(e.currentTarget, p, sec) })),
      collapsed || filt ? "" : renderAdd(p, sec),
      collapsed ? "" : ul,
      !collapsed && !all.length ? h("div", { class: "sec-note", text: "Nothing here yet." }) : "",
      !collapsed && filt && visible.length < all.length ? h("div", { class: "sec-note", text: `${all.length - visible.length} hidden by the filter` }) : "",
      !collapsed && secFiles.length ? h("div", { class: "sec-files" }, secFiles.map(fileChip)) : "");
    card.addEventListener("mouseup", () => { if (!secDrag) card.draggable = false; });
    if (!filt) wireSectionDrag(card, p, sec);
    return card;
  }).filter(Boolean);

  if (filt && !cards.length) {
    return h("div", { class: "empty" }, h("h2", { text: "Nothing found" }),
      h("p", { text: "Change the search or the filter to see the other tasks." }),
      h("button", { class: "btn", onclick: () => { S.q = ""; S.filter = "all"; render(); } }, "Show everything"));
  }
  if (!filt) cards.push(renderNewSection(p));
  return h("div", { style: "display:grid;gap:16px" },
    h("div", { class: "sections", id: "sections" }, cards),
    h("div", { class: "hint" },
      h("span", {}, h("kbd", { text: "Enter" }), " new task below"),
      h("span", {}, h("kbd", { text: "Shift+Enter" }), " new line"),
      h("span", {}, h("kbd", { text: "Ctrl+Enter" }), " done"),
      h("span", {}, h("kbd", { text: "Backspace" }), " on an empty task deletes it"),
      h("span", { text: "Drag ⠿ to move tasks and sections · drop files on a task to attach them" })));
}

function fileChip(f) {
  const kind = f.kind || kindOf(f.ext);
  const thumb = kind === "image" && BROWSER_IMG.includes(f.ext)
    ? h("img", { src: fileSrc(f), alt: "", draggable: "false" })
    : h("span", { class: "kind kindbox", style: `--kc:${kindColor(kind)}`, html: KIND_ICON[kind] });
  return h("button", { class: "fchip", title: f.name + (f.ext ? "." + f.ext : ""), onclick: () => openFile(f) }, thumb, h("span", { text: f.name }));
}

function renderItem(it, p) {
  const row = h("li", { class: "item" + (it.done ? " done" : "") + (enterId === it.id ? " enter" : ""), id: "row-" + it.id, dataset: { id: it.id } });
  const ta = h("textarea", { class: "itext", id: "it-" + it.id, rows: 1, spellcheck: "false", "aria-label": "Task" });
  ta.value = it.text;

  ta.addEventListener("input", () => {
    it.text = ta.value;
    if (!CSS.supports("field-sizing", "content")) autosize(ta);
    save();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleDone(it, row, tick); return; }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (filtering()) { ta.blur(); return; }
      const a = ta.selectionStart, b = ta.selectionEnd;
      const after = ta.value.slice(b);
      it.text = ta.value.slice(0, a).replace(/\s+$/, "");
      if (!it.text && !after) { ta.blur(); return; }
      const n = insertAfter(it, after.replace(/^\s+/, ""));
      enterId = n.id;
      focusNext = { id: "it-" + n.id, pos: 0 };
      Sound.play("add");
      render();
      return;
    }
    if (e.key === "Backspace" && ta.value === "") {
      e.preventDefault();
      const list = itemsIn(it.projectId, it.section).filter(matches);
      const i = list.findIndex((x) => x.id === it.id);
      const prev = list[i - 1] || list[i + 1];
      deleteItems([it.id]);
      focusNext = prev ? { id: "it-" + prev.id, pos: "end" } : { id: "add-" + it.section };
      render();
      return;
    }
    if (e.key === "ArrowUp" && ta.selectionStart === 0 && ta.selectionEnd === 0) {
      const prev = row.previousElementSibling;
      const t = prev ? prev.querySelector(".itext") : document.getElementById("add-" + it.section);
      if (t) { e.preventDefault(); t.focus(); if (t.setSelectionRange) t.setSelectionRange(t.value.length, t.value.length); }
      return;
    }
    if (e.key === "ArrowDown" && ta.selectionStart === ta.value.length) {
      const next = row.nextElementSibling;
      if (next) { e.preventDefault(); const t = next.querySelector(".itext"); t.focus(); t.setSelectionRange(0, 0); }
      return;
    }
    if (e.key === "Escape") ta.blur();
  });
  ta.addEventListener("blur", () => {
    if (!S.items[it.id] || !row.isConnected) return;
    if (!ta.value.trim()) { deleteItems([it.id]); row.remove(); refreshStats(); return; }
    if (!(it.tags || []).length) {
      const t = autoTags(it.text);
      if (t.length) { it.tags = t; updateMeta(it); save(); }
    }
  });

  const tick = h("button", { class: "tick", html: ICON.check, title: "Done (Ctrl+Enter)", "aria-pressed": String(!!it.done), "aria-label": "Done",
    onclick: () => toggleDone(it, row, tick) });
  const handle = h("span", { class: "handle", title: "Drag to move", "aria-hidden": "true", text: "⠿" });
  handle.addEventListener("mousedown", () => { if (!filtering()) row.draggable = true; });
  row.addEventListener("mouseup", () => { if (!dragId) row.draggable = false; });
  row.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    dragId = it.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-gridnote-item", it.id);
    requestAnimationFrame(() => row.classList.add("dragging"));
  });
  row.addEventListener("dragend", (e) => { e.stopPropagation(); row.draggable = false; row.classList.remove("dragging"); dragId = null; clearDropMarks(); });

  const meta = h("div", { class: "meta", id: "meta-" + it.id });
  fillMeta(meta, it);
  row.append(handle, tick,
    h("div", { class: "body" }, ta, meta),
    h("div", { class: "acts" },
      h("button", { class: "icon", html: ICON.tag, title: "Priority, labels and files", "aria-label": "Priority, labels and files", onclick: (e) => itemPanel(e.currentTarget, it, p) }),
      h("button", { class: "icon del", html: ICON.trash, title: "Delete task", "aria-label": "Delete task",
        onclick: () => { deleteItems([it.id], "Task deleted."); render(); } })));
  return row;
}
function fillMeta(meta, it) {
  const p = S.projects[it.projectId];
  const files = filesForItem(it.id);
  meta.replaceChildren(
    ...[it.stars ? h("button", { class: "stars", title: "Priority", text: "★".repeat(it.stars), onclick: (e) => itemPanel(e.currentTarget, it, p) }) : null,
      ...(it.tags || []).map((t) => h("button", { class: "tag", style: `--c:var(--l-${t})`, text: labelName(t), onclick: (e) => itemPanel(e.currentTarget, it, p) })),
      files.length ? h("button", { class: "clip", html: ICON.clip + `<span>${files.length}</span>`, title: files.map((f) => f.name).join(", "),
        onclick: (e) => filesMenu(e.currentTarget, files) }) : null].filter(Boolean));
}
function updateMeta(it) {
  const meta = document.getElementById("meta-" + it.id);
  if (meta) fillMeta(meta, it);
}
function toggleDone(it, row, tick) {
  it.done = !it.done;
  it.doneAt = it.done ? Date.now() : null;
  row.classList.toggle("done", it.done);
  tick.setAttribute("aria-pressed", String(it.done));
  save();
  if (!it.done) { Sound.play("uncheck"); refreshStats(); return; }

  tick.classList.remove("pop"); void tick.offsetWidth; tick.classList.add("pop");
  row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
  const r = tick.getBoundingClientRect();
  FX.burst(r.left + r.width / 2, r.top + r.height / 2, 14, 0.8);
  refreshStats();

  const p = S.projects[it.projectId];
  const sec = itemsIn(p.id, it.section);
  const all = itemsOf(p.id);
  if (all.length > 1 && all.every((i) => i.done)) {
    Sound.play("project");
    const b = $("#pbar").getBoundingClientRect();
    for (let i = 0; i < 5; i++) setTimeout(() => FX.burst(b.left + Math.random() * b.width, b.top, 40, 1.4), i * 140);
    toast(`“${p.name}” is 100% done. Nice work!`);
  } else if (sec.length > 1 && sec.every((i) => i.done)) {
    Sound.play("section");
    const card = row.closest(".sec");
    if (card) {
      card.classList.remove("celebrate"); void card.offsetWidth; card.classList.add("celebrate");
      const c = card.getBoundingClientRect();
      FX.burst(c.left + c.width / 2, c.top + 16, 46, 1.25);
    }
  } else {
    Sound.play("check");
  }
}

function renderAdd(p, sec) {
  const id = "add-" + sec.id;
  const input = h("input", { id, type: "text", placeholder: "Add a task…", autocomplete: "off", spellcheck: "false", "aria-label": "Add a task to " + sec.name,
    onkeydown: (e) => {
      if (e.key === "ArrowDown") {
        const first = e.target.closest(".sec").querySelector(".item .itext");
        if (first) { e.preventDefault(); first.focus(); first.setSelectionRange(0, 0); }
      }
      if (e.key === "Escape") e.target.blur();
    } });
  return h("form", { class: "add", onsubmit: (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const list = itemsIn(p.id, sec.id);
    const it = newItem(p.id, sec.id, text, list.length ? list[0].order - 1000 : 1000);
    enterId = it.id;
    input.value = "";
    focusNext = { id };
    Sound.play("add");
    render();
  } }, h("span", { "aria-hidden": "true", text: "+" }), input);
}

function renderNewSection(p) {
  const input = h("input", { id: "new-sec", type: "text", placeholder: "e.g. Bugs, UI, Levels, Audio", autocomplete: "off", spellcheck: "false" });
  return h("form", { class: "new-sec", onsubmit: (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const sec = { id: uid(), name, color: (p.sections.length % COLORS) + 1 };
    p.sections.push(sec);
    save();
    Sound.play("add");
    focusNext = { id: "add-" + sec.id };
    render();
  } }, h("label", { for: "new-sec", text: "+ New section" }), input);
}

/* ---------- drag & drop: tasks ---------- */
let dragId = null;
function clearDropMarks() {
  document.querySelectorAll(".drop-before, .drop-after, .drop-end, .drop-into, .drop-file").forEach((el) => el.classList.remove("drop-before", "drop-after", "drop-end", "drop-into", "drop-file"));
}
function dropTarget(ul, e) {
  const rows = [...ul.querySelectorAll(".item:not(.dragging)")];
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    if (e.clientY < b.top + b.height / 2) return { row: r, before: true };
  }
  return { row: rows[rows.length - 1] || null, before: false };
}
function moveItemTo(p, sec, moving, index) {
  const list = itemsIn(p.id, sec.id).filter((i) => i.id !== moving.id);
  list.splice(index == null ? 0 : Math.min(index, list.length), 0, moving);
  renumber(p.id, sec.id, list);
}
function wireListDrop(ul, p, sec) {
  ul.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    clearDropMarks();
    const t = dropTarget(ul, e);
    if (t.row) t.row.classList.add(t.before ? "drop-before" : "drop-after");
    else ul.classList.add("drop-end");
  });
  ul.addEventListener("drop", (e) => {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const moving = S.items[dragId];
    const t = dropTarget(ul, e);
    clearDropMarks();
    if (!moving) return;
    const list = itemsIn(p.id, sec.id).filter((i) => i.id !== moving.id);
    let idx = list.length;
    if (t.row) {
      const at = list.findIndex((i) => i.id === t.row.dataset.id);
      if (at >= 0) idx = t.before ? at : at + 1;
    }
    moveItemTo(p, sec, moving, idx);
    dragId = null;
    render();
  });
}

/* ---------- drag & drop: sections ---------- */
let secDrag = null;
function wireSectionDrag(card, p, sec) {
  card.addEventListener("dragstart", (e) => {
    if (dragId) return;
    secDrag = sec.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-gridnote-section", sec.id);
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  card.addEventListener("dragend", () => { card.draggable = false; card.classList.remove("dragging"); secDrag = null; clearDropMarks(); });
  card.addEventListener("dragover", (e) => {
    if (secDrag && secDrag !== sec.id) {
      e.preventDefault();
      clearDropMarks();
      const b = card.getBoundingClientRect();
      card.classList.add(e.clientX < b.left + b.width / 2 ? "drop-before" : "drop-after");
    } else if (dragId) {
      // A task dropped on a card outside its list (header, collapsed card) goes to the top of that section.
      e.preventDefault();
      clearDropMarks();
      card.classList.add("drop-into");
    }
  });
  card.addEventListener("drop", (e) => {
    if (secDrag && secDrag !== sec.id) {
      e.preventDefault();
      const b = card.getBoundingClientRect();
      const before = e.clientX < b.left + b.width / 2;
      const moving = p.sections.find((s) => s.id === secDrag);
      p.sections.splice(p.sections.indexOf(moving), 1);
      p.sections.splice(p.sections.indexOf(sec) + (before ? 0 : 1), 0, moving);
      secDrag = null;
      save();
      render();
    } else if (dragId && S.items[dragId]) {
      e.preventDefault();
      moveItemTo(p, sec, S.items[dragId], 0);
      dragId = null;
      render();
    }
    clearDropMarks();
  });
}

/* ---------- popovers ---------- */
let menuEl = null, menuOnClose = null;
function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener("pointerdown", onOutside, true);
  const cb = menuOnClose;
  menuOnClose = null;
  if (cb) cb();
}
function onOutside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function place(anchor) {
  const r = anchor.getBoundingClientRect();
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  const left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
  let top = r.bottom + 4;
  if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
  menuEl.style.left = left + "px";
  menuEl.style.top = top + "px";
}
function menuNodes(entries) {
  return entries.filter(Boolean).map((e) =>
    e.sep ? h("div", { class: "menu-sep" }) :
    e.label ? h("div", { class: "menu-label", text: e.label }) :
    e.node ? e.node :
    h("button", { class: "menu-item" + (e.danger ? " danger" : ""), role: "menuitem", onclick: () => { if (!e.keep) closeMenu(); e.run(); } },
      e.check !== undefined ? h("span", { class: "check", text: e.check ? "✓" : "" }) : null,
      e.dot ? h("span", { class: "dot", style: `background:${e.dot}` }) : null,
      e.icon ? h("span", { html: e.icon, style: "display:grid;width:14px;color:var(--ink-3)" }) : null,
      h("span", { class: "grow", text: e.text })));
}
function openMenu(anchor, entries, onClose) {
  closeMenu();
  menuEl = h("div", { class: "menu", role: "menu" }, menuNodes(entries));
  document.body.append(menuEl);
  place(anchor);
  menuOnClose = onClose || null;
  const first = menuEl.querySelector(".menu-item, .star, .swatch");
  if (first) first.focus({ preventScroll: true });
  setTimeout(() => document.addEventListener("pointerdown", onOutside, true));
  return menuEl;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
window.addEventListener("resize", () => closeMenu());
$("#main").addEventListener("scroll", () => closeMenu(), { passive: true });

function itemPanel(anchor, it, p) {
  let changed = false;
  const build = () => {
    const stars = h("div", { class: "star-row" },
      [1, 2, 3].map((n) => h("button", { class: "star" + ((it.stars || 0) >= n ? " on" : ""), title: `Priority ${n}`, "aria-label": `Priority ${n} of 3`, text: "★",
        onclick: () => { it.stars = it.stars === n ? 0 : n; changed = true; save(); updateMeta(it); if (it.stars) Sound.play("star"); rebuild(); } })),
      it.stars ? h("button", { class: "clear", onclick: () => { it.stars = 0; changed = true; save(); updateMeta(it); rebuild(); } }, "Clear") : null);
    const files = filesForItem(it.id);
    const others = p.sections.filter((s) => s.id !== it.section);
    return [
      { label: "Priority" }, { node: stars },
      { label: "Labels" },
      ...LABELS.map((l) => ({ text: l.name, dot: `var(--l-${l.id})`, check: (it.tags || []).includes(l.id), keep: true,
        run: () => {
          const t = new Set(it.tags || []);
          if (t.has(l.id)) t.delete(l.id); else t.add(l.id);
          it.tags = LABELS.map((x) => x.id).filter((x) => t.has(x));
          changed = true; save(); updateMeta(it); rebuild();
        } })),
      { sep: true },
      { label: "Files" },
      ...files.map((f) => ({ text: f.name + (f.ext ? "." + f.ext : ""), icon: KIND_ICON[f.kind || kindOf(f.ext)], run: () => openFile(f) })),
      { text: "Attach files…", icon: ICON.clip, run: () => addFiles({ sectionId: it.section, itemId: it.id }) },
      others.length ? { sep: true } : null,
      others.length ? { label: "Move to" } : null,
      ...others.map((s) => ({ text: s.name, dot: `var(--s${s.color || 1})`, run: () => { moveItemTo(p, s, it, 0); render(); } })),
      { sep: true },
      { text: "Delete task", danger: true, run: () => { deleteItems([it.id], "Task deleted."); render(); } },
    ];
  };
  const rebuild = () => {
    if (!menuEl) return;
    const focusedIdx = [...menuEl.querySelectorAll("button")].indexOf(document.activeElement);
    menuEl.replaceChildren(...menuNodes(build()));
    place(anchor.isConnected ? anchor : document.getElementById("row-" + it.id) || anchor);
    const btns = menuEl.querySelectorAll("button");
    if (focusedIdx >= 0 && btns[focusedIdx]) btns[focusedIdx].focus({ preventScroll: true });
  };
  openMenu(anchor, build(), () => { if (changed && filtering()) render(); });
}
function filesMenu(anchor, files) {
  openMenu(anchor, files.map((f) => ({ text: f.name + (f.ext ? "." + f.ext : ""), icon: KIND_ICON[f.kind || kindOf(f.ext)], run: () => openFile(f) })));
}
function sectionMenu(anchor, p, sec) {
  const all = itemsIn(p.id, sec.id);
  const done = all.filter((i) => i.done);
  const swatches = h("div", { class: "swatches", role: "group", "aria-label": "Color" },
    Array.from({ length: COLORS }, (_, i) => h("button", { class: "swatch", style: `background:var(--s${i + 1})`, "aria-label": "Color " + (i + 1), "aria-pressed": String((sec.color || 1) === i + 1),
      onclick: () => { sec.color = i + 1; save(); render(); } })));
  openMenu(anchor, [
    { label: "Color" }, { node: swatches },
    { sep: true },
    { text: "Sort by priority", run: () => {
      const sorted = [...all].sort((a, b) => (!!a.done - !!b.done) || (b.stars || 0) - (a.stars || 0) || a.order - b.order);
      renumber(p.id, sec.id, sorted); render();
    } },
    { text: "Attach files…", icon: ICON.clip, run: () => addFiles({ sectionId: sec.id }) },
    { text: `Delete done tasks (${done.length})`, run: () => {
      if (!done.length) return toast("There are no done tasks in this section.");
      deleteItems(done.map((i) => i.id), `Deleted ${plural(done.length, "done task")}.`);
      render();
    } },
    { sep: true },
    { text: "Delete section", danger: true, run: async () => {
      if (all.length && !(await confirmBox(`Delete “${sec.name}”?`, `Its ${plural(all.length, "task")} will be deleted too. Attached files stay in Assets.`, "Delete section"))) return;
      const at = p.sections.indexOf(sec);
      p.sections.splice(at, 1);
      for (const it of all) delete S.items[it.id];
      save(); render();
      Sound.play("delete");
      toast(`Section “${sec.name}” deleted.`, { label: "Undo", run: () => {
        p.sections.splice(Math.min(at, p.sections.length), 0, sec);
        for (const it of all) S.items[it.id] = it;
        save(); render();
      } });
    } },
  ]);
}
function projectMenu(anchor, p) {
  const list = projectsSorted();
  const idx = list.indexOf(p);
  const swap = (j) => { const o = list[j].order; list[j].order = p.order; p.order = o; save(); render(); };
  openMenu(anchor, [
    { text: "Paste notes into this project", run: importModal },
    { text: "Add files", run: () => addFiles() },
    { sep: true },
    idx > 0 ? { text: "Move up in the list", run: () => swap(idx - 1) } : null,
    idx < list.length - 1 ? { text: "Move down in the list", run: () => swap(idx + 1) } : null,
    idx > 0 || idx < list.length - 1 ? { sep: true } : null,
    { text: "Delete project", danger: true, run: async () => {
      const its = itemsOf(p.id), fs = filesOf(p.id);
      const ok = await confirmBox(`Delete “${p.name}”?`, `This deletes ${plural(its.length, "task")} and ${plural(fs.length, "file")}. It can’t be undone.`, "Delete project");
      if (!ok) return;
      for (const it of its) delete S.items[it.id];
      for (const f of fs) { await api.deleteAsset(f.fileName); delete S.files[f.id]; }
      delete S.projects[p.id];
      S.pid = null;
      save(); render();
      toast("Project deleted.");
    } },
  ]);
}

/* ---------- modals ---------- */
let modalClose = null;
function openModal(content, wide, onClose) {
  if (modalClose) modalClose();
  const prevFocus = document.activeElement;
  const box = h("div", { class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true" }, content);
  const bg = h("div", { class: "modal-bg", onmousedown: (e) => { if (e.target === bg) close(); } }, box);
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  function close() {
    if (!bg.isConnected) return;
    bg.remove();
    document.removeEventListener("keydown", onKey, true);
    modalClose = null;
    if (onClose) onClose();
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  }
  document.addEventListener("keydown", onKey, true);
  document.body.append(bg);
  const f = box.querySelector("textarea, input[type=text], .btn.primary");
  if (f) f.focus();
  modalClose = close;
  return close;
}
function confirmBox(title, text, okLabel) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (answered) return; answered = true; close(); resolve(v); };
    const okBtn = h("button", { class: "btn danger solid", onclick: () => done(true) }, okLabel);
    const close = openModal([
      h("h2", { text: title }),
      h("p", { class: "muted", text }),
      h("div", { class: "row", style: "justify-content:flex-end" },
        h("button", { class: "btn", onclick: () => done(false) }, "Cancel"), okBtn),
    ], false, () => done(false));
    okBtn.focus();
  });
}
function newProjectModal() {
  const input = h("input", { type: "text", id: "np-name", placeholder: "e.g. Dungeon Miner", spellcheck: "false" });
  const close = openModal(h("form", { style: "display:grid;gap:14px", onsubmit: (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) { input.focus(); return; }
    close();
    const p = { id: uid(), name, order: Date.now(), createdAt: Date.now(),
      sections: ["To do", "Bugs", "Ideas"].map((n, i) => ({ id: uid(), name: n, color: i + 1 })) };
    S.projects[p.id] = p;
    S.pid = p.id; S.tab = "list"; S.q = ""; S.filter = "all";
    save();
    Sound.play("add");
    focusNext = { id: "add-" + p.sections[0].id };
    render();
  } },
    h("h2", { text: "New project" }),
    h("p", { class: "muted", text: "It starts with three sections: To do, Bugs and Ideas. Rename, reorder or delete them any time." }),
    input,
    h("div", { class: "row", style: "justify-content:flex-end" },
      h("button", { type: "button", class: "btn", onclick: () => close() }, "Cancel"),
      h("button", { type: "submit", class: "btn primary" }, "Create project"))));
}
function importModal() {
  const hasProject = !!S.projects[S.pid];
  const ta = h("textarea", { id: "import-text", spellcheck: "false", placeholder: "BUGS:\n-- pickaxe sometimes drops 3–5 shards of the same level\n-- upgrade button doesn’t work on mobile - to check\n\nUI:\n-- no transparent background\n-- fix the price pill" });
  const preview = h("div", { class: "preview", "aria-live": "polite" });
  const rCur = h("input", { type: "radio", name: "target", id: "t-cur", checked: hasProject, disabled: !hasProject });
  const rNew = h("input", { type: "radio", name: "target", id: "t-new", checked: !hasProject });
  const nameIn = h("input", { type: "text", id: "import-name", placeholder: "New project name", spellcheck: "false" });
  const okBtn = h("button", { class: "btn primary" }, "Import");
  const update = () => {
    const parsed = parseNotes(ta.value);
    const total = parsed.reduce((a, s) => a + s.items.length, 0);
    nameIn.hidden = !rNew.checked;
    okBtn.disabled = !total;
    preview.replaceChildren(
      total ? h("b", { text: `${plural(parsed.length, "section")} · ${plural(total, "task")}` })
            : h("span", { class: "muted", text: "Paste some text and you’ll see here what it turns into." }));
    if (total) preview.append(h("div", { class: "ptags" }, parsed.map((s) => h("span", { class: "ptag", text: `${s.name} · ${s.items.length}` }))));
  };
  ta.addEventListener("input", update);
  rCur.addEventListener("change", update);
  rNew.addEventListener("change", update);
  const close = openModal([
    h("h2", { text: "Paste notes" }),
    h("p", { class: "muted", text: "Lines starting with “--” or “-” become tasks. A line ending with a colon, like “BUGS:”, starts a section. A line without a dash is added to the task above it. Tasks that say “to check” or “do sprawdzenia” get the To check label." }),
    ta, preview,
    h("div", { style: "display:grid;gap:8px" },
      h("label", { class: "radio", for: "t-cur" }, rCur, hasProject ? `Add to “${S.projects[S.pid].name}”` : "Add to the current project"),
      h("label", { class: "radio", for: "t-new" }, rNew, "Create a new project"),
      nameIn),
    h("div", { class: "row", style: "justify-content:flex-end" },
      h("button", { class: "btn", onclick: () => close() }, "Cancel"), okBtn),
  ], true);
  okBtn.addEventListener("click", () => {
    const parsed = parseNotes(ta.value);
    if (!parsed.length) return;
    close();
    importParsed(parsed, rNew.checked ? "new" : "current", nameIn.value.trim());
  });
  update();
  ta.focus();
}

/* ---------- files ---------- */
function measure(rec) {
  if (rec.kind !== "image" || !BROWSER_IMG.includes(rec.ext)) return;
  const img = new Image();
  img.onload = () => {
    if (!S.files[rec.id]) return;
    rec.w = img.naturalWidth; rec.h = img.naturalHeight;
    save();
    const cap = document.getElementById("dim-" + rec.id);
    if (cap) cap.textContent = fileMetaLine(rec);
  };
  img.src = fileSrc(rec);
}
function addRecords(list, link) {
  const pid = S.pid;
  if (!pid || !list || !list.length) return [];
  const out = [];
  for (const r of list) {
    const ext = (r.ext || "").toLowerCase();
    const rec = { id: uid(), projectId: pid, fileName: r.fileName, name: r.name, size: r.size, ext,
      kind: kindOf(ext), w: 0, h: 0, sectionId: (link && link.sectionId) || null, itemId: (link && link.itemId) || null, createdAt: Date.now() };
    S.files[rec.id] = rec;
    measure(rec);
    out.push(rec);
  }
  save();
  render();
  Sound.play("add");
  const where = link && link.itemId ? " to the task" : link && link.sectionId ? " to the section" : "";
  toast(`Added ${plural(out.length, "file")}${where}.`);
  return out;
}
async function addFiles(link) {
  if (!S.pid) return;
  try { addRecords(await api.pickFiles(), link); } catch (e) { toast("Couldn’t add the files. Try again."); }
}
async function importDropped(fileList, link) {
  const paths = [...fileList].map((f) => { try { return api.pathForFile(f); } catch (e) { return ""; } }).filter(Boolean);
  if (!paths.length) return;
  const recs = await api.importPaths(paths);
  if (!recs.length) return toast("Couldn’t add those. Folders can’t be added, only files.");
  addRecords(recs, link);
}
async function deleteFile(f) {
  await api.deleteAsset(f.fileName);
  delete S.files[f.id];
  save();
}
function fileMetaLine(f) {
  const bits = [];
  if (f.w && f.h) bits.push(`${f.w}×${f.h}`);
  bits.push(size(f.size || 0));
  if (f.ext) bits.push(f.ext.toUpperCase());
  return bits.join(" · ");
}
const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
function ratio(w, hgt) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(w, hgt);
  const r = `${w / d}:${hgt / d}`;
  return r.length <= 7 ? r : (w / hgt).toFixed(2) + ":1";
}

const SEL = { on: false, ids: new Set(), last: null, visible: [] };
function resetSelection() { SEL.on = false; SEL.ids.clear(); SEL.last = null; }
function tileClick(e, f, files, i) {
  if (SEL.on || e.target.closest(".tsel") || e.ctrlKey || e.metaKey || e.shiftKey) {
    const lastIdx = files.findIndex((x) => x.id === SEL.last);
    if (e.shiftKey && lastIdx >= 0) {
      const [a, b] = lastIdx < i ? [lastIdx, i] : [i, lastIdx];
      for (let k = a; k <= b; k++) SEL.ids.add(files[k].id);
    } else if (SEL.ids.has(f.id)) {
      SEL.ids.delete(f.id);
    } else {
      SEL.ids.add(f.id);
    }
    SEL.on = true;
    SEL.last = f.id;
    render();
    return;
  }
  openFile(f, files, i);
}
async function deleteSelected() {
  const list = [...SEL.ids].map((id) => S.files[id]).filter(Boolean);
  if (!list.length) return;
  const label = plural(list.length, "file");
  const ok = await confirmBox(`Delete ${label}?`, "They will be moved to the Recycle Bin, so you can still get them back from there.", `Delete ${label}`);
  if (!ok) return;
  for (const f of list) await deleteFile(f);
  resetSelection();
  Sound.play("delete");
  render();
  toast(`Deleted ${label}.`);
}
function selectionBar(files) {
  const n = SEL.ids.size;
  const allOn = files.length > 0 && files.every((f) => SEL.ids.has(f.id));
  return h("div", { class: "selbar" },
    h("b", { text: n ? `${n} selected` : "Select files" }),
    h("span", { class: "muted", text: "Click to select · Shift+click for a range · Ctrl+A for all" }),
    h("span", { class: "spacer" }),
    allOn
      ? h("button", { class: "btn", onclick: () => { SEL.ids.clear(); render(); } }, "Select none")
      : h("button", { class: "btn", onclick: () => { files.forEach((f) => SEL.ids.add(f.id)); render(); } }, `Select all (${files.length})`),
    h("button", { class: "btn danger solid", disabled: !n, onclick: deleteSelected }, n ? `Delete ${plural(n, "file")}` : "Delete"),
    h("button", { class: "btn", onclick: () => { resetSelection(); render(); } }, "Done"));
}
document.addEventListener("keydown", (e) => {
  if (S.tab !== "assets" || modalClose || menuEl) return;
  const t = document.activeElement;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
    e.preventDefault();
    SEL.on = true;
    SEL.visible.forEach((f) => SEL.ids.add(f.id));
    render();
  } else if ((e.key === "Delete" || e.key === "Backspace") && SEL.ids.size) {
    e.preventDefault();
    deleteSelected();
  } else if (e.key === "Escape" && SEL.on) {
    resetSelection();
    render();
  }
});

function renderAssets(p) {
  const q = S.q.trim().toLowerCase();
  const files = filesOf(p.id).filter((f) => (S.kind === "all" || (f.kind || kindOf(f.ext)) === S.kind) && (!q || (f.name || "").toLowerCase().includes(q) || (f.ext || "").includes(q)));
  for (const id of [...SEL.ids]) if (!S.files[id] || S.files[id].projectId !== p.id) SEL.ids.delete(id);
  SEL.visible = files;
  const drop = SEL.on ? selectionBar(files) : h("div", { class: "drop" },
    h("span", {}, h("strong", { text: "Drop any files here" }), " – sprites, textures, models, sounds, videos, scripts. Or paste with Ctrl+V."));
  if (!files.length) {
    const searching = q || S.kind !== "all";
    return h("div", {}, drop, h("div", { class: "empty", style: "margin-top:14px" },
      h("h2", { text: searching ? "No matching files" : "No files yet" }),
      h("p", { text: searching ? "Try a different search or file type." : "Keep everything this project uses in one place. Images get a transparency check, 3D models (GLB, glTF, FBX, OBJ, STL) open in a viewer that plays their animations, and sounds and videos play right here. You can also attach files to a section or to a single task." })));
  }
  return h("div", {}, drop, h("div", { class: "agrid" + (SEL.on ? " selecting" : "") }, files.map((f, i) => {
    const kind = f.kind || kindOf(f.ext);
    const showImg = kind === "image" && BROWSER_IMG.includes(f.ext);
    const link = linkLabel(f);
    const picked = SEL.ids.has(f.id);
    return h("button", { class: "tile" + (picked ? " selected" : ""), "aria-label": (SEL.on ? "Select " : "Open ") + f.name, "aria-pressed": SEL.on ? String(picked) : null,
      onclick: (e) => tileClick(e, f, files, i) },
      h("span", { class: "tsel", title: "Select", html: ICON.check }),
      h("div", { class: "thumb" + (showImg ? " checker" : "") },
        showImg ? h("img", { class: f.w && f.w <= 128 && f.h <= 128 ? "pix" : null, src: fileSrc(f), alt: "", loading: "lazy", draggable: "false" })
                : h("div", { class: "kindbox", style: `--kc:${kindColor(kind)}`, html: KIND_ICON[kind] + `<b>${f.ext || "file"}</b>` })),
      h("div", { class: "cap" },
        h("b", { text: f.name || "Untitled" }),
        h("span", { class: "mono", id: "dim-" + f.id, text: fileMetaLine(f) }),
        link ? h("span", { class: "link", text: link }) : null));
  })));
}

let stageBg = "checker";

// Zoom and pan for the image preview: mouse wheel zooms at the cursor, dragging pans,
// double-click switches between "fit" and a closer look. Small sprites stay pixel-sharp.
function makeZoom(stage, img, label) {
  let s = 1, x = 0, y = 0, fitted = true, drag = null;
  const iw = () => img.naturalWidth || 1, ih = () => img.naturalHeight || 1;
  const fitScale = () => Math.max(0.01, Math.min((stage.clientWidth - 48) / iw(), (stage.clientHeight - 48) / ih(), 64));
  const apply = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    img.classList.toggle("pixel", s >= 2);
    label.textContent = Math.round(s * 100) + "%";
  };
  const zoomAt = (scale, cx, cy) => {
    scale = Math.max(Math.min(fitScale(), 1) / 4, Math.min(64, scale));
    const k = scale / s;
    x = cx - (cx - x) * k;
    y = cy - (cy - y) * k;
    s = scale;
    fitted = false;
    apply();
  };
  const fit = () => {
    fitted = true;
    s = fitScale();
    x = (stage.clientWidth - iw() * s) / 2;
    y = (stage.clientHeight - ih() * s) / 2;
    apply();
  };
  const mid = () => [stage.clientWidth / 2, stage.clientHeight / 2];
  const step = (d) => zoomAt(s * (d > 0 ? 1.25 : 0.8), ...mid());
  const actual = () => zoomAt(1, ...mid());
  const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  const onWheel = (e) => { e.preventDefault(); zoomAt(s * Math.pow(1.0018, -e.deltaY), ...local(e)); };
  const onDown = (e) => {
    if (e.button !== 0 || e.target.closest("button, select")) return;
    drag = { x: e.clientX - x, y: e.clientY - y };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("panning");
  };
  const onMove = (e) => { if (!drag) return; x = e.clientX - drag.x; y = e.clientY - drag.y; fitted = false; apply(); };
  const onUp = () => { drag = null; stage.classList.remove("panning"); };
  const onDbl = (e) => {
    if (e.target.closest("button, select")) return;
    if (fitted) zoomAt(fitScale() < 1 ? 1 : fitScale() * 2, ...local(e)); else fit();
  };
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);
  stage.addEventListener("dblclick", onDbl);
  const ro = new ResizeObserver(() => { if (fitted) fit(); });
  ro.observe(stage);
  if (img.complete && img.naturalWidth) fit(); else img.addEventListener("load", fit, { once: true });

  return {
    fit, actual, step,
    dispose() {
      ro.disconnect();
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("dblclick", onDbl);
      stage.classList.remove("zoomable", "panning");
    },
  };
}
let viewerMod = null;
async function loadViewer() {
  if (!viewerMod) viewerMod = await import("./viewer.js");
  return viewerMod;
}
function openFile(f, list, index) {
  closeMenu();
  const files = list || [f];
  let i = list ? index : 0;
  let cleanup = null, token = null, zoom = null;
  const stage = h("div", { class: "stage", tabindex: "-1", onpointerdown: () => stage.focus({ preventScroll: true }) });
  const nameIn = h("input", { type: "text", id: "fd-name", "aria-label": "File name", spellcheck: "false" });
  const linkSel = h("select", { id: "fd-link", "aria-label": "Attached to" });
  const meta = h("div", { class: "meta-line mono" });
  const prev = h("button", { class: "btn", title: "Previous (←)", onclick: () => go(-1) }, "←");
  const next = h("button", { class: "btn", title: "Next (→)", onclick: () => go(1) }, "→");
  const commit = () => {
    const cur = S.files[files[i].id];
    const v = nameIn.value.trim();
    if (cur && v && v !== cur.name) { cur.name = v; save(); }
  };
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); nameIn.blur(); } });
  nameIn.addEventListener("change", commit);
  linkSel.addEventListener("change", () => {
    const cur = S.files[files[i].id];
    if (!cur) return;
    const [type, id] = linkSel.value.split(":");
    if (type === "s") { cur.sectionId = id; cur.itemId = null; }
    else if (type === "i") { cur.itemId = id; cur.sectionId = S.items[id] ? S.items[id].section : null; }
    else { cur.sectionId = null; cur.itemId = null; }
    save();
  });
  function go(d) { commit(); i = (i + d + files.length) % files.length; show(); }
  function fillLink(cur) {
    const p = S.projects[cur.projectId];
    const val = cur.itemId && S.items[cur.itemId] ? "i:" + cur.itemId : cur.sectionId && p && p.sections.some((s) => s.id === cur.sectionId) ? "s:" + cur.sectionId : "none";
    const opts = [h("option", { value: "none", text: "Not attached (project only)" })];
    if (p) {
      opts.push(h("optgroup", { label: "Sections" }, p.sections.map((s) => h("option", { value: "s:" + s.id, text: s.name }))));
      for (const s of p.sections) {
        const its = itemsIn(p.id, s.id);
        if (its.length) opts.push(h("optgroup", { label: "Tasks in " + s.name }, its.map((it) => h("option", { value: "i:" + it.id, text: short(it.text, 70) }))));
      }
    }
    linkSel.replaceChildren(...opts);
    linkSel.value = val;
  }
  async function show() {
    if (cleanup) { cleanup(); cleanup = null; }
    const my = token = {};
    const cur = S.files[files[i].id] || files[i];
    const kind = cur.kind || kindOf(cur.ext);
    const src = fileSrc(cur);
    nameIn.value = cur.name || "";
    fillLink(cur);
    const bits = [h("span", { text: size(cur.size || 0) }), h("span", { text: (cur.ext || "file").toUpperCase() }),
      h("span", { text: "Added " + new Date(cur.createdAt || Date.now()).toLocaleDateString() })];
    const setMeta = () => meta.replaceChildren(...bits);
    stage.className = "stage";
    prev.hidden = next.hidden = files.length < 2;

    if (kind === "image" && BROWSER_IMG.includes(cur.ext)) {
      const bgClass = (k) => (k === "checker" ? "checker" : k);
      stage.className = "stage zoomable " + bgClass(stageBg);
      const bgs = h("div", { class: "overlay" }, [["checker", "Checker"], ["light", "Light"], ["dark", "Dark"]].map(([k, label]) =>
        h("button", { class: "chip", dataset: { bg: k }, "aria-pressed": String(stageBg === k), onclick: () => {
          stageBg = k;
          stage.classList.remove("checker", "light", "dark");
          stage.classList.add(bgClass(k));
          bgs.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.bg === k)));
        } }, label)));
      const img = h("img", { class: "zimg", src, alt: cur.name || "", draggable: "false" });
      const zl = h("span", { class: "zlabel mono" });
      const z = makeZoom(stage, img, zl);
      const bar = h("div", { class: "zoombar" },
        h("button", { class: "zbtn", title: "Zoom out (−)", "aria-label": "Zoom out", onclick: () => z.step(-1) }, "−"),
        zl,
        h("button", { class: "zbtn", title: "Zoom in (+)", "aria-label": "Zoom in", onclick: () => z.step(1) }, "+"),
        h("button", { class: "zbtn wide", title: "Fit to the window (0)", onclick: () => z.fit() }, "Fit"),
        h("button", { class: "zbtn wide", title: "Actual size (1)", onclick: () => z.actual() }, "1:1"));
      stage.replaceChildren(img, bgs, bar);
      zoom = z;
      cleanup = () => { z.dispose(); zoom = null; };
      if (cur.w && cur.h) {
        bits.unshift(h("span", { text: `${cur.w} × ${cur.h} px` }), h("span", { text: ratio(cur.w, cur.h) }));
        if (isPow2(cur.w) && isPow2(cur.h)) bits.push(h("span", { class: "good", text: "✓ Power of two" }));
      }
    } else if (kind === "model" && MODEL_PREVIEW.includes(cur.ext)) {
      const box = h("div", { style: "position:absolute;inset:0" });
      const status = h("div", { class: "msg", text: "Loading model…" });
      stage.replaceChildren(status, box);
      setMeta();
      try {
        const mod = await loadViewer();
        const v = await mod.mountModel(box, src, cur.ext);
        if (token !== my) { v.dispose(); return; }
        status.remove();
        cleanup = () => v.dispose();
        bits.unshift(h("span", { text: `${v.info.meshes} mesh${v.info.meshes === 1 ? "" : "es"}` }), h("span", { text: `${v.info.triangles.toLocaleString()} triangles` }));
        if (v.info.clips.length) {
          const sel = h("select", { "aria-label": "Animation", style: "width:auto;padding:3px 8px;font-size:12px;border-radius:99px" },
            v.info.clips.map((c, ci) => h("option", { value: String(ci), text: "▶ " + c })));
          sel.addEventListener("change", () => v.playClip(+sel.value));
          stage.append(h("div", { class: "overlay" }, h("span", { class: "chip", text: plural(v.info.clips.length, "animation") }), sel));
        }
        setMeta();
      } catch (e) {
        if (token !== my) return;
        status.replaceChildren(h("div", { class: "kindbox", style: `--kc:${kindColor(kind)}`, html: KIND_ICON.model }),
          h("div", { text: "This model couldn’t be previewed." }),
          h("div", { class: "muted", style: "font-size:12px", text: cur.ext === "gltf" ? "glTF files that use separate .bin or texture files can’t be shown here. Export as GLB to keep everything in one file." : String((e && e.message) || e) }));
      }
      return;
    } else if (kind === "audio" && PLAYABLE_AUDIO.includes(cur.ext)) {
      const audio = h("audio", { controls: true, src, preload: "metadata" });
      audio.addEventListener("loadedmetadata", () => { if (isFinite(audio.duration)) { bits.unshift(h("span", { text: audio.duration.toFixed(2) + " s" })); setMeta(); } });
      stage.replaceChildren(h("div", { class: "audio-wrap" }, h("div", { class: "kindbox", style: `--kc:${kindColor(kind)}`, html: KIND_ICON.audio }), audio));
      cleanup = () => audio.pause();
    } else if (kind === "video" && PLAYABLE_VIDEO.includes(cur.ext)) {
      const video = h("video", { controls: true, src, preload: "metadata" });
      video.addEventListener("loadedmetadata", () => { bits.unshift(h("span", { text: `${video.videoWidth} × ${video.videoHeight}` }), h("span", { text: video.duration.toFixed(1) + " s" })); setMeta(); });
      stage.replaceChildren(video);
      cleanup = () => video.pause();
    } else if (kind === "code") {
      const pre = h("pre", { text: "Loading…" });
      stage.replaceChildren(pre);
      fetch(src).then((r) => r.text()).then((t) => {
        if (token !== my) return;
        pre.textContent = t.length > 200000 ? t.slice(0, 200000) + "\n\n… (preview cut off)" : t;
        bits.unshift(h("span", { text: plural(t.split("\n").length, "line") }));
        setMeta();
      }).catch(() => { pre.textContent = "Couldn’t read this file."; });
    } else {
      stage.replaceChildren(h("div", { class: "msg" },
        h("div", { class: "kindbox", style: `--kc:${kindColor(kind)}`, html: KIND_ICON[kind] + `<b>${cur.ext || "file"}</b>` }),
        h("div", { text: "No preview for this file type." }),
        h("div", { class: "muted", style: "font-size:12px", text: "Use Open to edit it in its own app." })));
    }
    setMeta();
  }
  const close = openModal([
    h("div", { class: "row", style: "justify-content:space-between" },
      h("h2", { text: "File" }),
      h("button", { class: "icon", "aria-label": "Close", title: "Close (Esc)", onclick: () => close(), text: "✕" })),
    stage,
    meta,
    h("div", { class: "two" },
      h("label", { class: "field" }, h("span", { text: "Name" }), nameIn),
      h("label", { class: "field" }, h("span", { text: "Attached to" }), linkSel)),
    h("div", { class: "row", style: "justify-content:space-between" },
      h("div", { class: "row" }, prev, next,
        h("button", { class: "btn", onclick: () => api.openAsset(files[i].fileName) }, "Open"),
        h("button", { class: "btn", onclick: () => api.revealAsset(files[i].fileName) }, "Show in folder")),
      h("div", { class: "row" },
        h("button", { class: "btn danger", onclick: async () => {
          const cur = files[i];
          const ok = await confirmBox(`Delete “${cur.name}”?`, "The file will be moved to the Recycle Bin.", "Delete file");
          if (!ok) return;
          await deleteFile(cur);
          Sound.play("delete");
          render();
          toast("File deleted.");
        } }, "Delete"),
        h("button", { class: "btn primary", onclick: () => close() }, "Done"))),
  ], true, () => { commit(); if (cleanup) cleanup(); cleanup = null; token = null; render(); });
  const onKey = (e) => {
    if (!document.contains(stage)) { document.removeEventListener("keydown", onKey); return; }
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.key === "ArrowLeft" && files.length > 1) go(-1);
    if (e.key === "ArrowRight" && files.length > 1) go(1);
    if (zoom) {
      if (e.key === "+" || e.key === "=") zoom.step(1);
      if (e.key === "-" || e.key === "_") zoom.step(-1);
      if (e.key === "0") zoom.fit();
      if (e.key === "1") zoom.actual();
    }
  };
  document.addEventListener("keydown", onKey);
  // Start with the preview focused so the arrow keys and zoom keys work right away.
  stage.focus({ preventScroll: true });
  show();
}

// Files dragged in from File Explorer. Dropped on a task or a section, they get attached to it.
let fileDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
function fileDropLink(target) {
  const row = target.closest && target.closest(".item");
  if (row && S.items[row.dataset.id]) return { el: row, link: { itemId: row.dataset.id, sectionId: S.items[row.dataset.id].section } };
  const card = target.closest && target.closest(".sec");
  if (card && card.dataset.sid) return { el: card, link: { sectionId: card.dataset.sid } };
  return null;
}
document.addEventListener("dragenter", (e) => { if (hasFiles(e)) { fileDepth++; document.body.classList.add("file-over"); } });
document.addEventListener("dragleave", (e) => { if (hasFiles(e) && --fileDepth <= 0) { fileDepth = 0; document.body.classList.remove("file-over"); clearDropMarks(); } });
document.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const t = fileDropLink(e.target);
  document.querySelectorAll(".drop-file, .drop-into").forEach((el) => { if (!t || el !== t.el) el.classList.remove("drop-file", "drop-into"); });
  if (t) t.el.classList.add(t.link.itemId ? "drop-file" : "drop-into");
});
document.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  fileDepth = 0;
  document.body.classList.remove("file-over");
  const t = fileDropLink(e.target);
  clearDropMarks();
  if (!S.pid) return toast("Create a project first, then add files to it.");
  importDropped(e.dataTransfer.files, t ? t.link : null);
});
document.addEventListener("paste", async (e) => {
  if (S.tab !== "assets" || !S.pid || modalClose) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  const files = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (!files.length) return;
  e.preventDefault();
  const out = [];
  for (const f of files) {
    let path = "";
    try { path = api.pathForFile(f); } catch (err) {}
    if (path) { out.push(...(await api.importPaths([path]))); continue; }
    const ext = ((f.name && f.name.includes(".") ? f.name.split(".").pop() : "") || f.type.split("/")[1] || "bin").replace("jpeg", "jpg").replace("svg+xml", "svg");
    const rec = await api.saveFile(f.name ? f.name.replace(/\.[^.]+$/, "") : "Pasted file", ext, new Uint8Array(await f.arrayBuffer()));
    if (rec) out.push(rec);
  }
  addRecords(out);
});

/* ---------- backup ---------- */
async function exportBackup() {
  await flush();
  try { if (await api.exportBackup(snapshot())) toast("Backup saved. Files stay in the data folder."); }
  catch (e) { toast("Couldn’t save the backup."); }
}
async function importBackup() {
  let data;
  try { data = await api.importBackup(); } catch (e) { return toast("That file isn’t a Gridnote backup."); }
  if (!data) return;
  if (!data.projects || !data.items) return toast("That file isn’t a Gridnote backup.");
  const n = Object.keys(data.projects).length;
  const ok = await confirmBox("Import backup?", `${plural(n, "project")} will be added. Projects that already exist here will be replaced by the version from the backup.`, "Import");
  if (!ok) return;
  Object.assign(S.projects, data.projects);
  Object.assign(S.items, data.items);
  Object.assign(S.files, data.files || {});
  migrate();
  save(); render();
  toast(`Imported ${plural(n, "project")}.`);
}

/* ---------- app menu ---------- */
api.onMenu((action) => {
  if (modalClose && action !== "find") modalClose();
  switch (action) {
    case "new-project": return newProjectModal();
    case "import-notes": return importModal();
    case "add-files": return addFiles();
    case "export-backup": return exportBackup();
    case "import-backup": return importBackup();
    case "toggle-sound": return toggleSound();
    case "tab-list": return S.pid && setTab("list");
    case "tab-assets": return S.pid && setTab("assets");
    case "find": { const s = $("#search"); if (s) { s.focus(); s.select(); } return; }
  }
});

/* ---------- start ---------- */
function migrate() {
  for (const p of Object.values(S.projects)) if (!Array.isArray(p.sections)) p.sections = [];
  for (const it of Object.values(S.items)) {
    if (!Array.isArray(it.tags)) it.tags = it.flag ? [it.flag] : [];
    delete it.flag;
    if (typeof it.stars !== "number") it.stars = 0;
  }
  for (const f of Object.values(S.files)) {
    f.ext = (f.ext || "").toLowerCase();
    if (!f.kind) f.kind = kindOf(f.ext);
  }
}
(async function start() {
  render();
  let data = null;
  try { data = await api.load(); } catch (e) { toast("Couldn’t read your saved data."); }
  if (data) {
    S.projects = data.projects || {};
    S.items = data.items || {};
    S.files = data.files || {};
    const pr = data.prefs || {};
    S.pid = pr.pid || null;
    S.tab = pr.tab === "assets" ? "assets" : "list";
    S.collapsed = pr.collapsed || {};
    S.sound = pr.sound !== false;
  }
  migrate();
  S.ready = true;
  render();
})();

/* ---------- plain-browser fallback (for previewing without Electron) ---------- */
function browserApi() {
  const K = "gridnote-preview";
  const noop = async () => null;
  return {
    load: async () => { try { return JSON.parse(localStorage.getItem(K) || "null"); } catch (e) { return null; } },
    save: async (d) => { localStorage.setItem(K, JSON.stringify(d)); },
    saveSync: (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch (e) {} },
    pickFiles: async () => [], importPaths: async () => [], saveFile: noop,
    deleteAsset: noop, revealAsset: noop, openAsset: noop, openDataFolder: noop,
    exportBackup: async () => false, importBackup: noop,
    pathForFile: () => "", onMenu: () => {},
  };
}
})();
