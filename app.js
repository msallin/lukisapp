/**
 * Lukis -- flight-booking logger PWA with cloud sync.
 *
 * Two views: "Log" (tap one of the category buttons to book it now, with an
 * optional remark) and "All" (the full list, each row editable or deletable,
 * plus CSV export). Each booking is { category, remark, savedAt } and lives in
 * Firebase Firestore under the signed-in user, with offline persistence on, so
 * the app keeps working with no network and syncs when it returns. Sign-in is a
 * passwordless email link. The CSV export opens cleanly in Excel.
 *
 * To change the booking categories, edit CATEGORIES -- the buttons and the edit
 * dropdown are both derived from it.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// The four flight categories. Each becomes a quick-book button and an option in
// the edit dropdown. Add or rename here to change them everywhere.
const CATEGORIES = ["PGI", "VKPI", "DA PGI", "DA VKPI"];

const APP_NAME = "Lukis";
const EMAIL_KEY = "lukis:emailForSignIn";

/* -------------------------------- Firebase ------------------------------- */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// persistentLocalCache keeps an IndexedDB copy so reads/writes work offline and
// sync when the connection returns.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

let currentUser = null;
let entriesCache = []; // latest snapshot of the signed-in user's bookings
let entriesUnsub = null; // active Firestore listener teardown
let editingId = null; // id of the booking being edited, or null

function entriesCol(uid) {
  return collection(db, "users", uid, "entries");
}

async function saveEntry(uid, entry) {
  // The entry id is the document id, so create and edit are the same operation.
  await setDoc(doc(entriesCol(uid), entry.id), entry);
}

async function deleteEntry(uid, id) {
  await deleteDoc(doc(entriesCol(uid), id));
}

// Subscribes to the user's bookings. onSnapshot fires immediately from the local
// cache and again on every remote change, so the UI stays live without manual
// refreshes.
function subscribeEntries(uid) {
  unsubscribeEntries();
  entriesUnsub = onSnapshot(
    entriesCol(uid),
    (snap) => {
      entriesCache = snap.docs.map((d) => d.data());
      renderEntries(entriesCache);
    },
    (err) => {
      console.error("Entries listener failed", err);
      toast("Sync error.");
    }
  );
}

function unsubscribeEntries() {
  if (entriesUnsub) {
    entriesUnsub();
    entriesUnsub = null;
  }
  entriesCache = [];
  renderEntries(entriesCache);
}

/* ---------------------------------- Auth --------------------------------- */

function actionCodeSettings() {
  // The link returns to this exact app URL; its domain must be in the Firebase
  // console's authorized domains. handleCodeInApp is required for email links.
  return { url: location.origin + location.pathname, handleCodeInApp: true };
}

async function onSendLink(event) {
  event.preventDefault();
  const email = document.getElementById("signin-email").value.trim();
  if (!email) return;
  const btn = document.getElementById("signin-btn");
  btn.disabled = true;
  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings());
    // Remember the address so we can complete sign-in when the link is opened.
    localStorage.setItem(EMAIL_KEY, email);
    setAuthStatus(`Link sent to ${email}. Open it on this phone to finish signing in.`);
  } catch (err) {
    console.error("Failed to send sign-in link", err);
    setAuthStatus("Could not send the link. Check the address and try again.");
  } finally {
    btn.disabled = false;
  }
}

// If the page was opened from a sign-in link, complete the sign-in.
async function completeEmailLinkIfPresent() {
  if (!isSignInWithEmailLink(auth, location.href)) return;
  let email = localStorage.getItem(EMAIL_KEY);
  if (!email) email = window.prompt("Confirm your email to finish signing in:");
  if (!email) return;
  try {
    await signInWithEmailLink(auth, email, location.href);
    localStorage.removeItem(EMAIL_KEY);
    // Strip the one-time link parameters from the URL.
    history.replaceState(null, "", location.origin + location.pathname);
  } catch (err) {
    console.error("Email-link sign-in failed", err);
    setAuthStatus("That sign-in link was invalid or expired. Request a new one.");
  }
}

