/**
 * Lukis -- offline data logging PWA.
 *
 * Single-page app: it renders a form from the FIELDS config below, stores each
 * entry (plus an automatic timestamp) in IndexedDB on the device, and exports
 * everything as a CSV that opens cleanly in Excel. No server, works offline.
 *
 * To change what gets logged, edit FIELDS -- the form inputs and the CSV
 * columns are both derived from it. Nothing else needs to change.
 */

"use strict";

/**
 * Field definitions. Each entry becomes one form input and one CSV column.
 *
 *   key         unique id; used as the stored property name and column key
 *   label       shown above the input and as the CSV header
 *   type        "text" | "number" | "textarea" | "select" | "date" | "checkbox"
 *   required    (optional) blocks saving until filled
 *   options     (select only) array of choices
 *   min/max/step (number only, optional) passed through to the input
 *   placeholder (optional) hint text
 *   default     (optional) initial value; the token "today" fills a date field
 *               with the current date (re-applied after each save)
 */
const FIELDS = [
  { key: "datum",  label: "Datum",   type: "date",   required: true, default: "today" },
  { key: "vkpi",   label: "VKPI",    type: "number", step: "any" },
  { key: "pgi",    label: "PGI",     type: "number", step: "any" },
  { key: "daPki",  label: "DA PKI",  type: "number", step: "any" },
  { key: "daVkpi", label: "DA VKPI", type: "number", step: "any" },
];

const APP_NAME = "Lukis";
const DB_NAME = "lukis";
const STORE = "entries";
const TIMESTAMP_LABEL = "Saved at";
const MAX_VISIBLE = 25; // recent list is capped for readability; export covers everything

// de-CH/de-DE Excel expects a comma as the decimal separator (paired with the
// ";" column separator below). Set to "." if the target Excel uses English settings.
const CSV_DECIMAL = ",";

