import React, { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";
import {
  Search, Bell, ChevronDown, ChevronRight, ChevronLeft,
  Trash2, Loader2, Plus, Circle, CircleDot, CheckCircle2, Pencil, ListChecks,
  List as ListIcon, Flag, Calendar as CalendarIcon, ChevronsDown, ChevronsUp, X,
  RefreshCw, Cloud, Download, Upload, Settings, Lock, Unlock,
} from "lucide-react";

// ---------- Supabase ----------
// Project "task-app", created for this app. The anon key is meant to be
// public — it's restricted by the row-level security policy on app_data
// (each row is scoped to auth.uid(), see the SQL migration).
const SUPABASE_URL = "https://ezbhodcepwpoxehlaejp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6YmhvZGNlcHdwb3hlaGxhZWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MjIxMDksImV4cCI6MjEwNDQ5ODEwOX0.mnFrUb0bOj_WAQ1fTPDp-8mkuCwwLVVaIRbYSJ8r5eA";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- client-side encryption (Web Crypto API) ----------
// Zero-knowledge: the passphrase and the derived key never leave this
// browser. Supabase only ever stores { salt, iv, ciphertext } — random-
// looking bytes it cannot make sense of. PBKDF2-SHA256 with a high
// iteration count derives an AES-256-GCM key from the passphrase; GCM's
// auth tag also means a wrong passphrase fails loudly (decrypt throws)
// instead of silently returning garbage.
const PBKDF2_ITERATIONS = 310000;

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function bytesToB64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKeyFromPassphrase(passphrase, saltB64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPayload(key, obj) {
  const iv = randomBytes(12);
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(new Uint8Array(ciphertextBuf)) };
}

async function decryptPayload(key, envelope) {
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(envelope.iv) },
    key,
    b64ToBytes(envelope.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// ---------- constants ----------

const PALETTE = ["#4C8DFF", "#34D399", "#A78BFA", "#FB923C", "#F0554B", "#2DD4BF", "#F5C451", "#F472B6", "#60A5FA", "#84CC16"];

const PRIORITIES = ["Baja", "Media", "Alta"];
const STATUSES = ["Por hacer", "Haciendo", "Hecho"];

const STATUS_ICON = {
  "Por hacer": Circle,
  "Haciendo": CircleDot,
  "Hecho": CheckCircle2,
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAY_FULL_BY_JSDAY = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ---------- generic helpers ----------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nextColor(areas) {
  return PALETTE[areas.length % PALETTE.length];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoOf(y, m, d) {
  // m is 0-indexed
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

function dateToISOLocal(d) {
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

function todayISO() {
  return dateToISOLocal(new Date());
}

function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function isOverdue(iso, status) {
  if (!iso || status === "Hecho") return false;
  return iso < todayISO();
}

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateToISOLocal(dt);
}

function weekdayFullOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAY_FULL_BY_JSDAY[new Date(y, m - 1, d).getDay()];
}

function buildMonthGrid(year, month) {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ iso: isoOf(y, m, d), day: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoOf(year, month, d), day: d, inMonth: true });
  }
  let nextDay = 1;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  while (cells.length % 7 !== 0) {
    cells.push({ iso: isoOf(nextYear, nextMonth, nextDay), day: nextDay, inMonth: false });
    nextDay++;
  }
  return cells;
}

function buildWeekDays(anchorIso) {
  const [y, m, d] = anchorIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - dow);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    days.push({ iso: dateToISOLocal(cur), day: cur.getDate() });
  }
  return days;
}

// ---------- local (no-AI) free-text parser ----------

const PRIORITY_KEYWORDS = {
  Alta: ["urgente", "rápido", "rapido", "alta prioridad", "prioridad alta", "alta"],
  Baja: ["baja prioridad", "prioridad baja", "baja"],
  Media: ["media prioridad", "prioridad media", "media"],
};

const WEEKDAY_WORDS = [
  { dow: 0, words: ["domingo"] },
  { dow: 1, words: ["lunes"] },
  { dow: 2, words: ["martes"] },
  { dow: 3, words: ["miércoles", "miercoles"] },
  { dow: 4, words: ["jueves"] },
  { dow: 5, words: ["viernes"] },
  { dow: 6, words: ["sábado", "sabado"] },
];

function stripPhrase(text, phrase) {
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return null;
  return text.slice(0, idx) + text.slice(idx + phrase.length);
}

function cleanTitle(text, fallback) {
  const cleaned = text
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.\-:;]+|[\s,.\-:;]+$/g, "")
    .trim();
  const base = cleaned || fallback.trim();
  if (!base) return "Tarea sin título";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function nextDow(base, dow) {
  const diff = (dow - base.getDay() + 7) % 7;
  const d = new Date(base);
  d.setDate(d.getDate() + diff);
  return d;
}