async function onSignOut() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Sign-out failed", err);
  }
}

function setAuthStatus(message) {
  document.getElementById("signin-status").textContent = message;
}

function handleAuthState(user) {
  currentUser = user;
  if (user) {
    showApp(user);
    subscribeEntries(user.uid);
  } else {
    unsubscribeEntries();
    showAuthView();
  }
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

// Builds the CSV: one row per booking, columns timestamp / category / remark.
function buildCsv(entries) {
  const rows = [["Saved at", "Category", "Remark"]];
  for (const e of entries) {
    rows.push([formatTimestamp(e.savedAt), e.category || "", e.remark || ""]);
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

function exportFilename() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `lukis-${stamp}.csv`;
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ----------------------------- Log view (book) --------------------------- */

function renderCategoryButtons() {
  const grid = document.getElementById("cat-grid");
  grid.innerHTML = "";
  for (const category of CATEGORIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-btn";
    btn.textContent = category;
    btn.addEventListener("click", () => bookCategory(category));
    grid.appendChild(btn);
  }
}

function renderCategoryOptions() {
  const select = document.getElementById("edit-category");
  select.innerHTML = "";
  for (const category of CATEGORIES) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }
}

// One-tap booking: records the chosen category now, with the current remark.
async function bookCategory(category) {
  if (!currentUser) return;
  const remarkEl = document.getElementById("remark");
  const entry = {
    id: newId(),
    savedAt: new Date().toISOString(),
    category,
    remark: remarkEl.value.trim(),
  };
  try {
    await saveEntry(currentUser.uid, entry);
  } catch (err) {
    console.error("Failed to save booking", err);
    toast("Could not save.");
    return;
  }
  remarkEl.value = ""; // the remark is per-booking; clear it for the next one
  toast(`${category} booked`);
}

/* ----------------------------- Edit a booking ---------------------------- */

function startEdit(id) {
  const entry = entriesCache.find((e) => e.id === id);
  if (!entry) {
    toast("Entry no longer exists.");
    return;
  }
  editingId = id;
  document.getElementById("edit-category").value = entry.category;
  document.getElementById("edit-remark").value = entry.remark || "";
  showEditCard();
  setView("log");
}

async function onEditSubmit(event) {
  event.preventDefault();
  if (!currentUser || !editingId) return;
  // Preserve the original id and booking time; only category/remark change.
  const existing = entriesCache.find((e) => e.id === editingId) || {
    id: editingId,
    savedAt: new Date().toISOString(),
  };
  const updated = {
    ...existing,
    category: document.getElementById("edit-category").value,
    remark: document.getElementById("edit-remark").value.trim(),
  };
  try {
    await saveEntry(currentUser.uid, updated);
  } catch (err) {
    console.error("Failed to update booking", err);
    toast("Could not save.");
    return;
  }
  editingId = null;
  showQuickBook();
  toast("Updated");
  setView("all");
}

function cancelEdit() {
  editingId = null;
  showQuickBook();
  setView("all");
}

/* --------------------------------- Views --------------------------------- */

function hideAllViews() {
  for (const id of ["view-loading", "view-auth", "view-log", "view-all"]) {
    document.getElementById(id).hidden = true;
  }
}

function showAuthView() {
  hideAllViews();
  document.getElementById("tabs").hidden = true;
  document.getElementById("view-auth").hidden = false;
}

function showApp(user) {
  document.getElementById("tabs").hidden = false;
  document.getElementById("account-email").textContent = user.email || "";
  showQuickBook();
  setView("log");
}

function showQuickBook() {
  document.getElementById("quickbook").hidden = false;
  document.getElementById("editcard").hidden = true;
}

function showEditCard() {
  document.getElementById("quickbook").hidden = true;
  document.getElementById("editcard").hidden = false;
}

function setView(view) {
  document.getElementById("view-loading").hidden = true;
  document.getElementById("view-auth").hidden = true;
  document.getElementById("view-log").hidden = view !== "log";
  document.getElementById("view-all").hidden = view !== "all";
  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  }
  window.scrollTo(0, 0);
}

function renderEntries(entries) {
  const sorted = [...entries].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)); // newest first

  document.getElementById("count").textContent = sorted.length
    ? `${sorted.length} ${sorted.length === 1 ? "booking" : "bookings"}`
    : "";

  const list = document.getElementById("entry-list");
  list.innerHTML = "";
  document.getElementById("empty-note").style.display = sorted.length ? "none" : "block";
  for (const entry of sorted) list.appendChild(renderEntry(entry));
}