/* ------------------------------- IndexedDB ------------------------------- */
// A small promise wrapper over a single "entries" object store keyed by id.
// Written by hand rather than pulling in a library: it is only a few calls and
// keeps the app dependency-free and fully offline.

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function dbAdd(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = store(db, "readwrite").add(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = store(db, "readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = store(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function dbClear() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = store(db, "readwrite").clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* ---------------------------------- CSV ---------------------------------- */

// Escapes one value for a semicolon-separated CSV. Swiss/German Excel expects
// ";" as the column separator (and buildCsv adds a UTF-8 BOM so umlauts
// survive). Wrap in quotes when the value contains ; " or a line break, and
// double any embedded quotes.
// Input:  he said "hi"; bye   ->   "he said ""hi""; bye"
function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[;"\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Builds the full CSV text for every entry. Columns: timestamp first, then one
// per field in FIELDS order. Booleans render as yes/no for readability.
function buildCsv(entries) {
  const rows = [[TIMESTAMP_LABEL, ...FIELDS.map((f) => f.label)]];
  for (const entry of entries) {
    const row = [formatTimestamp(entry.savedAt)];
    for (const f of FIELDS) {
      let v = entry[f.key];
      if (typeof v === "boolean") v = v ? "yes" : "no";
      else if (typeof v === "number") v = formatNumber(v);
      row.push(v);
    }
    rows.push(row);
  }
  // Lead with a UTF-8 BOM and use CRLF line endings -- that combination is what
  // Excel opens most reliably (correct encoding and one row per line).
  return "﻿" + rows.map((cells) => cells.map(csvCell).join(";")).join("\r\n");
}

/* -------------------------------- Helpers -------------------------------- */

function pad(n) {
  return String(n).padStart(2, "0");
}

// Local, sortable timestamp for display and CSV, e.g. "2026-06-19 14:05".
function formatTimestamp(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local "YYYY-MM-DD" for today, used as the default for "today" date fields.
function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Formats a number for the CSV using CSV_DECIMAL, e.g. 42.5 -> "42,5" for
// de-CH Excel. Integers have no separator and are returned unchanged.
function formatNumber(n) {
  return CSV_DECIMAL === "." ? String(n) : String(n).replace(".", CSV_DECIMAL);
}

function exportFilename() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `lukis-${stamp}.csv`;
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ----------------------------- Form rendering ---------------------------- */

function defaultValueFor(f) {
  return f.default === "today" ? todayISODate() : f.default;
}

// (Re)applies configured field defaults. Run on first render and after each
// save, so a "today" date stays current even if the app is left open for days.
function applyDefaults(form) {
  for (const f of FIELDS) {
    if (f.default === undefined) continue;
    const el = form.elements[f.key];
    if (!el) continue;
    if (f.type === "checkbox") el.checked = !!f.default;
    else el.value = defaultValueFor(f);
  }
}

function renderForm() {
  const form = document.getElementById("entry-form");
  form.innerHTML = "";
  for (const f of FIELDS) form.appendChild(renderField(f));

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "btn btn-primary";
  submit.textContent = "Save";
  form.appendChild(submit);
  applyDefaults(form);
}

function renderField(f) {
  const wrap = document.createElement("div");
  wrap.className = "field" + (f.type === "checkbox" ? " checkbox" : "");
  const id = "f-" + f.key;

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = f.label;
  if (f.required) {
    const star = document.createElement("span");
    star.className = "req";
    star.textContent = "*";
    label.appendChild(star);
  }

  let input;
  switch (f.type) {
    case "textarea":
      input = document.createElement("textarea");
      break;
    case "select":
      input = document.createElement("select");
      // Empty placeholder so nothing is preselected; "required" forces a choice.
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select…";
      placeholder.disabled = !!f.required;
      placeholder.selected = true;
      input.appendChild(placeholder);
      for (const opt of f.options || []) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        input.appendChild(o);
      }
      break;
    case "checkbox":
      input = document.createElement("input");
      input.type = "checkbox";
      break;
    default:
      input = document.createElement("input");
      input.type = f.type; // text | number | date
      if (f.step !== undefined) input.step = f.step;
      if (f.min !== undefined) input.min = f.min;
      if (f.max !== undefined) input.max = f.max;
  }

  input.id = id;
  input.name = f.key;
  if (f.required) input.required = true;
  if (f.placeholder && f.type !== "select" && f.type !== "checkbox") {
    input.placeholder = f.placeholder;
  }

  // Checkbox reads better with the box before its label.
  if (f.type === "checkbox") {
    wrap.appendChild(input);
    wrap.appendChild(label);
  } else {
    wrap.appendChild(label);
    wrap.appendChild(input);
  }
  return wrap;
}

function collectEntry(form) {
  const entry = { id: newId(), savedAt: new Date().toISOString() };
  for (const f of FIELDS) {
    const el = form.elements[f.key];
    if (f.type === "checkbox") {
      entry[f.key] = el.checked;
    } else if (f.type === "number") {
      entry[f.key] = el.value === "" ? null : Number(el.value);
    } else {
      entry[f.key] = el.value;
    }
  }
  return entry;
}

/* ---------------------------- Recent entries ----------------------------- */

// Headline for a list row: the first non-empty field value, else the timestamp.
function summaryOf(entry) {
  for (const f of FIELDS) {
    const v = entry[f.key];
    if (v !== null && v !== undefined && v !== "" && v !== false) {
      return typeof v === "boolean" ? f.label : String(v);
    }
  }
  return formatTimestamp(entry.savedAt);
}

async function refresh() {
  let entries;
  try {
    entries = await dbAll();
  } catch (err) {
    console.error("Failed to read entries", err);
    toast("Could not load entries.");
    return;
  }
  entries.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)); // newest first

  const countEl = document.getElementById("count");
  countEl.textContent = entries.length
    ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`
    : "";

  const list = document.getElementById("recent-list");
  const emptyNote = document.getElementById("empty-note");
  list.innerHTML = "";
  emptyNote.style.display = entries.length ? "none" : "block";

  for (const entry of entries.slice(0, MAX_VISIBLE)) {
    list.appendChild(renderEntry(entry));
  }
  if (entries.length > MAX_VISIBLE) {
    const more = document.createElement("li");
    more.className = "muted";
    more.style.padding = "12px 0 0";
    more.textContent = `+ ${entries.length - MAX_VISIBLE} more — all included when you export`;
    list.appendChild(more);
  }
}

function renderEntry(entry) {
  const li = document.createElement("li");
  li.className = "entry";

  const main = document.createElement("div");
  main.className = "entry-main";
  const summary = document.createElement("div");
  summary.className = "entry-summary";
  summary.textContent = summaryOf(entry);
  const time = document.createElement("div");
  time.className = "entry-time";
  time.textContent = formatTimestamp(entry.savedAt);
  main.appendChild(summary);
  main.appendChild(time);

  const del = document.createElement("button");
  del.className = "entry-del";
  del.type = "button";
  del.setAttribute("aria-label", "Delete entry");
  del.textContent = "×";
  del.addEventListener("click", () => onDelete(entry.id));

  li.appendChild(main);
  li.appendChild(del);
  return li;
}

/* -------------------------------- Actions -------------------------------- */

async function onSubmit(event) {
  event.preventDefault(); // native validation has already passed at this point
  const form = event.target;
  const entry = collectEntry(form);
  try {
    await dbAdd(entry);
  } catch (err) {
    console.error("Failed to save entry", err);
    toast("Could not save. Storage error.");
    return;
  }
  form.reset();
  applyDefaults(form); // restore the "today" date for the next entry
  const first = form.querySelector("input, select, textarea");
  if (first) first.focus(); // ready for the next entry
  toast("Saved");
  await refresh();
}

async function onDelete(id) {
  try {
    await dbDelete(id);
  } catch (err) {
    console.error("Failed to delete entry", err);
    toast("Could not delete.");
    return;
  }
  await refresh();
}

async function onClear() {
  const entries = await dbAll().catch(() => []);
  if (!entries.length) {
    toast("Nothing to clear.");
    return;
  }
  if (!confirm(`Delete all ${entries.length} entries? This cannot be undone.`)) return;
  try {
    await dbClear();
  } catch (err) {
    console.error("Failed to clear entries", err);
    toast("Could not clear.");
    return;
  }
  toast("All entries deleted");
  await refresh();
}

async function onExport() {
  let entries;
  try {
    entries = await dbAll();
  } catch (err) {
    console.error("Failed to read entries for export", err);
    toast("Could not read entries.");
    return;
  }
  if (!entries.length) {
    toast("Nothing to export yet.");
    return;
  }
  entries.sort((a, b) => (a.savedAt < b.savedAt ? -1 : 1)); // oldest first in the file

  const csv = buildCsv(entries);
  const filename = exportFilename();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const file = new File([blob], filename, { type: "text/csv" });

  // On a phone this opens the OS share sheet (Mail, WhatsApp, ...). Browsers
  // without file sharing (most desktops) fall through to a plain download.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: APP_NAME, text: `${APP_NAME} export` });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // user dismissed the share sheet
      console.warn("Share failed, falling back to download", err);
    }
  }
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* --------------------------------- Toast --------------------------------- */

let toastTimer = null;
function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------------------------------- Init --------------------------------- */

async function init() {
  // Register the service worker first, before any await. init() is async, so an
  // await here could yield long enough for the "load" event to fire before the
  // listener is attached -- then it never runs and the app never caches for
  // offline use. Registering up front (with a readyState fallback) avoids that
  // race. Relative path so it works under the Pages project subpath (.../lukisapp/).
  if ("serviceWorker" in navigator) {
    const register = () =>
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("Service worker registration failed", err);
      });
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }

  renderForm();
  document.getElementById("entry-form").addEventListener("submit", onSubmit);
  document.getElementById("export-btn").addEventListener("click", onExport);
  document.getElementById("clear-btn").addEventListener("click", onClear);

  // Ask the browser to keep our data, reducing the chance of automatic eviction.
  if (navigator.storage && navigator.storage.persist) {
    try {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch {
      /* best-effort only */
    }
  }

  await refresh();
}

init();