function parseFragmentDate(text, today) {
  let remaining = text;

  const explicit = remaining.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (explicit) {
    const day = parseInt(explicit[1], 10);
    const month = parseInt(explicit[2], 10);
    let year = explicit[3] ? parseInt(explicit[3], 10) : today.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const iso = `${year}-${pad2(month)}-${pad2(day)}`;
      const stripped = remaining.slice(0, explicit.index) + remaining.slice(explicit.index + explicit[0].length);
      return { date: iso, text: stripped };
    }
  }

  const phrases = [
    { phrase: "pasado mañana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)) },
    { phrase: "pasado manana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)) },
    { phrase: "hoy", get: () => dateToISOLocal(today) },
    { phrase: "mañana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) },
    { phrase: "manana", get: () => dateToISOLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) },
    { phrase: "fin de semana", get: () => dateToISOLocal(nextDow(today, 6)) },
    { phrase: "finde", get: () => dateToISOLocal(nextDow(today, 6)) },
  ];
  for (const p of phrases) {
    const stripped = stripPhrase(remaining, p.phrase);
    if (stripped !== null) return { date: p.get(), text: stripped };
  }

  for (const wd of WEEKDAY_WORDS) {
    for (const w of wd.words) {
      const stripped = stripPhrase(remaining, `el ${w}`);
      if (stripped !== null) return { date: dateToISOLocal(nextDow(today, wd.dow)), text: stripped };
    }
    for (const w of wd.words) {
      const stripped = stripPhrase(remaining, w);
      if (stripped !== null) return { date: dateToISOLocal(nextDow(today, wd.dow)), text: stripped };
    }
  }

  return { date: null, text: remaining };
}

function parseFragmentPriority(text) {
  let remaining = text;
  for (const level of Object.keys(PRIORITY_KEYWORDS)) {
    for (const w of PRIORITY_KEYWORDS[level]) {
      const stripped = stripPhrase(remaining, w);
      if (stripped !== null) return { priority: level, text: stripped };
    }
  }
  return { priority: "Media", text: remaining };
}

function parseFragmentAreaProject(text, areas, selectedAreaId, selectedProjectId) {
  const remaining = text;

  if (selectedAreaId !== "all") {
    const area = areas.find((a) => a.id === selectedAreaId);
    if (!area) return { areaId: null, projectId: null, text: remaining };
    if (selectedProjectId) return { areaId: area.id, projectId: selectedProjectId, text: remaining };
    let best = null;
    (area.projects || []).forEach((p) => {
      const stripped = stripPhrase(remaining, p.name);
      if (stripped !== null && (!best || p.name.length > best.len)) best = { id: p.id, len: p.name.length, stripped };
    });
    if (best) return { areaId: area.id, projectId: best.id, text: best.stripped };
    return { areaId: area.id, projectId: null, text: remaining };
  }

  let best = null;
  areas.forEach((a) => {
    (a.projects || []).forEach((p) => {
      const stripped = stripPhrase(remaining, p.name);
      if (stripped !== null && (!best || p.name.length > best.len)) {
        best = { areaId: a.id, projectId: p.id, len: p.name.length, stripped };
      }
    });
  });
  if (!best) {
    areas.forEach((a) => {
      const stripped = stripPhrase(remaining, a.name);
      if (stripped !== null && (!best || a.name.length > best.len)) {
        best = { areaId: a.id, projectId: null, len: a.name.length, stripped };
      }
    });
  }
  if (best) return { areaId: best.areaId, projectId: best.projectId, text: best.stripped };
  return { areaId: null, projectId: null, text: remaining };
}

function parseFreeTextLocal(rawText, { areas, selectedAreaId, selectedProjectId }) {
  const today = new Date();
  const fragments = rawText.split(/\n|,/).map((f) => f.trim()).filter(Boolean);

  return fragments.map((fragment) => {
    let working = fragment;
    const dateResult = parseFragmentDate(working, today);
    working = dateResult.text;
    const priorityResult = parseFragmentPriority(working);
    working = priorityResult.text;
    const areaResult = parseFragmentAreaProject(working, areas, selectedAreaId, selectedProjectId);
    working = areaResult.text;
    return {
      title: cleanTitle(working, fragment),
      date: dateResult.date,
      priority: priorityResult.priority,
      areaId: areaResult.areaId,
      projectId: areaResult.projectId,
      note: "",
    };
  });
}

// ---------- seed data ----------
// Empty by default so you can test creating areas, projects and tasks from scratch.

const seedAreas = [];

const BOOT_STYLES = `
  .boot-screen {
    --bg: #0c0e11; --surface: #14171b; --surface-2: #191d22; --border: #262a30;
    --text: #e9ebee; --text-dim: #8d94a0; --text-faint: #565d68; --amber: #e8a33d; --alta: #f0554b; --blue: #4c8dff;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); display: flex; align-items: center; justify-content: center;
    height: 100vh; min-height: 480px; border-radius: 12px; border: 1px solid var(--border);
  }
  .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
  .boot-msg { color: var(--text-faint); font-size: 14px; }

  .auth-card { width: 340px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 28px; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 16.5px; color: var(--text); margin-bottom: 20px; }
  .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px rgba(232,163,61,0.15); }

  .auth-divider { display: flex; align-items: center; gap: 10px; margin: 18px 0; color: var(--text-faint); font-size: 11.5px; }
  .auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: var(--border); }

  .auth-input {
    width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 12px; color: var(--text); font-size: 14px; outline: none; margin-bottom: 10px;
  }
  .auth-input:focus { border-color: rgba(232,163,61,0.5); }
  .auth-error { font-size: 12.5px; color: var(--alta); margin-bottom: 10px; line-height: 1.5; }
  .auth-notice { font-size: 12.5px; color: var(--blue); margin-bottom: 10px; line-height: 1.5; }

  .auth-btn {
    width: 100%; background: var(--amber); color: #1b1304; border: none; border-radius: 9px;
    padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer;
  }
  .auth-btn:hover { filter: brightness(1.08); }
  .auth-btn:disabled { opacity: 0.6; cursor: default; }

  .auth-switch { width: 100%; background: none; border: none; color: var(--text-dim); font-size: 12.5px; padding: 12px 0 0; cursor: pointer; }
  .auth-switch:hover { color: var(--text); }

  .auth-guest-btn {
    width: 100%; padding: 10px; border-radius: 9px; border: 1px dashed var(--border); background: none;
    color: var(--text-dim); font-size: 13px; cursor: pointer;
  }
  .auth-guest-btn:hover { color: var(--text); border-color: var(--text-faint); }
  .auth-guest-hint { font-size: 11px; color: var(--text-faint); text-align: center; margin-top: 8px; line-height: 1.4; }
  .modal-text { font-size: 13px; color: var(--text-dim); line-height: 1.55; }
`;

const seedTasks = [];

// ---------- UI atoms ----------

function IconBtn({ icon: Icon, label, onClick, active }) {
  return (
    <button className={`iconbtn ${active ? "iconbtn--active" : ""}`} onClick={onClick} title={label}>
      <Icon size={15} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

function PriorityBadge({ value, onClick }) {
  return (
    <button className={`badge badge--priority badge--${value}`} onClick={onClick}>
      {value}
    </button>
  );
}

function StatusPill({ value, onClick }) {
  const Icon = STATUS_ICON[value];
  return (
    <button className={`pill pill--${value.replace(" ", "")}`} onClick={onClick}>
      <Icon size={13} strokeWidth={2.2} />
      {value}
    </button>
  );
}

function DateField({ value, onChange, overdue }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const [cursor, setCursor] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  const POP_W = 220;
  const POP_H = 300;

  function openPicker() {
    const rect = btnRef.current.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + POP_W > window.innerWidth - 8) left = window.innerWidth - POP_W - 8;
    if (left < 8) left = 8;
    if (top + POP_H > window.innerHeight - 8) top = rect.top - POP_H - 6;
    if (top < 8) top = 8;
    setPos({ top, left });
    setOpen(true);
  }

  function changeMonth(delta) {
    setCursor((c) => {
      let month = c.month + delta, year = c.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  }

  function pick(iso) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <span className="datefield">
      <button
        ref={btnRef}
        type="button"
        className={`datefield-btn ${!value ? "datefield-btn--empty" : ""} ${overdue ? "datefield-btn--overdue" : ""}`}
        onClick={openPicker}
      >
        {value ? fmtDate(value) : "dd/mm/aaaa"}
      </button>
      {open && pos && createPortal(
        <>
          <div className="popover-scrim" onClick={() => setOpen(false)} />
          <div className="datefield-pop" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
            <div className="datefield-pop-head">
              <button type="button" className="cal-nav-btn" onClick={() => changeMonth(-1)}><ChevronLeft size={13} /></button>
              <span className="datefield-pop-label">{MONTH_LABELS[cursor.month]} {cursor.year}</span>
              <button type="button" className="cal-nav-btn" onClick={() => changeMonth(1)}><ChevronRight size={13} /></button>
            </div>
            <div className="datefield-grid">
              {WEEKDAY_LABELS.map((w) => <div key={w} className="datefield-wd">{w[0]}</div>)}
              {grid.map((cell) => (
                <button
                  type="button"
                  key={cell.iso}
                  className={`datefield-day ${!cell.inMonth ? "datefield-day--out" : ""} ${cell.iso === value ? "datefield-day--selected" : ""} ${cell.iso === todayISO() ? "datefield-day--today" : ""}`}
                  onClick={() => pick(cell.iso)}
                >
                  {cell.day}
                </button>
              ))}
            </div>
            <div className="datefield-pop-actions">
              <button type="button" className="datefield-action" onClick={() => pick(todayISO())}>Hoy</button>
              <button type="button" className="datefield-action" onClick={() => pick(null)}>Limpiar</button>
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  );
}

function QuickAddRow({ placeholder, onAdd, indent }) {
  return (
    <div className={`quick-add-row ${indent ? "quick-add-row--indent" : ""}`}>
      <Plus size={12} className="quick-add-icon" />
      <input
        type="text"
        className="quick-add-input"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onAdd(e.target.value);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

// ---------- main component ----------

export default function TaskTracker() {
  const [areas, setAreas] = useState(seedAreas);
  const [tasks, setTasks] = useState(seedTasks);

  // ---- auth ----
  const [session, setSession] = useState(null);
  const [authView, setAuthView] = useState("login"); // login | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState("");

  // ---- client-side (zero-knowledge) encryption ----
  const encryptionKeyRef = useRef(null); // CryptoKey, in-memory only, never persisted
  const encSaltRef = useRef(null); // this user's salt (not secret, just needs to stay consistent)
  const pendingEnvelopeRef = useRef(null); // fetched {salt,iv,ciphertext} while waiting to unlock
  const [encPass, setEncPass] = useState("");
  const [encPass2, setEncPass2] = useState("");
  const [encError, setEncError] = useState("");
  const [encBusy, setEncBusy] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [showEncSettings, setShowEncSettings] = useState(false);
  const [encSettingsView, setEncSettingsView] = useState("status"); // status | disable-confirm | enable

  // ---- Supabase persistence (direct, real-time) ----
  const [bootStatus, setBootStatus] = useState("checking-session"); // checking-session | auth | loading | ready
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const hasLoadedRef = useRef(false);
  const lastAppliedUpdatedAtRef = useRef(0);

  const [selectedAreaId, setSelectedAreaId] = useState("all");
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("texto");
  const [freeText, setFreeText] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingTitleId, setEditingTitleId] = useState(null);

  const [manualTitle, setManualTitle] = useState("");
  const [manualArea, setManualArea] = useState("");
  const [manualProjectId, setManualProjectId] = useState("");
  const [toast, setToast] = useState("");

  const [renamingAreaId, setRenamingAreaId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [addingArea, setAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [colorPickerAreaId, setColorPickerAreaId] = useState(null);
  const [expandedAreas, setExpandedAreas] = useState({});

  const [addingProjectAreaId, setAddingProjectAreaId] = useState(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [renameProjectAreaId, setRenameProjectAreaId] = useState(null);
  const [renameProjectValue, setRenameProjectValue] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState({});
  const [panelAddingProjectAreaId, setPanelAddingProjectAreaId] = useState(null);
  const [panelNewProjectName, setPanelNewProjectName] = useState("");
  const [panelAddingArea, setPanelAddingArea] = useState(false);
  const [panelNewAreaName, setPanelNewAreaName] = useState("");

  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [urgentIndex, setUrgentIndex] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const restoreInputRef = useRef(null);

  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'area'|'project', id, areaId? }

  const [view, setView] = useState("lista");
  const [calView, setCalView] = useState("mes");
  const [calCursor, setCalCursor] = useState(() => {
    const t = new Date();
    return { year: t.getFullYear(), month: t.getMonth() };
  });
  const [weekAnchor, setWeekAnchor] = useState(todayISO());
  const [dayAnchor, setDayAnchor] = useState(todayISO());
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [dayQuickTitle, setDayQuickTitle] = useState("");

  const noteInputRef = useRef(null);
  const newAreaInputRef = useRef(null);
  const renameInputRef = useRef(null);
  const newProjectInputRef = useRef(null);
  const renameProjectInputRef = useRef(null);
  const panelNewProjectInputRef = useRef(null);
  const panelNewAreaInputRef = useRef(null);

  // ---- auth: watch the session; load/reset app data whenever it changes ----
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setBootStatus(data.session ? "loading" : "auth");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        hasLoadedRef.current = false;
        encryptionKeyRef.current = null;
        encSaltRef.current = null;
        pendingEnvelopeRef.current = null;
        setEncPass(""); setEncPass2(""); setEncError("");
        setAreas([]);
        setTasks([]);
        setBootStatus("auth");
      } else if (bootStatus !== "ready" || !hasLoadedRef.current) {
        setBootStatus("loading");
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- load current data for this user, then stay live via realtime ----
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const userId = session.user.id;

    async function load() {
      const { data: row, error } = await supabase
        .from("app_data")
        .select("data,updated_at")
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error(error);
        showToast("No se pudo conectar con Supabase");
        return;
      }
      if (!row) {
        // Brand new user: start unencrypted, ready right away. Encryption is
        // opt-in from the lock icon, never forced up front.
        lastAppliedUpdatedAtRef.current = 0;
        setLastSyncAt(null);
        setAreas([]);
        setTasks([]);
        setIsEncrypted(false);
        hasLoadedRef.current = true;
        setBootStatus("ready");
        return;
      }
      lastAppliedUpdatedAtRef.current = new Date(row.updated_at).getTime();
      setLastSyncAt(new Date(row.updated_at).getTime());
      if (row.data && row.data.encrypted) {
        pendingEnvelopeRef.current = row.data;
        setBootStatus("enc-unlock");
      } else {
        // Not encrypted (new user's later saves, or a legacy row from before
        // this feature existed) — just load it straight in.
        setAreas((row.data && row.data.areas) || []);
        setTasks((row.data && row.data.tasks) || []);
        setIsEncrypted(false);
        hasLoadedRef.current = true;
        setBootStatus("ready");
      }
    }
    load();

    const channel = supabase
      .channel(`app_data_changes_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_data", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new;
          if (!row || !row.updated_at) return;
          const updatedAt = new Date(row.updated_at).getTime();
          if (updatedAt <= lastAppliedUpdatedAtRef.current) return; // our own echo or stale
          lastAppliedUpdatedAtRef.current = updatedAt;
          if (!row.data || !row.data.encrypted) {
            setAreas((row.data && row.data.areas) || []);
            setTasks((row.data && row.data.tasks) || []);
            setLastSyncAt(updatedAt);
            return;
          }
          if (!encryptionKeyRef.current) return; // still locked; will pick up latest on unlock instead
          decryptPayload(encryptionKeyRef.current, row.data)
            .then((data) => {
              setAreas(data.areas || []);
              setTasks(data.tasks || []);
              setLastSyncAt(updatedAt);
            })
            .catch(() => { /* wrong-session key vs. newer envelope; ignore, next unlock will resync */ });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session]);

  async function handleEncSetup() {
    setEncError("");
    if (encPass.length < 8) { setEncError("Usá al menos 8 caracteres."); return; }
    if (encPass !== encPass2) { setEncError("Las contraseñas no coinciden."); return; }
    if (!window.isSecureContext || !window.crypto?.subtle) {
      setEncError("El cifrado necesita HTTPS (o localhost). Esta página no cumple ese requisito.");
      return;
    }
    setEncBusy(true);
    try {
      const salt = bytesToB64(randomBytes(16));
      const key = await deriveKeyFromPassphrase(encPass, salt);
      const envelope = await encryptPayload(key, { areas, tasks });
      const updatedAt = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("app_data")
        .upsert({ user_id: session.user.id, data: { encrypted: true, salt, ...envelope }, updated_at: updatedAt }, { onConflict: "user_id" })
        .select("updated_at")
        .single();
      if (error) throw error;
      encryptionKeyRef.current = key;
      encSaltRef.current = salt;
      lastAppliedUpdatedAtRef.current = new Date(row.updated_at).getTime();
      setLastSyncAt(new Date(row.updated_at).getTime());
      setEncPass(""); setEncPass2("");
      setIsEncrypted(true);
      setShowEncSettings(false);
      setEncSettingsView("status");
      hasLoadedRef.current = true;
      setBootStatus("ready");
      showToast("Cifrado activado");
    } catch (err) {
      console.error("handleEncSetup", err);
      setEncError("No se pudo activar el cifrado: " + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  async function handleEncUnlock() {
    setEncError("");
    if (!encPass) { setEncError("Ingresá tu contraseña de cifrado."); return; }
    setEncBusy(true);
    try {
      const envelope = pendingEnvelopeRef.current;
      const key = await deriveKeyFromPassphrase(encPass, envelope.salt);
      const data = await decryptPayload(key, envelope);
      encryptionKeyRef.current = key;
      encSaltRef.current = envelope.salt;
      setAreas(data.areas || []);
      setTasks(data.tasks || []);
      setEncPass("");
      setIsEncrypted(true);
      hasLoadedRef.current = true;
      setBootStatus("ready");
    } catch (err) {
      console.error("handleEncUnlock", err);
      setEncError(err?.name === "OperationError" ? "Contraseña incorrecta." : "No se pudo desbloquear: " + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  async function handleDisableEncryption() {
    setEncError("");
    if (!encPass) { setEncError("Ingresá tu contraseña de cifrado actual."); return; }
    setEncBusy(true);
    try {
      // Verify the entered passphrase against what's actually stored — not just
      // trusting the in-memory key — so disabling requires proving you have it.
      const { data: row, error: fetchErr } = await supabase.from("app_data").select("data").maybeSingle();
      if (fetchErr || !row) throw new Error("no-row");
      const testKey = await deriveKeyFromPassphrase(encPass, row.data.salt);
      await decryptPayload(testKey, row.data); // throws if the passphrase is wrong

      const updatedAt = new Date().toISOString();
      const { data: savedRow, error } = await supabase
        .from("app_data")
        .upsert({ user_id: session.user.id, data: { encrypted: false, areas, tasks }, updated_at: updatedAt }, { onConflict: "user_id" })
        .select("updated_at")
        .single();
      if (error) throw error;

      encryptionKeyRef.current = null;
      encSaltRef.current = null;
      lastAppliedUpdatedAtRef.current = new Date(savedRow.updated_at).getTime();
      setLastSyncAt(new Date(savedRow.updated_at).getTime());
      setIsEncrypted(false);
      setEncPass("");
      setShowEncSettings(false);
      setEncSettingsView("status");
      showToast("Cifrado desactivado");
    } catch (err) {
      console.error("handleDisableEncryption", err);
      setEncError(err?.name === "OperationError" ? "Contraseña incorrecta." : "No se pudo desactivar: " + String(err.message || err));
    } finally {
      setEncBusy(false);
    }
  }

  function closeEncSettings() {
    setShowEncSettings(false);
    setEncSettingsView("status");
    setEncPass(""); setEncPass2(""); setEncError("");
  }

  // ---- autosave (debounced); encrypts client-side first only if encryption is on ----
  useEffect(() => {
    if (!session || !hasLoadedRef.current || bootStatus !== "ready") return;
    const id = setTimeout(async () => {
      setSaving(true);
      const updatedAt = new Date().toISOString();
      const dataToSave = encryptionKeyRef.current
        ? { encrypted: true, salt: encSaltRef.current, ...(await encryptPayload(encryptionKeyRef.current, { areas, tasks })) }
        : { encrypted: false, areas, tasks };
      const { data: row, error } = await supabase
        .from("app_data")
        .upsert({ user_id: session.user.id, data: dataToSave, updated_at: updatedAt }, { onConflict: "user_id" })
        .select("updated_at")
        .single();
      setSaving(false);
      if (!error && row) {
        lastAppliedUpdatedAtRef.current = new Date(row.updated_at).getTime();
        setLastSyncAt(new Date(row.updated_at).getTime());
      }
    }, 600);
    return () => clearTimeout(id);
  }, [areas, tasks, bootStatus, session]);

  async function handleEmailSignIn() {
    setAuthError(""); setAuthNotice("");
    if (!authEmail.trim() || !authPassword) { setAuthError("Completá email y contraseña."); return; }
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  }

  async function handleEmailSignUp() {
    setAuthError(""); setAuthNotice("");
    if (!authEmail.trim() || !authPassword) { setAuthError("Completá email y contraseña."); return; }
    if (authPassword.length < 6) { setAuthError("La contraseña necesita al menos 6 caracteres."); return; }
    setAuthBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword });
    setAuthBusy(false);
    if (error) { setAuthError(error.message); return; }
    if (data.session) return; // confirmación de email desactivada: ya quedó logueado
    setAuthNotice("Te mandamos un mail para confirmar la cuenta — revisá tu bandeja de entrada.");
  }

  async function handleGuestLogin() {
    setAuthError(""); setAuthNotice("");
    setAuthBusy(true);
    const { error } = await supabase.auth.signInAnonymously();
    setAuthBusy(false);
    if (error) setAuthError("No se pudo entrar como invitado — el proyecto necesita tener 'Anonymous sign-ins' activado en Supabase.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  useEffect(() => {
    if (manualArea && !areas.some((a) => a.id === manualArea)) setManualArea("");
  }, [areas]);

  useEffect(() => { setManualProjectId(selectedProjectId || ""); }, [selectedAreaId, selectedProjectId]);

  useEffect(() => { if (addingArea) newAreaInputRef.current?.focus(); }, [addingArea]);
  useEffect(() => {
    if (renamingAreaId) { renameInputRef.current?.focus(); renameInputRef.current?.select(); }
  }, [renamingAreaId]);
  useEffect(() => { if (addingProjectAreaId) newProjectInputRef.current?.focus(); }, [addingProjectAreaId]);
  useEffect(() => { if (panelAddingProjectAreaId) panelNewProjectInputRef.current?.focus(); }, [panelAddingProjectAreaId]);
  useEffect(() => { if (panelAddingArea) panelNewAreaInputRef.current?.focus(); }, [panelAddingArea]);
  useEffect(() => {
    if (renamingProjectId) { renameProjectInputRef.current?.focus(); renameProjectInputRef.current?.select(); }
  }, [renamingProjectId]);

  const areaMap = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);

  function isGeneralArea(area) {
    return !!area && area.name.trim().toLowerCase() === "general";
  }

  const orderedAreas = useMemo(() => {
    return [...areas].sort((a, b) => (isGeneralArea(a) ? 1 : 0) - (isGeneralArea(b) ? 1 : 0));
  }, [areas]);

  const pendientes = tasks.filter((t) => t.status !== "Hecho").length;
  const vencidas = tasks.filter((t) => isOverdue(t.date, t.status)).length;

  const areaCounts = useMemo(() => {
    const map = {};
    areas.forEach((a) => (map[a.id] = 0));
    tasks.forEach((t) => { if (t.status !== "Hecho") map[t.areaId] = (map[t.areaId] || 0) + 1; });
    return map;
  }, [tasks, areas]);

  const projectCounts = useMemo(() => {
    const map = {};
    tasks.forEach((t) => { if (t.projectId && t.status !== "Hecho") map[t.projectId] = (map[t.projectId] || 0) + 1; });
    return map;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedAreaId !== "all" && t.areaId !== selectedAreaId) return false;
      if (selectedAreaId !== "all" && selectedProjectId && t.projectId !== selectedProjectId) return false;
      if (hideCompleted && t.status === "Hecho") return false;
      if (search.trim() && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, selectedAreaId, selectedProjectId, hideCompleted, search]);

  const grouped = useMemo(() => {
    const byArea = {};
    visibleTasks.forEach((t) => {
      if (!byArea[t.areaId]) byArea[t.areaId] = [];
      byArea[t.areaId].push(t);
    });
    const relevantAreas = selectedAreaId === "all" ? orderedAreas : orderedAreas.filter((a) => a.id === selectedAreaId);
    return relevantAreas.map((a) => {
      const allTasks = byArea[a.id] || [];
      const byProject = {};
      const noProject = [];
      allTasks.forEach((t) => {
        if (t.projectId) {
          if (!byProject[t.projectId]) byProject[t.projectId] = [];
          byProject[t.projectId].push(t);
        } else {
          noProject.push(t);
        }
      });
      const projectGroups = (a.projects || []).map((p) => ({ project: p, tasks: byProject[p.id] || [] }));
      return { area: a, allTasks, noProject, projectGroups };
    });
  }, [visibleTasks, orderedAreas, selectedAreaId]);

  const groupedByPriority = useMemo(() => {
    const buckets = { Alta: [], Media: [], Baja: [] };
    visibleTasks.forEach((t) => { (buckets[t.priority] || buckets.Media).push(t); });
    return ["Alta", "Media", "Baja"].map((priority) => ({ priority, tasks: buckets[priority] }));
  }, [visibleTasks]);

  const urgentItems = useMemo(() => {
    const today = todayISO();
    const tomorrow = addDaysISO(today, 1);
    const items = [];
    tasks.forEach((t) => { if (t.status !== "Hecho" && t.date && t.date < today) items.push({ task: t, kind: "vencida", label: "Vencida" }); });
    tasks.forEach((t) => { if (t.status !== "Hecho" && t.date === today) items.push({ task: t, kind: "hoy", label: "Hoy" }); });
    tasks.forEach((t) => { if (t.status !== "Hecho" && t.date === tomorrow) items.push({ task: t, kind: "manana", label: "Mañana" }); });
    return items;
  }, [tasks]);

  useEffect(() => {
    if (urgentItems.length === 0) return;
    setUrgentIndex((i) => (i >= urgentItems.length ? 0 : i));
    const id = setInterval(() => setUrgentIndex((i) => (i + 1) % urgentItems.length), 4000);
    return () => clearInterval(id);
  }, [urgentItems.length]);

  function fireUrgentNotification() {
    if (!notificationsEnabled || typeof Notification === "undefined") return;
    if (urgentItems.length === 0) return;
    const vencidas = urgentItems.filter((i) => i.kind === "vencida").length;
    const hoy = urgentItems.filter((i) => i.kind === "hoy").length;
    const manana = urgentItems.filter((i) => i.kind === "manana").length;
    const parts = [];
    if (vencidas) parts.push(`${vencidas} vencida${vencidas === 1 ? "" : "s"}`);
    if (hoy) parts.push(`${hoy} para hoy`);
    if (manana) parts.push(`${manana} para mañana`);
    try {
      new Notification("Task Tracker", { body: `Tenés ${parts.join(", ")}.`, silent: false });
    } catch { /* not available outside Electron/a notification-capable browser */ }
  }

  useEffect(() => {
    if (!notificationsEnabled) return;
    fireUrgentNotification();
    const id = setInterval(fireUrgentNotification, 60 * 60 * 1000); // cada hora
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsEnabled]);

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (!t.date) return;
      if (selectedAreaId !== "all" && t.areaId !== selectedAreaId) return;
      if (selectedAreaId !== "all" && selectedProjectId && t.projectId !== selectedProjectId) return;
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    return map;
  }, [tasks, selectedAreaId, selectedProjectId]);

  const monthGrid = useMemo(() => buildMonthGrid(calCursor.year, calCursor.month), [calCursor]);
  const weekDays = useMemo(() => buildWeekDays(weekAnchor), [weekAnchor]);
  const focusedDate = calView === "dia" ? dayAnchor : selectedDay;

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ areas, tasks }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tasktracker_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Backup descargado");
  }

  function restoreData(evt) {
    const file = evt.target.files[0];
    evt.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let data;
      try { data = JSON.parse(e.target.result); } catch (err) { showToast("Archivo inválido"); return; }
      if (!Array.isArray(data.areas) || !Array.isArray(data.tasks)) { showToast("El archivo no tiene el formato esperado"); return; }
      setAreas(data.areas);
      setTasks(data.tasks);
      showToast("Datos restaurados");
    };
    reader.readAsText(file);
  }

  function wipeAllData() {
    setAreas([]);
    setTasks([]);
    setConfirmingWipe(false);
    showToast("Todo borrado");
  }

  function selectArea(id) {
    setSelectedAreaId(id);
    setSelectedProjectId(null);
  }

  function ensureArea(name) {
    const clean = name.trim();
    const existing = areas.find((a) => a.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing.id;
    const id = uid();
    setAreas((prev) => [...prev, { id, name: clean, color: nextColor(prev), projects: [] }]);
    return id;
  }

  function handleProcesar() {
    if (!freeText.trim()) return;
    const items = parseFreeTextLocal(freeText, { areas, selectedAreaId, selectedProjectId });
    setAreas((currentAreas) => {
      let workingAreas = currentAreas;
      function resolveAreaId(id) {
        if (id) return id;
        const existing = workingAreas.find((a) => a.name.toLowerCase() === "general");
        if (existing) return existing.id;
        const newId = uid();
        workingAreas = [...workingAreas, { id: newId, name: "General", color: nextColor(workingAreas), projects: [] }];
        return newId;
      }
      const newTasks = items.map((it) => ({
        id: uid(),
        areaId: resolveAreaId(it.areaId),
        projectId: it.projectId || null,
        title: it.title,
        note: "",
        status: "Por hacer",
        priority: it.priority,
        date: it.date,
      }));
      setTasks((prev) => [...newTasks, ...prev]);
      showToast(`${newTasks.length} tarea${newTasks.length === 1 ? "" : "s"} creada${newTasks.length === 1 ? "" : "s"}`);
      return workingAreas;
    });
    setFreeText("");
  }

  function addManualTask() {
    if (!manualTitle.trim()) return;
    const areaId = selectedAreaId !== "all" ? selectedAreaId : (manualArea || ensureArea("General"));
    const projectId = selectedAreaId !== "all" ? (manualProjectId || null) : null;
    setTasks((prev) => [
      { id: uid(), areaId, projectId, title: manualTitle.trim(), note: "", status: "Por hacer", priority: "Media", date: null },
      ...prev,
    ]);
    setManualTitle("");
    setManualProjectId("");
    showToast("Tarea creada");
  }

  function addTaskForFocusedDay() {
    if (!dayQuickTitle.trim()) return;
    const areaId = selectedAreaId !== "all" ? selectedAreaId : (manualArea || ensureArea("General"));
    const projectId = selectedAreaId !== "all" ? (manualProjectId || null) : null;
    setTasks((prev) => [
      { id: uid(), areaId, projectId, title: dayQuickTitle.trim(), note: "", status: "Por hacer", priority: "Media", date: focusedDate },
      ...prev,
    ]);
    setDayQuickTitle("");
    showToast("Tarea creada");
  }

  function cycleStatus(id) {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const i = STATUSES.indexOf(t.status);
      return { ...t, status: STATUSES[(i + 1) % STATUSES.length] };
    }));
  }

  function cyclePriority(id) {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const i = PRIORITIES.indexOf(t.priority);
      return { ...t, priority: PRIORITIES[(i + 1) % PRIORITIES.length] };
    }));
  }

  function setDate(id, date) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, date: date || null } : t)));
  }

  function setNote(id, note) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, note } : t)));
  }

  function commitTaskTitle(id, value) {
    const clean = value.trim();
    if (clean) setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: clean } : t)));
    setEditingTitleId(null);
  }

  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleCollapse(areaId) {
    setCollapsed((prev) => ({ ...prev, [areaId]: !prev[areaId] }));
  }

  function toggleExpand(areaId) {
    setExpandedAreas((prev) => ({ ...prev, [areaId]: !prev[areaId] }));
  }

  function toggleAllProjectsExpanded() {
    const allExpanded = areas.every((a) => expandedAreas[a.id]);
    const next = {};
    areas.forEach((a) => { next[a.id] = !allExpanded; });
    setExpandedAreas(next);
  }

  function createArea() {
    const name = newAreaName.trim();
    if (name) selectArea(ensureArea(name));
    setNewAreaName("");
    setAddingArea(false);
  }

  function createAreaFromPanel() {
    const name = panelNewAreaName.trim();
    if (name) selectArea(ensureArea(name));
    setPanelNewAreaName("");
    setPanelAddingArea(false);
  }

  function handleDropOnTarget(areaId, projectId) {
    if (!draggedTaskId) return;
    setTasks((prev) => prev.map((t) => (t.id === draggedTaskId ? { ...t, areaId, projectId } : t)));
    setDraggedTaskId(null);
    setDragOverKey(null);
  }

  function startRename(area) {
    setRenamingAreaId(area.id);
    setRenameValue(area.name);
  }

  function commitRename() {
    const name = renameValue.trim();
    if (name) setAreas((prev) => prev.map((a) => (a.id === renamingAreaId ? { ...a, name } : a)));
    setRenamingAreaId(null);
  }

  function setAreaColor(id, color) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)));
  }

  function createProjectWithName(areaId, name) {
    const clean = name.trim();
    if (!clean) return;
    setAreas((prev) => prev.map((a) => (
      a.id === areaId ? { ...a, projects: [...(a.projects || []), { id: uid(), name: clean }] } : a
    )));
  }

  function createProject(areaId) {
    createProjectWithName(areaId, newProjectName);
    setNewProjectName("");
    setAddingProjectAreaId(null);
  }

  function createProjectFromPanel(areaId) {
    createProjectWithName(areaId, panelNewProjectName);
    setPanelNewProjectName("");
    setPanelAddingProjectAreaId(null);
  }

  function toggleProjectCollapse(id) {
    setCollapsedProjects((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function addQuickTask(areaId, projectId, title) {
    if (!title.trim()) return;
    setTasks((prev) => [
      { id: uid(), areaId, projectId: projectId || null, title: title.trim(), note: "", status: "Por hacer", priority: "Media", date: null },
      ...prev,
    ]);
    showToast("Tarea creada");
  }

  function startRenameProject(areaId, project) {
    setRenamingProjectId(project.id);
    setRenameProjectAreaId(areaId);
    setRenameProjectValue(project.name);
  }

  function commitRenameProject() {
    const name = renameProjectValue.trim();
    if (name) {
      setAreas((prev) => prev.map((a) => (
        a.id === renameProjectAreaId
          ? { ...a, projects: a.projects.map((p) => (p.id === renamingProjectId ? { ...p, name } : p)) }
          : a
      )));
    }
    setRenamingProjectId(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "area") {
      setTasks((prev) => prev.filter((t) => t.areaId !== deleteTarget.id));
      setAreas((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      if (selectedAreaId === deleteTarget.id) selectArea("all");
      showToast("Área eliminada");
    } else if (deleteTarget.type === "project") {
      setAreas((prev) => prev.map((a) => (
        a.id === deleteTarget.areaId
          ? { ...a, projects: (a.projects || []).filter((p) => p.id !== deleteTarget.id) }
          : a
      )));
      setTasks((prev) => prev.map((t) => (t.projectId === deleteTarget.id ? { ...t, projectId: null } : t)));
      if (selectedProjectId === deleteTarget.id) setSelectedProjectId(null);
      showToast("Proyecto eliminado");
    }
    setDeleteTarget(null);
  }

  function changeMonth(delta) {
    setCalCursor((c) => {
      let month = c.month + delta, year = c.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  }

  function changeWeek(delta) { setWeekAnchor((a) => addDaysISO(a, delta * 7)); }
  function changeDay(delta) { setDayAnchor((a) => addDaysISO(a, delta)); }

  function goToday() {
    const t = todayISO();
    const now = new Date();
    setCalCursor({ year: now.getFullYear(), month: now.getMonth() });
    setWeekAnchor(t);
    setDayAnchor(t);
    setSelectedDay(t);
  }

  function switchCalView(v) {
    if (v === "semana") setWeekAnchor(selectedDay);
    if (v === "dia") setDayAnchor(selectedDay);
    setCalView(v);
  }

  function goPrevNext(dir) {
    if (calView === "mes") changeMonth(dir);
    else if (calView === "semana") changeWeek(dir);
    else changeDay(dir);
  }

  function moveSelectedDay(delta) {
    setSelectedDay((d) => {
      const next = addDaysISO(d, delta);
      const [y, m] = next.split("-").map(Number);
      setCalCursor((c) => (c.year === y && c.month === m - 1 ? c : { year: y, month: m - 1 }));
      return next;
    });
  }

  useEffect(() => {
    if (view !== "calendario" || calView !== "mes") return;
    function handleKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); moveSelectedDay(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveSelectedDay(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveSelectedDay(-7); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveSelectedDay(7); }
      else if (e.key === "PageUp") { e.preventDefault(); changeMonth(-1); }
      else if (e.key === "PageDown") { e.preventDefault(); changeMonth(1); }
      else if (e.key === "Home") { e.preventDefault(); goToday(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [view, calView]);

  function colGroupFor(showArea) {
    return (
      <colgroup>
        <col style={{ width: showArea ? "28%" : "34%" }} />
        {showArea && <col style={{ width: "18%" }} />}
        <col style={{ width: showArea ? "18%" : "26%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "4%" }} />
      </colgroup>
    );
  }

  function renderTaskTable(list, { showArea = false, showHeader = false, indent = false } = {}) {
    return (
      <table>
        {colGroupFor(showArea)}
        {showHeader && (
          <thead>
            <tr>
              <th>Tarea</th>
              {showArea && <th>Área</th>}
              <th className="col-center">Detalle</th>
              <th className="col-center">Estado</th>
              <th className="col-center">Prioridad</th>
              <th className="col-center">Fecha</th>
              <th></th>
            </tr>
          </thead>
        )}
        <tbody>
          {list.map((t) => {
            const taskArea = areaMap[t.areaId];
            const taskProject = t.projectId ? taskArea?.projects?.find((p) => p.id === t.projectId) : null;
            return (
              <tr
                key={t.id}
                draggable={editingTitleId !== t.id && editingNoteId !== t.id}
                className={draggedTaskId === t.id ? "row-dragging" : ""}
                onDragStart={(e) => { setDraggedTaskId(t.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDraggedTaskId(null); setDragOverKey(null); }}
              >
                <td className={indent ? "td-indent" : ""}>
                  {editingTitleId === t.id ? (
                    <input
                      autoFocus
                      className="title-input"
                      defaultValue={t.title}
                      onBlur={(e) => commitTaskTitle(t.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.target.blur();
                        if (e.key === "Escape") setEditingTitleId(null);
                      }}
                    />
                  ) : (
                    <span
                      className={`task-title ${t.status === "Hecho" ? "task-title--done" : ""}`}
                      onDoubleClick={() => setEditingTitleId(t.id)}
                    >
                      {t.title}
                    </span>
                  )}
                </td>
                {showArea && (
                  <td>
                    <span className="area-tag">
                      <span className="area-tag-dot" style={{ background: taskArea?.color || "var(--text-faint)" }} />
                      {taskArea?.name || "—"}{taskProject ? ` · ${taskProject.name}` : ""}
                    </span>
                  </td>
                )}
                <td className="td-detalle">
                  {editingNoteId === t.id ? (
                    <input
                      ref={noteInputRef}
                      autoFocus
                      className="note-input"
                      defaultValue={t.note}
                      onBlur={(e) => { setNote(t.id, e.target.value); setEditingNoteId(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                    />
                  ) : t.note ? (
                    <button className="note-btn" onClick={() => setEditingNoteId(t.id)}>
                      <span className="note-text">{t.note}</span>
                    </button>
                  ) : (
                    <button className="note-btn" onClick={() => setEditingNoteId(t.id)}>+ nota</button>
                  )}
                </td>
                <td className="col-center"><StatusPill value={t.status} onClick={() => cycleStatus(t.id)} /></td>
                <td className="col-center"><PriorityBadge value={t.priority} onClick={() => cyclePriority(t.id)} /></td>
                <td className="col-center">
                  <DateField
                    value={t.date}
                    onChange={(v) => setDate(t.id, v)}
                    overdue={isOverdue(t.date, t.status)}
                  />
                </td>
                <td><button className="row-del" onClick={() => removeTask(t.id)}><Trash2 size={14} /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (bootStatus === "checking-session" || bootStatus === "loading") {
    return (
      <div className="tt-root boot-screen">
        <style>{BOOT_STYLES}</style>
        <div className="boot-msg mono">Cargando...</div>
      </div>
    );
  }

  if (bootStatus === "auth") {
    return (
      <div className="tt-root boot-screen">
        <style>{BOOT_STYLES}</style>
        <div className="auth-card">
          <div className="brand"><span className="brand-dot" />Task Tracker</div>

          <input
            type="email"
            className="auth-input"
            placeholder="Email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Contraseña"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (authView === "login" ? handleEmailSignIn() : handleEmailSignUp())}
          />

          {authError && <div className="auth-error">{authError}</div>}
          {authNotice && <div className="auth-notice">{authNotice}</div>}

          <button className="auth-btn" disabled={authBusy} onClick={authView === "login" ? handleEmailSignIn : handleEmailSignUp}>
            {authBusy ? "Un momento..." : authView === "login" ? "Ingresar" : "Crear cuenta"}
          </button>

          <button
            className="auth-switch"
            onClick={() => { setAuthView(authView === "login" ? "signup" : "login"); setAuthError(""); setAuthNotice(""); }}
          >
            {authView === "login" ? "¿No tenés cuenta? Creá una" : "¿Ya tenés cuenta? Ingresá"}
          </button>

          <div className="auth-divider"><span>o</span></div>

          <button className="auth-guest-btn" disabled={authBusy} onClick={handleGuestLogin}>
            Probar sin cuenta
          </button>
          <p className="auth-guest-hint">Entrás directo, sin registrarte. Tus datos quedan atados a este navegador.</p>
        </div>
      </div>
    );
  }

  if (bootStatus === "enc-unlock") {
    return (
      <div className="tt-root boot-screen">
        <style>{BOOT_STYLES}</style>
        <div className="auth-card">
          <div className="brand"><span className="brand-dot" />Task Tracker</div>
          <div className="modal-text" style={{ marginBottom: 16 }}>
            Tus datos están cifrados. Ingresá tu contraseña de cifrado para desbloquearlos.
          </div>
          <input
            type="password"
            className="auth-input"
            placeholder="Contraseña de cifrado"
            value={encPass}
            onChange={(e) => setEncPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEncUnlock()}
            autoFocus
          />
          {encError && <div className="auth-error">{encError}</div>}
          <button className="auth-btn" disabled={encBusy} onClick={handleEncUnlock}>
            {encBusy ? "Desbloqueando..." : "Desbloquear"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tt-root">
      <style>{`
        .tt-root {
          position: relative;
          --bg: #0c0e11;
          --surface: #14171b;
          --surface-2: #191d22;
          --border: #262a30;
          --text: #e9ebee;
          --text-dim: #8d94a0;
          --text-faint: #565d68;
          --amber: #e8a33d;
          --blue: #4c8dff;
          --alta: #f0554b;
          --media: #e8a33d;
          --baja: #565d68;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: var(--bg);
          color: var(--text);
          display: flex;
          flex-direction: column;
          height: 100vh;
          min-height: 640px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--border);
          text-align: left;
        }
        .tt-root * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; border: 2px solid var(--bg); }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-faint); }
        ::-webkit-scrollbar-corner { background: var(--bg); }
        .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .tt-body { display: flex; flex: 1; min-height: 0; }

        /* ---- sidebar ---- */
        .sidebar {
          width: 244px;
          flex-shrink: 0;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 18px 14px;
          overflow-y: auto;
        }
        .brand { display: flex; align-items: center; gap: 8px; padding: 4px 6px 20px; font-weight: 600; font-size: 16px; letter-spacing: -0.01em; }
        .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); box-shadow: 0 0 0 3px rgba(232,163,61,0.15); }
        .side-label { font-size: 11.5px; color: var(--text-faint); font-weight: 600; letter-spacing: 0.06em; padding: 0 6px; margin: 14px 0 6px; }
        .side-label-row { display: flex; align-items: center; justify-content: space-between; margin: 14px 0 6px; padding: 0 2px 0 6px; }
        .side-label-row .side-label { margin: 0; padding: 0; }
        .side-label-action { background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 3px; border-radius: 5px; display: flex; }
        .side-label-action:hover { color: var(--text-dim); background: var(--surface-2); }
        .side-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 7px 8px; border-radius: 7px; font-size: 14px; color: var(--text-dim);
          cursor: pointer; margin-bottom: 1px; transition: background .12s, color .12s;
          user-select: none;
        }
        .side-item:hover { background: var(--surface-2); color: var(--text); }
        .side-item--active { background: var(--surface-2); color: var(--text); }
        .side-item--disabled { cursor: default; opacity: 0.45; }
        .side-item--disabled:hover { background: none; color: var(--text-dim); }
        .side-item-left { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1; }
        .side-item-right { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .side-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .side-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; border: none; padding: 0; cursor: pointer; }
        .side-dot-wrap { position: relative; display: flex; }
        .side-count { font-size: 12px; color: var(--text-dim); font-weight: 700; margin-right: 4px; min-width: 16px; text-align: right; }
        .side-item--active .side-count { color: var(--text); }
        .add-area-btn, .add-project-btn {
          margin-top: 10px; padding: 8px; border-radius: 7px; border: 1px dashed var(--border);
          background: transparent; color: var(--text-faint); font-size: 13.5px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .add-area-btn:hover, .add-project-btn:hover { color: var(--text-dim); border-color: var(--text-faint); }
        .sidebar-spacer { flex: 1; }
        .account-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 12px; border-top: 1px solid var(--border);
        }
        .account-name { font-size: 13px; color: var(--text-dim); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
        .account-sub { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
        .account-logout {
          background: none; border: 1px solid var(--border); border-radius: 7px; color: var(--text-faint);
          font-size: 11.5px; padding: 5px 10px; cursor: pointer; flex-shrink: 0;
        }
        .account-logout:hover { color: var(--alta); border-color: rgba(240,85,75,0.4); }
        .notif-toggle-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 12px; margin-top: 8px; border-top: 1px solid var(--border);
        }
        .notif-toggle-title { font-size: 13.5px; color: var(--text-dim); font-weight: 600; }
        .notif-toggle-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
        .switch {
          width: 34px; height: 20px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border);
          padding: 2px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center;
        }
        .switch-knob { width: 14px; height: 14px; border-radius: 50%; background: var(--text-faint); transition: transform .15s, background .15s; }
        .switch--on { background: rgba(76,141,255,0.25); border-color: rgba(76,141,255,0.5); }
        .switch--on .switch-knob { background: var(--blue); transform: translateX(14px); }

        .rename-input, .rename-project-input {
          background: var(--surface-2); border: 1px solid var(--amber); border-radius: 5px;
          color: var(--text); font-size: 14px; padding: 3px 6px; width: 100%; outline: none;
        }
        .area-edit-btn {
          background: none; border: none; color: var(--text-faint); cursor: pointer;
          padding: 3px; border-radius: 5px; opacity: 0; flex-shrink: 0; display: flex;
        }
        .side-item:hover .area-edit-btn { opacity: 1; }
        .area-edit-btn:hover { color: var(--text); background: var(--border); }
        .area-edit-btn--danger:hover { color: var(--alta); background: rgba(240,85,75,0.14); }
        .new-area-input {
          margin-top: 10px; background: var(--surface-2); border: 1px solid var(--amber);
          border-radius: 7px; color: var(--text); font-size: 13.5px; padding: 8px; width: 100%; outline: none;
        }

        .project-list { margin: 2px 0 6px 20px; padding-left: 10px; border-left: 1px solid var(--border); display: flex; flex-direction: column; gap: 1px; }
        .project-item {
          display: flex; align-items: center; gap: 8px; padding: 5px 7px; border-radius: 6px;
          font-size: 13px; color: var(--text-dim); cursor: pointer;
        }
        .project-item:hover { background: var(--surface-2); color: var(--text); }
        .project-item:hover .area-edit-btn { opacity: 1; }
        .project-item--active { background: var(--surface-2); color: var(--text); }
        .project-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .project-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
        .project-count { font-size: 11.5px; color: var(--text-faint); font-weight: 400; min-width: 16px; text-align: right; margin-right: 4px; }
        .new-project-input { margin: 3px 0 6px 20px; width: calc(100% - 20px); background: var(--surface-2); border: 1px solid var(--amber); border-radius: 6px; color: var(--text); font-size: 13px; padding: 6px 8px; outline: none; }
        .add-project-btn { margin: 2px 0 8px 20px; padding: 5px 8px; font-size: 12.5px; width: calc(100% - 20px); }

        .popover-scrim { position: fixed; inset: 0; z-index: 60; background: transparent; }
        .color-popover {
          position: absolute; top: 20px; left: 0; z-index: 61; width: 130px;
          background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
          padding: 8px; display: flex; flex-wrap: wrap; gap: 6px; box-shadow: 0 12px 28px rgba(0,0,0,0.5);
        }
        .color-swatch { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.18); cursor: pointer; padding: 0; transition: transform .1s; }
        .color-swatch:hover { transform: scale(1.15); }

        /* ---- main ---- */
        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .topbar { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-bottom: 1px solid var(--border); }
        .topbar h1 {
          font-size: 16.5px; font-weight: 600; margin: 0; letter-spacing: -0.01em;
          width: 155px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .search-wrap {
          display: flex; align-items: center; gap: 7px; background: var(--surface); border: 1px solid var(--border);
          border-radius: 8px; padding: 6px 10px; flex: 1; max-width: 320px; margin-left: 2px;
        }
        .search-wrap input { background: none; border: none; outline: none; color: var(--text); font-size: 13.5px; width: 100%; }
        .search-wrap input::placeholder { color: var(--text-faint); }
        .topbar-spacer { flex: 1; }
        .counter { font-size: 12.5px; padding: 6px 10px; border-radius: 7px; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); display: flex; gap: 5px; align-items: center; white-space: nowrap; flex-shrink: 0; }
        .counter b { color: var(--text); font-weight: 700; }
        .counter--warn b { color: var(--alta); }
        .iconbtn {
          display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-dim); background: var(--surface);
          border: 1px solid var(--border); border-radius: 7px; padding: 6px 10px; cursor: pointer; white-space: nowrap;
        }
        .iconbtn:hover { color: var(--text); border-color: #33383f; }
        .iconbtn--active { color: var(--amber); border-color: rgba(232,163,61,0.4); background: rgba(232,163,61,0.08); }
        .icon-only { padding: 6px 7px; }
        .sync-indicator { cursor: default; color: var(--text-dim); }
        .sync-indicator:hover { color: var(--text-dim); border-color: var(--border); }

        .bell-wrap { position: relative; display: inline-flex; }
        .bell-dot { position: absolute; top: 4px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: var(--alta); border: 1.5px solid var(--surface); }
        .notif-panel {
          position: absolute; top: 34px; right: 0; z-index: 61; width: 280px; max-height: 340px;
          display: flex; flex-direction: column; background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 10px; box-shadow: 0 12px 28px rgba(0,0,0,0.5); overflow: hidden;
        }
        .notif-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; font-size: 13px; font-weight: 700; border-bottom: 1px solid var(--border); }
        .notif-panel-count { color: var(--text-faint); font-weight: 400; }
        .notif-panel-list { overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
        .notif-panel-empty { padding: 16px; text-align: center; font-size: 13px; color: var(--text-faint); }
        .notif-row { display: flex; flex-direction: column; gap: 3px; padding: 8px 8px; border-radius: 7px; }
        .notif-row:hover { background: var(--surface); }
        .notif-row-title { font-size: 13.5px; color: var(--text); }
        .notif-row-meta { font-size: 12px; color: var(--text-faint); }

        /* ---- input card ---- */
        .input-card { margin: 18px 20px 6px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
        .tabs { display: flex; border-bottom: 1px solid var(--border); }
        .tab-btn { padding: 11px 16px; font-size: 13.5px; color: var(--text-faint); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
        .tab-btn--active { color: var(--text); border-bottom-color: var(--amber); }
        .input-body { padding: 14px 16px; display: flex; gap: 12px; align-items: flex-start; }
        .input-body textarea {
          flex: 1; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px;
          color: var(--text); padding: 11px 12px; font-size: 14px; font-family: inherit; resize: none;
          min-height: 58px; outline: none; line-height: 1.5;
        }
        .input-body textarea:focus { border-color: rgba(232,163,61,0.5); }
        .input-body textarea::placeholder { color: var(--text-faint); }
        .procesar-btn {
          background: var(--amber); color: #1b1304; border: none; border-radius: 9px; padding: 12px 18px;
          font-size: 13.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px;
          white-space: nowrap; flex-shrink: 0; transition: filter .12s;
        }
        .procesar-btn:hover { filter: brightness(1.08); }
        .procesar-btn:disabled { opacity: 0.55; cursor: default; }
        .spin { animation: tt-spin 0.8s linear infinite; }
        @keyframes tt-spin { to { transform: rotate(360deg); } }
        .hint-text { padding: 0 16px 12px; font-size: 12.5px; color: var(--text-faint); line-height: 1.5; }
        .manual-form { padding: 14px 16px; display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start; }
        .manual-form input[type=text] { flex: 1; min-width: 160px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 10px 12px; font-size: 14px; outline: none; }
        .manual-form select { background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; color: var(--text); padding: 10px 12px; font-size: 13.5px; outline: none; }
        .manual-area-fixed { display: flex; align-items: center; gap: 7px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; font-size: 13.5px; color: var(--text-dim); }

        /* ---- groups / table ---- */
        .groups { flex: 1; overflow-y: auto; padding: 4px 20px 24px; }
        .groups--first-view { padding-top: 18px; }
        .group { border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; overflow: hidden; background: var(--surface); }
        .group-head { display: flex; align-items: center; gap: 10px; padding: 13px 16px; cursor: pointer; user-select: none; }
        .group-bar { width: 3px; align-self: stretch; border-radius: 2px; }
        .group-name { font-weight: 700; font-size: 14px; letter-spacing: 0.02em; flex: 1; text-transform: uppercase; }
        .group-count { font-size: 12px; color: var(--text-dim); background: var(--surface-2); padding: 4px 9px; border-radius: 999px; }
        .chev { color: var(--text-faint); }

        .subgroup { border-top: 1px solid var(--border); }
        .subgroup-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px; cursor: pointer; user-select: none; }
        .subgroup-head:hover { background: var(--surface-2); }
        .subgroup-chev { display: flex; color: var(--text-dim); flex-shrink: 0; }
        .subgroup-dot { width: 6px; height: 6px; border-radius: 50%; }
        .subgroup-name { flex: 1; font-size: 14px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase; }
        .subgroup-count { font-size: 11.5px; color: var(--text-dim); background: var(--surface-2); padding: 3px 9px; border-radius: 999px; }

        .quick-add-row { display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-top: 1px solid var(--border); }
        .quick-add-row--indent { padding-left: 40px; }
        .quick-add-icon { color: var(--text-faint); flex-shrink: 0; opacity: 0.7; }
        .quick-add-input { flex: 1; background: none; border: none; outline: none; color: var(--text-dim); font-size: 13.5px; }
        .quick-add-input::placeholder { color: var(--text-faint); }
        .quick-add-input:focus { color: var(--text); }

        .group-footer { padding: 10px 14px; }
        .panel-add-project-btn {
          display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 10px;
          background: var(--surface-2); border: 1px dashed var(--border); border-radius: 9px;
          color: var(--text-dim); font-size: 13px; font-weight: 600; cursor: pointer; text-align: center;
        }
        .panel-add-project-btn:hover { color: var(--amber); border-color: rgba(232,163,61,0.5); }
        .panel-new-project-input {
          width: 100%; padding: 10px 12px; background: var(--surface-2); border: 1px dashed var(--amber); border-radius: 9px;
          color: var(--text); font-size: 13.5px; outline: none;
        }

        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead th { text-align: left; font-size: 11.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-faint); font-weight: 600; padding: 8px 16px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .area-columns-header { margin-bottom: -1px; }
        tbody tr { border-bottom: 1px solid var(--border); }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:hover { background: var(--surface-2); }
        tbody tr:hover .row-del { opacity: 1; }
        tbody tr[draggable] { cursor: grab; }
        tbody tr.row-dragging { opacity: 0.4; }
        td { padding: 10px 16px; font-size: 14px; vertical-align: middle; }
        .task-title { color: var(--text); }
        .task-title--done { color: var(--text-faint); text-decoration: line-through; }
        .note-btn { color: var(--text-faint); font-size: 13px; cursor: pointer; background: none; border: none; padding: 0; }
        .note-btn:hover { color: var(--text-dim); }
        .td-detalle { text-align: center; }
        .td-indent { padding-left: 40px; }
        .col-center { text-align: center; }
        .note-input { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text-dim); font-size: 13px; padding: 5px 8px; width: 85%; outline: none; }
        .title-input { background: var(--surface-2); border: 1px solid var(--amber); border-radius: 6px; color: var(--text); font-size: 14px; padding: 5px 8px; width: 100%; outline: none; }
        .note-text { color: var(--text-dim); font-size: 13.5px; }

        .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-dim); cursor: pointer; }
        .pill--Porhacer { color: var(--text-dim); }
        .pill--Haciendo { color: var(--blue); border-color: rgba(76,141,255,0.35); background: rgba(76,141,255,0.08); }
        .pill--Hecho { color: #34D399; border-color: rgba(52,211,153,0.35); background: rgba(52,211,153,0.08); }

        .badge--priority { border: none; cursor: pointer; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 6px; }
        .badge--Alta { background: rgba(240,85,75,0.14); color: var(--alta); }
        .badge--Media { background: rgba(232,163,61,0.14); color: var(--media); }
        .badge--Baja { background: rgba(86,93,104,0.2); color: var(--text-dim); }

        .datefield { position: relative; display: inline-block; }
        .datefield-btn { background: none; border: none; color: var(--text-dim); font-size: 13.5px; cursor: pointer; padding: 5px 7px; border-radius: 6px; font-variant-numeric: tabular-nums; }
        .datefield-btn:hover { background: var(--surface-2); }
        .datefield-btn--empty { color: var(--text-faint); }
        .datefield-btn--overdue { color: var(--alta); font-weight: 600; }
        .datefield-pop {
          position: fixed; z-index: 200; width: 220px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
          padding: 10px; box-shadow: 0 12px 28px rgba(0,0,0,0.5);
        }
        .datefield-pop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .datefield-pop-label { font-size: 13px; font-weight: 700; color: var(--text); }
        .datefield-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .datefield-wd { font-size: 10.5px; color: var(--text-faint); text-align: center; padding: 2px 0; }
        .datefield-day { background: none; border: none; color: var(--text-dim); font-size: 12px; padding: 6px 0; border-radius: 6px; cursor: pointer; font-variant-numeric: tabular-nums; }
        .datefield-day:hover { background: var(--border); }
        .datefield-day--out { opacity: 0.3; }
        .datefield-day--today { color: var(--amber); font-weight: 700; }
        .datefield-day--selected { background: var(--amber); color: #1b1304; font-weight: 700; }
        .datefield-pop-actions { display: flex; justify-content: space-between; margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
        .datefield-action { background: none; border: none; color: var(--text-dim); font-size: 12px; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
        .datefield-action:hover { background: var(--border); color: var(--text); }

        .row-del { opacity: 0; background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 4px; border-radius: 5px; transition: opacity .12s; }
        .row-del:hover { color: var(--alta); background: rgba(240,85,75,0.1); }

        .group-head--dragover { background: rgba(232,163,61,0.08); box-shadow: inset 0 0 0 1px var(--amber); }
        .subgroup--dragover { background: rgba(232,163,61,0.06); box-shadow: inset 0 0 0 1px var(--amber); }
        .empty-hint { padding: 14px 16px; font-size: 13px; color: var(--text-faint); font-style: italic; }
        .area-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-dim); }
        .area-tag-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        .panel-add-area-btn {
          display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 14px;
          margin-top: 4px; border: 1px dashed var(--border); border-radius: 12px; background: none;
          color: var(--text-faint); font-size: 14px; cursor: pointer;
        }
        .panel-add-area-btn:hover { color: var(--text-dim); border-color: var(--text-faint); }
        .panel-new-area-input {
          width: 100%; padding: 14px 16px; margin-top: 4px; border: 1px dashed var(--amber); border-radius: 12px;
          background: var(--surface); color: var(--text); font-size: 14px; outline: none;
        }

        .empty-state { text-align: center; padding: 60px 20px; color: var(--text-faint); font-size: 14px; }

        .toast {
          position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
          background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
          font-size: 13.5px; padding: 9px 16px; border-radius: 9px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }

        /* ---- urgent ticker bar ---- */
        .urgent-bar {
          flex-shrink: 0; height: 48px; border-top: 1px solid var(--border); background: var(--surface);
          display: flex; align-items: center; gap: 12px; padding: 0 20px;
        }
        .urgent-label { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: var(--alta); flex-shrink: 0; }
        .urgent-label--off { color: var(--text-faint); }
        .urgent-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--alta); }
        .urgent-dot--off { background: var(--text-faint); }
        .urgent-empty { font-size: 13px; color: var(--text-faint); }
        .urgent-chip { font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 5px; flex-shrink: 0; }
        .urgent-chip--vencida { background: rgba(240,85,75,0.16); color: var(--alta); }
        .urgent-chip--hoy { background: rgba(232,163,61,0.16); color: var(--amber); }
        .urgent-chip--manana { background: rgba(76,141,255,0.16); color: var(--blue); }
        .urgent-title { font-size: 14px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .urgent-meta { font-size: 12.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .urgent-spacer { flex: 1; }
        .urgent-count { font-size: 12px; color: var(--text-faint); flex-shrink: 0; }

        /* ---- calendar ---- */
        .calendar-wrap { flex: 1; overflow-y: auto; padding: 18px 20px 24px; display: flex; flex-direction: column; }
        .cal-toolbar { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
        .cal-nav { display: flex; align-items: center; gap: 10px; }
        .cal-nav-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 7px; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); cursor: pointer; }
        .cal-nav-btn:hover { color: var(--text); border-color: #33383f; }
        .cal-month-label { font-size: 15.5px; font-weight: 700; min-width: 150px; letter-spacing: -0.01em; }
        .cal-view-switch { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 2px; }
        .seg-btn { padding: 6px 12px; font-size: 12.5px; color: var(--text-dim); background: none; border: none; border-radius: 6px; cursor: pointer; }
        .seg-btn--active { background: var(--surface-2); color: var(--text); }
        .cal-toolbar-spacer { flex: 1; }
        .cal-kbd-hint { font-size: 11.5px; color: var(--text-faint); margin-right: 4px; }

        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 18px; }
        .cal-weekday { text-align: center; font-size: 11.5px; color: var(--text-faint); font-weight: 600; padding: 4px 0 8px; display: flex; align-items: center; justify-content: center; gap: 5px; }
        .cal-day { border: 1px solid var(--border); border-radius: 9px; background: var(--surface); min-height: 84px; min-width: 0; overflow: hidden; padding: 7px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: border-color .12s, background .12s; }
        .cal-day--week { min-height: 220px; }
        .cal-day:hover { border-color: #33383f; }
        .cal-day--out { opacity: 0.35; }
        .cal-day--today { border-color: rgba(232,163,61,0.6); }
        .cal-day--selected { background: var(--surface-2); border-color: var(--amber); box-shadow: 0 0 0 1px var(--amber); }
        .cal-day-num { font-size: 12.5px; color: var(--text-dim); }
        .cal-day--today .cal-day-num { color: var(--amber); font-weight: 700; }
        .cal-day-tasks { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .cal-chip { display: flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--text-dim); background: var(--surface-2); border-radius: 4px; padding: 2px 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
        .cal-chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .cal-chip-text { overflow: hidden; text-overflow: ellipsis; }
        .cal-chip--done { opacity: 0.55; text-decoration: line-through; }
        .cal-more { font-size: 11px; color: var(--text-faint); padding-left: 2px; }

        .cal-detail { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); padding: 14px 16px; }
        .cal-detail--day { padding: 20px; }
        .cal-detail-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 700; margin-bottom: 12px; }
        .cal-detail--day .cal-detail-head { font-size: 16.5px; }
        .cal-detail-count { color: var(--text-dim); font-weight: 400; font-size: 12.5px; }
        .cal-detail-add { display: flex; gap: 8px; margin-bottom: 12px; }
        .cal-detail-add input { flex: 1; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; color: var(--text); font-size: 13.5px; outline: none; }
        .cal-detail-add input:focus { border-color: rgba(232,163,61,0.5); }
        .cal-detail-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
        .cal-detail-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface-2); border-radius: 8px; }

        /* ---- modal ---- */
        .modal-overlay { position: absolute; inset: 0; background: rgba(4,5,7,0.72); display: flex; align-items: center; justify-content: center; z-index: 70; }
        .modal-card { position: relative; width: 320px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 20px 48px rgba(0,0,0,0.5); }
        .modal-close {
          position: absolute; top: 12px; right: 12px; background: none; border: none; color: var(--text-faint);
          cursor: pointer; padding: 4px; border-radius: 6px; display: flex;
        }
        .modal-close:hover { color: var(--text); background: var(--surface); }
        .settings-note { font-size: 12px; color: var(--text-faint); line-height: 1.5; margin: -8px 0 18px; }
        .modal-title { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
        .modal-text { font-size: 13.5px; color: var(--text-dim); line-height: 1.5; margin-bottom: 18px; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .modal-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13.5px; cursor: pointer; border: none; }
        .modal-btn--cancel { background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); }
        .modal-btn--cancel:hover { color: var(--text); }
        .modal-btn--danger { background: var(--alta); color: #fff; font-weight: 700; }
        .modal-btn--danger:hover { filter: brightness(1.08); }
        .modal-btn--primary { background: var(--amber); color: #1b1304; font-weight: 700; }
        .modal-btn--primary:hover { filter: brightness(1.08); }
        .modal-btn--primary:disabled { opacity: 0.6; cursor: default; }
        .settings-input {
          width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
          padding: 9px 11px; color: var(--text); font-size: 13.5px; outline: none; margin-bottom: 8px;
        }
        .settings-input:focus { border-color: rgba(232,163,61,0.5); }
        .settings-error { font-size: 12.5px; color: var(--alta); margin-bottom: 10px; }
        .settings-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--text-dim); margin-bottom: 18px; }
        .settings-danger-zone {
          margin: 18px 0; padding: 14px; border: 1px solid rgba(240,85,75,0.3); border-radius: 10px; background: rgba(240,85,75,0.06);
        }
        .settings-row-title { font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .settings-row-desc { font-size: 12px; color: var(--text-dim); line-height: 1.5; margin-bottom: 12px; }
      `}</style>

      {/* Sidebar */}
      <div className="tt-body">
      <aside className="sidebar">
        <div className="brand"><span className="brand-dot" />Task Tracker</div>

        <div className="side-label">VISTAS</div>
        <div className={`side-item ${view === "lista" ? "side-item--active" : ""}`} onClick={() => setView("lista")}>
          <span className="side-item-left"><ListIcon size={14} /> Lista</span>
        </div>
        <div className={`side-item ${view === "prioridad" ? "side-item--active" : ""}`} onClick={() => setView("prioridad")}>
          <span className="side-item-left"><Flag size={14} /> Por prioridad</span>
        </div>
        <div className={`side-item ${view === "calendario" ? "side-item--active" : ""}`} onClick={() => setView("calendario")}>
          <span className="side-item-left"><CalendarIcon size={14} /> Calendario</span>
        </div>

        <div className="side-label-row">
          <span className="side-label">ÁREAS</span>
          {areas.length > 0 && (
            <button className="side-label-action" onClick={toggleAllProjectsExpanded} title="Desplegar/colapsar todos los proyectos">
              {areas.every((a) => expandedAreas[a.id]) ? <ChevronsUp size={12} /> : <ChevronsDown size={12} />}
            </button>
          )}
        </div>
        <div className={`side-item ${selectedAreaId === "all" ? "side-item--active" : ""}`} onClick={() => selectArea("all")}>
          <span className="side-item-left">
            <span className="side-dot" style={{ background: "var(--text-faint)" }} />
            <span className="side-item-name">Todas</span>
          </span>
          <span className="side-count mono">{tasks.filter((t) => t.status !== "Hecho").length}</span>
        </div>

        {orderedAreas.map((a) => (
          <React.Fragment key={a.id}>
            <div
              className={`side-item ${selectedAreaId === a.id && !selectedProjectId ? "side-item--active" : ""}`}
              onClick={() => { if (renamingAreaId !== a.id) selectArea(a.id); }}
              onDoubleClick={() => { if (renamingAreaId !== a.id) toggleExpand(a.id); }}
            >
              {renamingAreaId === a.id ? (
                <input
                  ref={renameInputRef}
                  className="rename-input"
                  value={renameValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingAreaId(null); }}
                />
              ) : (
                <>
                  <span className="side-item-left">
                    <span className="side-dot-wrap">
                      <button
                        className="side-dot"
                        style={{ background: a.color }}
                        onClick={(e) => { e.stopPropagation(); setColorPickerAreaId(colorPickerAreaId === a.id ? null : a.id); }}
                        title="Cambiar color"
                      />
                      {colorPickerAreaId === a.id && (
                        <>
                          <div className="popover-scrim" onClick={(e) => { e.stopPropagation(); setColorPickerAreaId(null); }} />
                          <div className="color-popover" onClick={(e) => e.stopPropagation()}>
                            {PALETTE.map((c) => (
                              <button
                                key={c}
                                className="color-swatch"
                                style={{ background: c }}
                                onClick={() => { setAreaColor(a.id, c); setColorPickerAreaId(null); }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </span>
                    <span className="side-item-name">{a.name}</span>
                  </span>
                  <span className="side-item-right">
                    <span className="side-count mono">{areaCounts[a.id] || 0}</span>
                    {!isGeneralArea(a) && (
                      <>
                        <button className="area-edit-btn" title="Renombrar área" onClick={(e) => { e.stopPropagation(); startRename(a); }}>
                          <Pencil size={12} />
                        </button>
                        <button className="area-edit-btn area-edit-btn--danger" title="Eliminar área" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "area", id: a.id }); }}>
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </div>

            {expandedAreas[a.id] && (
              <div className="project-list">
                {(a.projects || []).map((p) => (
                  <div
                    key={p.id}
                    className={`project-item ${selectedAreaId === a.id && selectedProjectId === p.id ? "project-item--active" : ""}`}
                    onClick={() => { setSelectedAreaId(a.id); setSelectedProjectId(p.id); }}
                    onDoubleClick={() => startRenameProject(a.id, p)}
                  >
                    {renamingProjectId === p.id ? (
                      <input
                        ref={renameProjectInputRef}
                        className="rename-project-input"
                        value={renameProjectValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameProjectValue(e.target.value)}
                        onBlur={commitRenameProject}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRenameProject(); if (e.key === "Escape") setRenamingProjectId(null); }}
                      />
                    ) : (
                      <>
                        <span className="project-dot" style={{ background: a.color }} />
                        <span className="project-name">{p.name}</span>
                        <span className="project-count mono">{projectCounts[p.id] || 0}</span>
                        <button className="area-edit-btn" title="Renombrar proyecto" onClick={(e) => { e.stopPropagation(); startRenameProject(a.id, p); }}>
                          <Pencil size={11} />
                        </button>
                        <button className="area-edit-btn area-edit-btn--danger" title="Eliminar proyecto" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "project", id: p.id, areaId: a.id }); }}>
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {!isGeneralArea(a) && (
                  addingProjectAreaId === a.id ? (
                    <input
                      ref={newProjectInputRef}
                      className="new-project-input"
                      placeholder="Nombre del proyecto..."
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onBlur={() => createProject(a.id)}
                      onKeyDown={(e) => { if (e.key === "Enter") createProject(a.id); if (e.key === "Escape") { setNewProjectName(""); setAddingProjectAreaId(null); } }}
                    />
                  ) : (
                    <button className="add-project-btn" onClick={() => setAddingProjectAreaId(a.id)}><Plus size={11} /> Proyecto</button>
                  )
                )}
              </div>
            )}
          </React.Fragment>
        ))}

        {addingArea ? (
          <input
            ref={newAreaInputRef}
            className="new-area-input"
            placeholder="Nombre del área..."
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            onBlur={createArea}
            onKeyDown={(e) => { if (e.key === "Enter") createArea(); if (e.key === "Escape") { setNewAreaName(""); setAddingArea(false); } }}
          />
        ) : (
          <button className="add-area-btn" onClick={() => setAddingArea(true)}><Plus size={13} /> Nueva área</button>
        )}

        <div className="sidebar-spacer" />

        <div className="account-row">
          <div className="account-info">
            <div className="account-name">{session?.user?.is_anonymous ? "Invitado" : (session?.user?.email || "")}</div>
            <div className="account-sub">{session?.user?.is_anonymous ? "Sesión de prueba" : "Con cuenta"}</div>
          </div>
          <button className="account-logout" onClick={handleLogout} title="Cerrar sesión">Salir</button>
        </div>

        <div className="notif-toggle-row">
          <div>
            <div className="notif-toggle-title">Notificaciones</div>
            <div className="notif-toggle-sub">{notificationsEnabled ? "Activas · cada hora" : "Apagadas"}</div>
          </div>
          <button
            className={`switch ${notificationsEnabled ? "switch--on" : ""}`}
            onClick={() => setNotificationsEnabled((v) => !v)}
            title="Activar/desactivar notificaciones"
          >
            <span className="switch-knob" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main" style={{ position: "relative" }}>
        <div className="topbar">
          <h1>
            {view === "calendario"
              ? "Calendario"
              : view === "prioridad"
                ? "Por prioridad"
                : selectedAreaId === "all"
                  ? "Todas las tareas"
                  : (selectedProjectId ? areaMap[selectedAreaId]?.projects?.find((p) => p.id === selectedProjectId)?.name : areaMap[selectedAreaId]?.name)}
          </h1>
          <div className="search-wrap">
            <Search size={13} color="var(--text-faint)" />
            <input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="topbar-spacer" />
          <div className="counter"><span>Pendientes</span><b>{pendientes}</b></div>
          <div className={`counter ${vencidas > 0 ? "counter--warn" : ""}`}><span>Vencidas</span><b>{vencidas}</b></div>
          <IconBtn icon={hideCompleted ? CheckCircle2 : Circle} label="Ocultar hechas" onClick={() => setHideCompleted((v) => !v)} active={hideCompleted} />
          <span className="bell-wrap">
            <button
              className="iconbtn icon-only"
              title="Notificaciones"
              onClick={() => setShowNotifPanel((v) => !v)}
            >
              <Bell size={14} />
              {urgentItems.length > 0 && <span className="bell-dot" />}
            </button>
            {showNotifPanel && (
              <>
                <div className="popover-scrim" onClick={() => setShowNotifPanel(false)} />
                <div className="notif-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="notif-panel-head">
                    <span>Urgentes</span>
                    <span className="notif-panel-count mono">{urgentItems.length}</span>
                  </div>
                  <div className="notif-panel-list">
                    {urgentItems.length === 0 && (
                      <div className="notif-panel-empty">Sin tareas vencidas ni próximas.</div>
                    )}
                    {urgentItems.map((item, i) => {
                      const a = areaMap[item.task.areaId];
                      const p = item.task.projectId ? a?.projects?.find((pr) => pr.id === item.task.projectId) : null;
                      return (
                        <div className="notif-row" key={item.task.id + i}>
                          <span className={`urgent-chip urgent-chip--${item.kind}`}>{item.label}</span>
                          <span className="notif-row-title">{item.task.title}</span>
                          <span className="notif-row-meta">{a?.name}{p ? ` · ${p.name}` : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </span>
          <span className="iconbtn icon-only sync-indicator" title={saving ? "Guardando..." : lastSyncAt ? `Sincronizado — ${new Date(lastSyncAt).toLocaleTimeString("es-AR")}` : "Conectado a Supabase"}>
            {saving ? <RefreshCw size={14} className="spin" /> : <Cloud size={14} />}
          </span>
          <button className="iconbtn" onClick={exportData} title="Descargar un backup en .json">
            <Download size={13} /> Exportar
          </button>
          <button className="iconbtn" onClick={() => restoreInputRef.current?.click()} title="Restaurar desde un backup en .json">
            <Upload size={13} /> Restaurar
          </button>
          <input ref={restoreInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={restoreData} />
          <button className="iconbtn icon-only" onClick={() => setShowSettingsPanel(true)} title="Configuración">
            <Settings size={14} />
          </button>
          <button
            className="iconbtn icon-only"
            onClick={() => setShowEncSettings(true)}
            title={isEncrypted ? "Datos cifrados — ver cifrado" : "Datos sin cifrar — ver cifrado"}
          >
            {isEncrypted ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>

        {view === "lista" ? (
          <>
            <div className="input-card">
              <div className="tabs">
                <button className={`tab-btn ${tab === "texto" ? "tab-btn--active" : ""}`} onClick={() => setTab("texto")}>Texto libre</button>
                <button className={`tab-btn ${tab === "form" ? "tab-btn--active" : ""}`} onClick={() => setTab("form")}>Formulario</button>
              </div>

              {tab === "texto" ? (
                <>
                  <div className="input-body">
                    <textarea
                      placeholder="Escribí todo lo que tenés en la cabeza... ej: reunión jueves urgente wanka moria, cortar pasto finde casa"
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleProcesar();
                        }
                      }}
                    />
                    <button className="procesar-btn" onClick={handleProcesar} disabled={!freeText.trim()}>
                      <ListChecks size={14} />
                      Procesar
                    </button>
                  </div>
                  <div className="hint-text">
                    Enter procesa · Shift+Enter agrega una línea. Se interpreta en el momento, sin IA: "hoy" / "mañana" / "el jueves" / "finde" → fecha. "urgente" o "rápido" → prioridad alta.
                    {selectedAreaId !== "all" && <> Las tareas se crean en <b style={{ color: "var(--text-dim)" }}>{areaMap[selectedAreaId]?.name}</b>{selectedProjectId ? ` / ${areaMap[selectedAreaId]?.projects?.find((p) => p.id === selectedProjectId)?.name}` : ""}.</>}
                  </div>
                </>
              ) : (
                <div className="manual-form">
                  <input
                    type="text"
                    placeholder="Título de la tarea"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addManualTask()}
                  />
                  {selectedAreaId === "all" ? (
                    <select value={manualArea} onChange={(e) => setManualArea(e.target.value)}>
                      <option value="">General</option>
                      {orderedAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  ) : (
                    <span className="manual-area-fixed">
                      <span className="side-dot" style={{ background: areaMap[selectedAreaId]?.color }} />
                      {areaMap[selectedAreaId]?.name}
                    </span>
                  )}
                  {selectedAreaId !== "all" && areaMap[selectedAreaId]?.projects?.length > 0 && (
                    <select value={manualProjectId} onChange={(e) => setManualProjectId(e.target.value)}>
                      <option value="">Sin proyecto</option>
                      {areaMap[selectedAreaId].projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <button className="procesar-btn" onClick={addManualTask}><Plus size={14} />Agregar</button>
                </div>
              )}
            </div>

            <div className="groups">
              {grouped.length === 0 && (
                <div className="empty-state">No hay tareas para mostrar. Escribí algo arriba y tocá "Procesar".</div>
              )}
              {grouped.map(({ area, allTasks, noProject, projectGroups }) => {
                const isCollapsed = collapsed[area.id];
                return (
                  <div className="group" key={area.id}>
                    <div
                      className={`group-head ${dragOverKey === `area-${area.id}` ? "group-head--dragover" : ""}`}
                      onClick={() => toggleCollapse(area.id)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverKey(`area-${area.id}`); }}
                      onDragLeave={() => setDragOverKey((k) => (k === `area-${area.id}` ? null : k))}
                      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnTarget(area.id, null); }}
                    >
                      <div className="group-bar" style={{ background: area.color }} />
                      <div className="group-name">{area.name}</div>
                      <div className="group-count mono">{allTasks.filter((t) => t.status !== "Hecho").length} pendientes</div>
                      <span className="chev">{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</span>
                    </div>
                    {!isCollapsed && (
                      <>
                        <table className="area-columns-header">
                          {colGroupFor(false)}
                          <thead>
                            <tr>
                              <th>Tarea</th>
                              <th className="col-center">Detalle</th>
                              <th className="col-center">Estado</th>
                              <th className="col-center">Prioridad</th>
                              <th className="col-center">Fecha</th>
                              <th></th>
                            </tr>
                          </thead>
                        </table>
                        {projectGroups.map(({ project, tasks: projTasks }) => (
                          <div
                            className={`subgroup ${dragOverKey === project.id ? "subgroup--dragover" : ""}`}
                            key={project.id}
                            onDragOver={(e) => { e.preventDefault(); setDragOverKey(project.id); }}
                            onDragLeave={() => setDragOverKey((k) => (k === project.id ? null : k))}
                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnTarget(area.id, project.id); }}
                          >
                            <div className="subgroup-head" onClick={() => toggleProjectCollapse(project.id)}>
                              <span className="subgroup-chev">{collapsedProjects[project.id] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</span>
                              <span className="subgroup-dot" style={{ background: area.color }} />
                              <span className="subgroup-name" style={{ color: area.color }}>{project.name.toUpperCase()}</span>
                              <span className="subgroup-count mono">{projTasks.filter((t) => t.status !== "Hecho").length}</span>
                            </div>
                            {!collapsedProjects[project.id] && (
                              <>
                                {projTasks.length > 0 && renderTaskTable(projTasks, { indent: true })}
                                <QuickAddRow
                                  placeholder="..."
                                  onAdd={(title) => addQuickTask(area.id, project.id, title)}
                                  indent
                                />
                              </>
                            )}
                          </div>
                        ))}
                        <div
                          className={`subgroup ${dragOverKey === `noproject-${area.id}` ? "subgroup--dragover" : ""}`}
                          onDragOver={(e) => { e.preventDefault(); setDragOverKey(`noproject-${area.id}`); }}
                          onDragLeave={() => setDragOverKey((k) => (k === `noproject-${area.id}` ? null : k))}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnTarget(area.id, null); }}
                        >
                          {noProject.length > 0 && renderTaskTable(noProject)}
                          <QuickAddRow
                            placeholder="..."
                            onAdd={(title) => addQuickTask(area.id, null, title)}
                          />
                        </div>
                        {!isGeneralArea(area) && (
                          <div className="group-footer">
                            {panelAddingProjectAreaId === area.id ? (
                              <input
                                ref={panelNewProjectInputRef}
                                className="panel-new-project-input"
                                placeholder="Nombre del nuevo proyecto..."
                                value={panelNewProjectName}
                                onChange={(e) => setPanelNewProjectName(e.target.value)}
                                onBlur={() => createProjectFromPanel(area.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") createProjectFromPanel(area.id);
                                  if (e.key === "Escape") { setPanelNewProjectName(""); setPanelAddingProjectAreaId(null); }
                                }}
                              />
                            ) : (
                              <button className="panel-add-project-btn" onClick={() => setPanelAddingProjectAreaId(area.id)}>
                                <Plus size={13} /> Nuevo proyecto
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {(selectedAreaId === "all" || areas.length === 0) && (
                panelAddingArea ? (
                  <input
                    ref={panelNewAreaInputRef}
                    className="panel-new-area-input"
                    placeholder="Nombre del área..."
                    value={panelNewAreaName}
                    onChange={(e) => setPanelNewAreaName(e.target.value)}
                    onBlur={createAreaFromPanel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createAreaFromPanel();
                      if (e.key === "Escape") { setPanelNewAreaName(""); setPanelAddingArea(false); }
                    }}
                  />
                ) : (
                  <button className="panel-add-area-btn" onClick={() => setPanelAddingArea(true)}>
                    <Plus size={14} /> Nueva área
                  </button>
                )
              )}
            </div>
          </>
        ) : view === "prioridad" ? (
          <div className="groups groups--first-view">
            {groupedByPriority.map(({ priority, tasks: priTasks }) => {
              const key = `prio-${priority}`;
              const isCollapsed = collapsed[key];
              const barColor = priority === "Alta" ? "var(--alta)" : priority === "Media" ? "var(--media)" : "var(--baja)";
              return (
                <div className="group" key={key}>
                  <div className="group-head" onClick={() => toggleCollapse(key)}>
                    <div className="group-bar" style={{ background: barColor }} />
                    <div className="group-name">{priority}</div>
                    <div className="group-count mono">{priTasks.filter((t) => t.status !== "Hecho").length} pendientes</div>
                    <span className="chev">{isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}</span>
                  </div>
                  {!isCollapsed && priTasks.length > 0 && renderTaskTable(priTasks, { showArea: true, showHeader: true })}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="calendar-wrap">
            <div className="cal-toolbar">
              <div className="cal-nav">
                <button className="cal-nav-btn" onClick={() => goPrevNext(-1)}><ChevronLeft size={16} /></button>
                <div className="cal-month-label">
                  {calView === "mes" && `${MONTH_LABELS[calCursor.month]} ${calCursor.year}`}
                  {calView === "semana" && `${fmtDate(weekDays[0].iso)} – ${fmtDate(weekDays[6].iso)}`}
                  {calView === "dia" && `${weekdayFullOf(dayAnchor)} ${fmtDate(dayAnchor)}`}
                </div>
                <button className="cal-nav-btn" onClick={() => goPrevNext(1)}><ChevronRight size={16} /></button>
              </div>
              <div className="cal-view-switch">
                <button className={`seg-btn ${calView === "mes" ? "seg-btn--active" : ""}`} onClick={() => switchCalView("mes")}>Mes</button>
                <button className={`seg-btn ${calView === "semana" ? "seg-btn--active" : ""}`} onClick={() => switchCalView("semana")}>Semana</button>
                <button className={`seg-btn ${calView === "dia" ? "seg-btn--active" : ""}`} onClick={() => switchCalView("dia")}>Día</button>
              </div>
              <div className="cal-toolbar-spacer" />
              {calView === "mes" && <span className="cal-kbd-hint">← → ↑ ↓ navegan · Inicio = hoy</span>}
              <button className="iconbtn" onClick={goToday}>Hoy</button>
            </div>

            {calView === "mes" && (
              <div className="cal-grid">
                {WEEKDAY_LABELS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
                {monthGrid.map((cell) => {
                  const dayTasks = tasksByDate[cell.iso] || [];
                  const isToday = cell.iso === todayISO();
                  const isSelected = cell.iso === selectedDay;
                  return (
                    <div
                      key={cell.iso}
                      className={`cal-day ${!cell.inMonth ? "cal-day--out" : ""} ${isToday ? "cal-day--today" : ""} ${isSelected ? "cal-day--selected" : ""}`}
                      onClick={() => setSelectedDay(cell.iso)}
                    >
                      <div className="cal-day-num">{cell.day}</div>
                      <div className="cal-day-tasks">
                        {dayTasks.slice(0, 3).map((t) => (
                          <div key={t.id} className={`cal-chip ${t.status === "Hecho" ? "cal-chip--done" : ""}`}>
                            <span className="cal-chip-dot" style={{ background: areaMap[t.areaId]?.color || "var(--text-faint)" }} />
                            <span className="cal-chip-text">{t.title}</span>
                          </div>
                        ))}
                        {dayTasks.length > 3 && <div className="cal-more">+{dayTasks.length - 3} más</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {calView === "semana" && (
              <div className="cal-grid">
                {weekDays.map((d, i) => (
                  <div key={`h-${d.iso}`} className="cal-weekday">{WEEKDAY_LABELS[i]} <span className="mono">{d.day}</span></div>
                ))}
                {weekDays.map((cell) => {
                  const dayTasks = tasksByDate[cell.iso] || [];
                  const isToday = cell.iso === todayISO();
                  return (
                    <div
                      key={cell.iso}
                      className={`cal-day cal-day--week ${isToday ? "cal-day--today" : ""}`}
                      onClick={() => { setSelectedDay(cell.iso); setDayAnchor(cell.iso); setCalView("dia"); }}
                    >
                      <div className="cal-day-tasks">
                        {dayTasks.slice(0, 8).map((t) => (
                          <div key={t.id} className={`cal-chip ${t.status === "Hecho" ? "cal-chip--done" : ""}`}>
                            <span className="cal-chip-dot" style={{ background: areaMap[t.areaId]?.color || "var(--text-faint)" }} />
                            <span className="cal-chip-text">{t.title}</span>
                          </div>
                        ))}
                        {dayTasks.length > 8 && <div className="cal-more">+{dayTasks.length - 8} más</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={`cal-detail ${calView === "dia" ? "cal-detail--day" : ""}`}>
              <div className="cal-detail-head">
                <span>{fmtDate(focusedDate)}</span>
                <span className="cal-detail-count mono">{(tasksByDate[focusedDate] || []).length} tareas</span>
              </div>
              <div className="cal-detail-add">
                <input
                  type="text"
                  placeholder="Agregar tarea para este día..."
                  value={dayQuickTitle}
                  onChange={(e) => setDayQuickTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTaskForFocusedDay()}
                />
                <button className="procesar-btn" onClick={addTaskForFocusedDay}><Plus size={14} /></button>
              </div>
              <div className="cal-detail-list">
                {(tasksByDate[focusedDate] || []).length === 0 && (
                  <div className="empty-state">No hay tareas para este día.</div>
                )}
                {(tasksByDate[focusedDate] || []).map((t) => (
                  <div className="cal-detail-row" key={t.id}>
                    <span className="side-dot" style={{ background: areaMap[t.areaId]?.color }} />
                    <span className={`task-title ${t.status === "Hecho" ? "task-title--done" : ""}`} style={{ flex: 1 }}>{t.title}</span>
                    <StatusPill value={t.status} onClick={() => cycleStatus(t.id)} />
                    <PriorityBadge value={t.priority} onClick={() => cyclePriority(t.id)} />
                    <button className="row-del" onClick={() => removeTask(t.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
      </div>

      {(() => {
        if (urgentItems.length === 0) {
          return (
            <div className="urgent-bar">
              <span className="urgent-label urgent-label--off"><span className="urgent-dot urgent-dot--off" />URGENTES</span>
              <span className="urgent-empty">Sin tareas vencidas ni próximas por ahora.</span>
            </div>
          );
        }
        const current = urgentItems[Math.min(urgentIndex, urgentItems.length - 1)];
        const project = current.task.projectId
          ? areaMap[current.task.areaId]?.projects?.find((p) => p.id === current.task.projectId)
          : null;
        return (
          <div className="urgent-bar">
            <span className="urgent-label"><span className="urgent-dot" />URGENTES</span>
            <span className={`urgent-chip urgent-chip--${current.kind}`}>{current.label}</span>
            <span className="urgent-title">{current.task.title}</span>
            <span className="urgent-meta">
              {areaMap[current.task.areaId]?.name}{project ? ` · ${project.name}` : ""}
            </span>
            <span className="urgent-spacer" />
            <span className="urgent-count mono">{urgentIndex + 1} / {urgentItems.length}</span>
          </div>
        );
      })()}

      {showEncSettings && (
        <div className="modal-overlay" onClick={closeEncSettings}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeEncSettings}><X size={16} /></button>
            <div className="modal-title">Cifrado de extremo a extremo</div>

            {encSettingsView === "status" && (
              <>
                <div className="modal-text">
                  {isEncrypted
                    ? "Tus datos están cifrados en tu navegador antes de llegar a Supabase (AES-256-GCM). Ni Supabase ni nadie con acceso a la base puede leerlos."
                    : "Tus datos se guardan en Supabase sin cifrar. Podés activar el cifrado de extremo a extremo cuando quieras."}
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={closeEncSettings}>Cerrar</button>
                  {isEncrypted ? (
                    <button className="modal-btn modal-btn--danger" onClick={() => setEncSettingsView("disable-confirm")}>
                      Desactivar cifrado
                    </button>
                  ) : (
                    <button className="modal-btn modal-btn--primary" onClick={() => setEncSettingsView("enable")}>
                      Activar cifrado
                    </button>
                  )}
                </div>
              </>
            )}

            {encSettingsView === "disable-confirm" && (
              <>
                <div className="modal-text">
                  Ingresá tu contraseña de cifrado actual para confirmar que querés desactivarlo.
                  Una vez desactivado, tus datos quedan en texto plano en Supabase.
                </div>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Contraseña de cifrado actual"
                  autoFocus
                  value={encPass}
                  onChange={(e) => setEncPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDisableEncryption()}
                />
                {encError && <div className="settings-error">{encError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setEncSettingsView("status"); setEncPass(""); setEncError(""); }}>
                    Cancelar
                  </button>
                  <button className="modal-btn modal-btn--danger" disabled={encBusy} onClick={handleDisableEncryption}>
                    {encBusy ? "Verificando..." : "Confirmar y desactivar"}
                  </button>
                </div>
              </>
            )}

            {encSettingsView === "enable" && (
              <>
                <div className="modal-text">
                  Creá una contraseña de cifrado. Es distinta de tu contraseña de acceso y nunca sale de
                  este navegador. Si la olvidás, no hay forma de recuperar los datos.
                </div>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Contraseña de cifrado"
                  autoFocus
                  value={encPass}
                  onChange={(e) => setEncPass(e.target.value)}
                />
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Repetí la contraseña"
                  value={encPass2}
                  onChange={(e) => setEncPass2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEncSetup()}
                />
                {encError && <div className="settings-error">{encError}</div>}
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => { setEncSettingsView("status"); setEncPass(""); setEncPass2(""); setEncError(""); }}>
                    Cancelar
                  </button>
                  <button className="modal-btn modal-btn--primary" disabled={encBusy} onClick={handleEncSetup}>
                    {encBusy ? "Activando..." : "Activar cifrado"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSettingsPanel && (
        <div className="modal-overlay" onClick={() => { setShowSettingsPanel(false); setConfirmingWipe(false); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setShowSettingsPanel(false); setConfirmingWipe(false); }}><X size={16} /></button>
            <div className="modal-title">Configuración</div>

            {!confirmingWipe ? (
              <>
                <div className="modal-text">
                  Backup manual: descargá tus datos a un archivo, o restaurá desde uno. Independiente de la
                  sincronización con Supabase — sirve como copia de respaldo aparte.
                </div>
                <div className="modal-actions" style={{ justifyContent: "flex-start", gap: 10 }}>
                  <button className="modal-btn modal-btn--cancel" onClick={exportData}><Download size={13} /> Exportar</button>
                  <button className="modal-btn modal-btn--cancel" onClick={() => restoreInputRef.current?.click()}><Upload size={13} /> Restaurar</button>
                </div>

                <div className="settings-danger-zone">
                  <div className="settings-row-title">Borrar todos los datos</div>
                  <div className="settings-row-desc">Elimina todas las áreas, proyectos y tareas de tu cuenta. No se puede deshacer.</div>
                  <button className="modal-btn modal-btn--danger" onClick={() => setConfirmingWipe(true)}>Borrar todos los datos</button>
                </div>

                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => setShowSettingsPanel(false)}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-text">
                  ¿Borrar <b style={{ color: "var(--alta)" }}>todas</b> tus áreas, proyectos y tareas? Esta acción no se puede deshacer.
                </div>
                <div className="modal-actions">
                  <button className="modal-btn modal-btn--cancel" onClick={() => setConfirmingWipe(false)}>Cancelar</button>
                  <button className="modal-btn modal-btn--danger" onClick={wipeAllData}>Sí, borrar todo</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (() => {
        const isArea = deleteTarget.type === "area";
        const area = isArea ? areaMap[deleteTarget.id] : areaMap[deleteTarget.areaId];
        const project = isArea ? null : area?.projects?.find((p) => p.id === deleteTarget.id);
        const count = isArea
          ? tasks.filter((t) => t.areaId === deleteTarget.id).length
          : tasks.filter((t) => t.projectId === deleteTarget.id).length;
        return (
          <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">{isArea ? `¿Eliminar el área "${area?.name}"?` : `¿Eliminar el proyecto "${project?.name}"?`}</div>
              <div className="modal-text">
                {isArea
                  ? (count > 0 ? `Esto también va a borrar sus ${count} tarea${count === 1 ? "" : "s"}. Esta acción no se puede deshacer.` : "Esta acción no se puede deshacer.")
                  : (count > 0 ? `Las ${count} tarea${count === 1 ? "" : "s"} de este proyecto van a quedar sin proyecto asignado, dentro de "${area?.name}".` : "Esta acción no se puede deshacer.")}
              </div>
              <div className="modal-actions">
                <button className="modal-btn modal-btn--cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="modal-btn modal-btn--danger" onClick={confirmDelete}>{isArea ? "Eliminar área" : "Eliminar proyecto"}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