function renderEntry(entry) {
  const li = document.createElement("li");
  li.className = "entry";

  const main = document.createElement("div");
  main.className = "entry-main";
  const summary = document.createElement("div");
  summary.className = "entry-summary";
  summary.textContent = entry.category || "—";
  const detail = document.createElement("div");
  detail.className = "entry-detail";
  detail.textContent = formatTimestamp(entry.savedAt) + (entry.remark ? " · " + entry.remark : "");
  main.appendChild(summary);
  main.appendChild(detail);

  const actions = document.createElement("div");
  actions.className = "entry-actions";

  const edit = document.createElement("button");
  edit.className = "entry-edit";
  edit.type = "button";
  edit.setAttribute("aria-label", "Edit booking");
  edit.textContent = "✎";
  edit.addEventListener("click", () => startEdit(entry.id));

  const del = document.createElement("button");
  del.className = "entry-del";
  del.type = "button";
  del.setAttribute("aria-label", "Delete booking");
  del.textContent = "×";
  del.addEventListener("click", () => onDelete(entry.id));

  actions.appendChild(edit);
  actions.appendChild(del);

  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

/* ------------------------------ List actions ----------------------------- */

async function onDelete(id) {
  if (!currentUser) return;
  try {
    await deleteEntry(currentUser.uid, id);
  } catch (err) {
    console.error("Failed to delete booking", err);
    toast("Could not delete.");
    return;
  }
  if (editingId === id) cancelEdit(); // the open edit target is gone
}

async function onClear() {
  if (!currentUser) return;
  if (!entriesCache.length) {
    toast("Nothing to clear.");
    return;
  }
  if (!confirm(`Delete all ${entriesCache.length} bookings? This cannot be undone.`)) return;
  try {
    await Promise.all(entriesCache.map((e) => deleteEntry(currentUser.uid, e.id)));
  } catch (err) {
    console.error("Failed to clear bookings", err);
    toast("Could not clear.");
    return;
  }
  if (editingId) cancelEdit();
  toast("All bookings deleted");
}

async function onExport() {
  if (!entriesCache.length) {
    toast("Nothing to export yet.");
    return;
  }
  const entries = [...entriesCache].sort((a, b) => (a.savedAt < b.savedAt ? -1 : 1)); // oldest first

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

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const register = () =>
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

async function init() {
  registerServiceWorker();

  renderCategoryButtons();
  renderCategoryOptions();
  document.getElementById("edit-form").addEventListener("submit", onEditSubmit);
  document.getElementById("edit-cancel").addEventListener("click", cancelEdit);
  document.getElementById("export-btn").addEventListener("click", onExport);
  document.getElementById("clear-btn").addEventListener("click", onClear);
  document.getElementById("signin-form").addEventListener("submit", onSendLink);
  document.getElementById("signout-btn").addEventListener("click", onSignOut);
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  }

  // Ask the browser to keep our data, reducing the chance of automatic eviction.
  if (navigator.storage && navigator.storage.persist) {
    try {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch {
      /* best-effort only */
    }
  }

  // React to sign-in/out, then finish any pending email-link sign-in.
  onAuthStateChanged(auth, handleAuthState);
  await completeEmailLinkIfPresent();
}

init();
