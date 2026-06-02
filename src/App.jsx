import { useState, useCallback, useEffect, useRef } from "react";
import { auth, provider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy
} from "firebase/firestore";

const STORAGE_KEY = "blazenotes_v2";
const THEME_KEY = "blazenotes_theme";
const FOLDERS_KEY = "blazenotes_folders_v2";
const MIGRATED_KEY = "blazenotes_migrated";

const NOTE_COLORS = [
  { id: "none", value: null },
  { id: "purple", value: "#7c6af7" },
  { id: "cyan", value: "#22d3ee" },
  { id: "green", value: "#4ade80" },
  { id: "orange", value: "#fb923c" },
  { id: "pink", value: "#f472b6" },
  { id: "red", value: "#f87171" },
  { id: "yellow", value: "#facc15" },
];

function generateId() { return Math.random().toString(36).slice(2, 10); }
function loadData(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}
function saveData(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── LOGIN SCREEN ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading }) {
  const dark = true;
  return (
    <div style={{ minHeight: "100vh", background: "#0d0d12", fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800;900&display=swap');`}</style>
      <div style={{ textAlign: "center", padding: 40 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 48, fontWeight: 900, color: "#eeeef8", letterSpacing: "-0.03em", marginBottom: 8 }}>
          BLAZE<span style={{ color: "#7c6af7" }}>NOTES</span>
        </h1>
        <p style={{ color: "#6666aa", fontSize: 13, marginBottom: 40, letterSpacing: "0.06em" }}>YOUR NOTES. EVERYWHERE.</p>
        <button
          onClick={onLogin}
          disabled={loading}
          style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "#ffffff", border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 14, fontFamily: "'DM Mono', monospace", fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, transition: "opacity 0.2s, transform 0.15s" }}
          onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}
        >
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.01c-.72.48-1.63.76-2.7.76-2.08 0-3.84-1.4-4.47-3.29H1.87v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.51 10.52A4.8 4.8 0 0 1 4.26 9c0-.53.09-1.04.25-1.52V5.41H1.87A8 8 0 0 0 .98 9c0 1.29.31 2.51.89 3.59l2.64-2.07z"/><path fill="#EA4335" d="M8.98 3.58c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 8.98 1a8 8 0 0 0-7.11 4.41l2.64 2.07c.63-1.89 2.39-3.3 4.47-3.3z"/></svg>
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>
      </div>
    </div>
  );
}

// ─── MIGRATION BANNER ────────────────────────────────────────────────────────
function MigrationBanner({ onMigrate, onDismiss }) {
  return (
    <div style={{ background: "#7c6af722", border: "1px solid #7c6af755", borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <span style={{ color: "#eeeef8", fontSize: 13, fontWeight: 500 }}>📦 You have local notes</span>
        <span style={{ color: "#6666aa", fontSize: 12, marginLeft: 10 }}>Import them to your cloud account?</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onMigrate} style={{ background: "#7c6af7", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit" }}>Import Now</button>
        <button onClick={onDismiss} style={{ background: "transparent", border: "1px solid #28283a", borderRadius: 8, color: "#6666aa", fontSize: 12, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function BlazeNotes() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showMigration, setShowMigration] = useState(false);

  const [theme, setTheme] = useState(() => loadData(THEME_KEY, "dark"));
  const dark = theme === "dark";
  const [notes, setNotesRaw] = useState([]);
  const [folders, setFoldersRaw] = useState(["Ideas", "Processes", "Commands"]);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [activeNote, setActiveNote] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [editColor, setEditColor] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [folderModal, setFolderModal] = useState(null);
  const [folderTarget, setFolderTarget] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [movingNoteId, setMovingNoteId] = useState(null);

  // ── Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Firestore listeners when logged in
  useEffect(() => {
    if (!user) return;

    // Check if migration needed
    const localNotes = loadData(STORAGE_KEY, []);
    const alreadyMigrated = loadData(MIGRATED_KEY, false);
    if (localNotes.length > 0 && !alreadyMigrated) setShowMigration(true);

    // Listen to notes
    const notesRef = collection(db, "users", user.uid, "notes");
    const unsub1 = onSnapshot(query(notesRef), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotesRaw(data);
    });

    // Listen to folders doc
    const foldersRef = doc(db, "users", user.uid, "meta", "folders");
    const unsub2 = onSnapshot(foldersRef, (snap) => {
      if (snap.exists()) setFoldersRaw(snap.data().list || []);
    });

    return () => { unsub1(); unsub2(); };
  }, [user]);

  // ── Save folders to Firestore
  const saveFoldersToFirestore = async (list) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "meta", "folders");
    await setDoc(ref, { list });
  };

  // ── Note helpers
  const saveNoteToFirestore = async (note) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "notes", note.id);
    await setDoc(ref, note);
  };
  const deleteNoteFromFirestore = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "notes", id));
  };

  const setNotes = useCallback((val) => {
    setNotesRaw(prev => typeof val === "function" ? val(prev) : val);
  }, []);

  const setFolders = useCallback((val) => {
    setFoldersRaw(prev => {
      const next = typeof val === "function" ? val(prev) : val;
      saveFoldersToFirestore(next);
      return next;
    });
  }, [user]);

  // ── Migration
  const handleMigrate = async () => {
    const localNotes = loadData(STORAGE_KEY, []);
    const localFolders = loadData(FOLDERS_KEY, []);
    for (const note of localNotes) await saveNoteToFirestore(note);
    if (localFolders.length > 0) await saveFoldersToFirestore(localFolders);
    saveData(MIGRATED_KEY, true);
    setShowMigration(false);
  };

  // ── Auth actions
  const handleLogin = async () => {
    setLoginLoading(true);
    try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
    setLoginLoading(false);
  };
  const handleSignOut = async () => { await signOut(auth); setNotesRaw([]); };

  const toggleTheme = () => { const n = dark ? "light" : "dark"; setTheme(n); saveData(THEME_KEY, n); };
  const openNew = () => { setEditTitle(""); setEditBody(""); setEditFolder(folders[0] || ""); setEditColor(null); setActiveNote(null); setModal("note"); };
  const openEdit = (note) => { setEditTitle(note.title); setEditBody(note.body || ""); setEditFolder(note.folder); setEditColor(note.color || null); setActiveNote(note); setModal("note"); };

  const saveNote = async () => {
    if (!editTitle.trim()) return;
    if (!activeNote) {
      const note = { id: generateId(), title: editTitle.trim(), body: editBody, folder: editFolder, color: editColor, pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await saveNoteToFirestore(note);
    } else {
      const updated = { ...activeNote, title: editTitle.trim(), body: editBody, folder: editFolder, color: editColor, updatedAt: new Date().toISOString() };
      await saveNoteToFirestore(updated);
    }
    setModal(null);
  };

  const deleteNote = async (id) => { await deleteNoteFromFirestore(id); setDeleteConfirm(null); setModal(null); };
  const togglePin = async (id, e) => {
    e.stopPropagation();
    const note = notes.find(n => n.id === id);
    if (note) await saveNoteToFirestore({ ...note, pinned: !note.pinned });
  };
  const moveNote = async (noteId, newFolder) => {
    const note = notes.find(n => n.id === noteId);
    if (note) await saveNoteToFirestore({ ...note, folder: newFolder, updatedAt: new Date().toISOString() });
    setMovingNoteId(null);
  };
  const handleCopy = (note, e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(note.body || note.title).catch(() => {});
    setCopyFeedback(note.id);
    setTimeout(() => setCopyFeedback(null), 1500);
  };

  const addFolder = async () => {
    const t = folderInput.trim();
    if (!t || folders.includes(t)) return;
    const next = [...folders, t];
    await saveFoldersToFirestore(next);
    setFoldersRaw(next);
    setFolderInput(""); setFolderModal(null);
  };
  const renameFolder = async () => {
    const t = folderInput.trim();
    if (!t || folders.includes(t)) return;
    const next = folders.map(f => f === folderTarget ? t : f);
    await saveFoldersToFirestore(next);
    setFoldersRaw(next);
    const affected = notes.filter(n => n.folder === folderTarget);
    for (const note of affected) await saveNoteToFirestore({ ...note, folder: t });
    if (filter === folderTarget) setFilter(t);
    setFolderInput(""); setFolderModal(null);
  };
  const deleteFolder = async () => {
    const fallback = folders.find(f => f !== folderTarget) || "";
    const next = folders.filter(f => f !== folderTarget);
    await saveFoldersToFirestore(next);
    setFoldersRaw(next);
    const affected = notes.filter(n => n.folder === folderTarget);
    for (const note of affected) await saveNoteToFirestore({ ...note, folder: fallback });
    if (filter === folderTarget) setFilter("All");
    setFolderModal(null);
  };

  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  const filtered = sorted
    .filter(n => filter === "All" || n.folder === filter)
    .filter(n => !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.body?.toLowerCase().includes(search.toLowerCase()));

  const pinned = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);
  const recent = unpinned.slice(0, 3);

  // Theme vars
  const bg = dark ? "#0d0d12" : "#f0f0f6";
  const surface = dark ? "#13131a" : "#ffffff";
  const card = dark ? "#17171f" : "#ffffff";
  const cardBorder = dark ? "#22222e" : "#e4e4f0";
  const textPrimary = dark ? "#eeeef8" : "#111128";
  const textSecondary = dark ? "#6666aa" : "#9999bb";
  const accent = "#7c6af7";
  const accentSoft = dark ? "#7c6af718" : "#7c6af712";
  const inputBg = dark ? "#17171f" : "#f8f8ff";
  const inputBorder = dark ? "#28283a" : "#dcdcf0";
  const modalBg = dark ? "#14141c" : "#ffffff";

  const S = ({ onClick, children, style, ...rest }) => (
    <button onClick={onClick} style={{ fontFamily: "inherit", cursor: "pointer", transition: "all 0.15s", border: "none", ...style }} {...rest}>{children}</button>
  );

  const overlay = "rgba(0,0,0,0.65)";

  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#0d0d12", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "#6666aa", fontFamily: "monospace", fontSize: 13 }}>Loading...</span>
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} />;

  return (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "'DM Mono', monospace", transition: "background 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #7c6af744; border-radius: 4px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.96) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .nc { animation: fadeUp 0.22s ease; transition: transform 0.18s, box-shadow 0.18s, border-color 0.2s !important; }
        .nc:hover { transform: translateY(-3px); box-shadow: 0 10px 36px rgba(124,106,247,0.13) !important; }
        .ib { background:none !important; border:none; cursor:pointer; border-radius:6px; display:flex; align-items:center; justify-content:center; transition:all 0.15s; }
        .ib:hover { background: rgba(124,106,247,0.15) !important; color: #7c6af7 !important; }
        input, textarea, select { font-family: 'DM Mono', monospace !important; }
        textarea { resize: vertical; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "32px 28px 24px", background: surface, borderBottom: `1px solid ${cardBorder}`, transition: "background 0.3s" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 900, color: textPrimary, letterSpacing: "-0.03em" }}>
                BLAZE<span style={{ color: accent }}>NOTES</span>
              </h1>
              <span style={{ color: accent, fontSize: 13, letterSpacing: "0.08em" }}>{notes.length} notes</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <S onClick={openNew} style={{ background: accent, borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 500, padding: "10px 20px", letterSpacing: "0.04em" }}
                onMouseOver={e => e.currentTarget.style.opacity="0.85"} onMouseOut={e => e.currentTarget.style.opacity="1"}>
                + NEW NOTE
              </S>
              <button className="ib" onClick={toggleTheme} style={{ width: 40, height: 40, fontSize: 17, color: textSecondary }}>{dark ? "☀️" : "🌙"}</button>
              {/* User avatar + sign out */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {user.photoURL && <img src={user.photoURL} alt="avatar" style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${accent}44` }} />}
                <S onClick={handleSignOut} style={{ background: "transparent", border: `1px solid ${inputBorder}`, borderRadius: 8, color: textSecondary, fontSize: 11, padding: "6px 12px" }}>Sign out</S>
              </div>
            </div>
          </div>
          <div style={{ height: 3, background: dark ? "#1e1e2a" : "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: notes.length ? `${(notes.filter(n=>n.pinned).length/notes.length)*100}%` : "0%", background: `linear-gradient(90deg, ${accent}, #a78bfa)`, borderRadius: 4, transition: "width 0.4s" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>

        {/* MIGRATION BANNER */}
        {showMigration && <MigrationBanner onMigrate={handleMigrate} onDismiss={() => { saveData(MIGRATED_KEY, true); setShowMigration(false); }} />}

        {/* SEARCH */}
        <div style={{ position: "relative", marginBottom: 18 }}>
          <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: textSecondary, fontSize: 15, pointerEvents: "none" }}>⌕</span>
          <input style={{ width: "100%", background: inputBg, border: `1px solid ${inputBorder}`, borderRadius: 12, color: textPrimary, fontSize: 14, padding: "12px 16px 12px 40px", outline: "none", transition: "border-color 0.2s" }}
            placeholder="Search notes..." value={search} onChange={e => setSearch(e.target.value)}
            onFocus={e => e.target.style.borderColor=accent} onBlur={e => e.target.style.borderColor=inputBorder} />
        </div>

        {/* FOLDERS */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          {["All", ...folders].map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center" }}>
              <S onClick={() => setFilter(f)}
                style={{ background: filter===f ? accentSoft : "transparent", border: `1px solid ${filter===f ? accent : inputBorder}`, borderRadius: f==="All" ? 20 : "20px 0 0 20px", color: filter===f ? accent : textSecondary, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", padding: f==="All" ? "6px 14px" : "6px 10px 6px 14px" }}>
                {f}{f !== "All" && <span style={{ marginLeft: 5, opacity: 0.5 }}>{notes.filter(n=>n.folder===f).length}</span>}
              </S>
              {f !== "All" && (
                <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${filter===f ? accent : inputBorder}`, borderLeft: "none", borderRadius: "0 20px 20px 0", overflow: "hidden" }}>
                  <S onClick={() => { setFolderTarget(f); setFolderInput(f); setFolderModal("rename"); }}
                    style={{ background: filter===f ? accentSoft : "transparent", color: textSecondary, fontSize: 9, padding: "3px 7px", borderBottom: `1px solid ${inputBorder}` }} title="Rename">✎</S>
                  <S onClick={() => { setFolderTarget(f); setFolderModal("delete"); }}
                    style={{ background: filter===f ? accentSoft : "transparent", color: textSecondary, fontSize: 9, padding: "3px 7px" }} title="Delete">✕</S>
                </div>
              )}
            </div>
          ))}
          <S onClick={() => { setFolderInput(""); setFolderModal("add"); }}
            style={{ background: "transparent", border: `1px dashed ${inputBorder}`, borderRadius: 20, color: textSecondary, fontSize: 11, letterSpacing: "0.06em", padding: "6px 14px" }}>
            + FOLDER
          </S>
        </div>

        {/* PINNED */}
        {pinned.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ color: textSecondary, fontSize: 10, letterSpacing: "0.12em", marginBottom: 12 }}>📌 PINNED</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 12 }}>
              {pinned.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onCopy={handleCopy} onMove={setMovingNoteId} onDelete={setDeleteConfirm} copyFeedback={copyFeedback} tp={textPrimary} ts={textSecondary} card={card} cb={cardBorder} accent={accent} as={accentSoft} />)}
            </div>
          </div>
        )}

        {/* RECENTLY EDITED */}
        {!search && filter==="All" && recent.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ color: textSecondary, fontSize: 10, letterSpacing: "0.12em", marginBottom: 12 }}>🕐 RECENTLY EDITED</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 12 }}>
              {recent.map(n => <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onCopy={handleCopy} onMove={setMovingNoteId} onDelete={setDeleteConfirm} copyFeedback={copyFeedback} tp={textPrimary} ts={textSecondary} card={card} cb={cardBorder} accent={accent} as={accentSoft} />)}
            </div>
          </div>
        )}

        {/* ALL NOTES */}
        <div>
          {(search || filter!=="All") && <div style={{ color: textSecondary, fontSize: 10, letterSpacing: "0.12em", marginBottom: 12 }}>{search ? `RESULTS FOR "${search.toUpperCase()}"` : filter.toUpperCase()}</div>}
          {!search && filter==="All" && unpinned.length > 3 && <div style={{ color: textSecondary, fontSize: 10, letterSpacing: "0.12em", marginBottom: 12 }}>ALL NOTES</div>}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: textSecondary, fontSize: 13, padding: "60px 0", letterSpacing: "0.05em" }}>
              {search ? `NO RESULTS FOR "${search.toUpperCase()}"` : "NO NOTES YET — HIT + NEW NOTE ✦"}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 12 }}>
              {(search || filter!=="All" ? filtered : unpinned.slice(3)).map(n => (
                <NoteCard key={n.id} note={n} onOpen={openEdit} onPin={togglePin} onCopy={handleCopy} onMove={setMovingNoteId} onDelete={setDeleteConfirm} copyFeedback={copyFeedback} tp={textPrimary} ts={textSecondary} card={card} cb={cardBorder} accent={accent} as={accentSoft} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* NOTE MODAL */}
      {modal === "note" && (
        <NoteModal
          activeNote={activeNote} editTitle={editTitle} setEditTitle={setEditTitle}
          editBody={editBody} setEditBody={setEditBody} editFolder={editFolder} setEditFolder={setEditFolder}
          editColor={editColor} setEditColor={setEditColor} folders={folders}
          onSave={saveNote} onClose={() => setModal(null)} onDelete={() => setDeleteConfirm(activeNote?.id)}
          modalBg={modalBg} cardBorder={cardBorder} inputBg={inputBg} inputBorder={inputBorder}
          textPrimary={textPrimary} textSecondary={textSecondary} accent={accent} dark={dark} S={S}
        />
      )}

      {/* FOLDER MODAL */}
      {(folderModal==="add"||folderModal==="rename") && (
        <div style={{ position:"fixed", inset:0, background:overlay, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeIn 0.2s" }}
          onClick={e => e.target===e.currentTarget && setFolderModal(null)}>
          <div style={{ background:modalBg, border:`1px solid ${cardBorder}`, borderRadius:18, padding:28, width:"100%", maxWidth:360, animation:"scaleIn 0.2s" }}>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:textPrimary, marginBottom:20 }}>{folderModal==="add"?"NEW FOLDER":"RENAME FOLDER"}</h2>
            <input autoFocus style={{ width:"100%", background:inputBg, border:`1px solid ${inputBorder}`, borderRadius:10, color:textPrimary, fontSize:14, padding:"11px 14px", outline:"none", marginBottom:16 }}
              placeholder="Folder name..." value={folderInput} onChange={e => setFolderInput(e.target.value)}
              onKeyDown={e => e.key==="Enter"&&(folderModal==="add"?addFolder():renameFolder())}
              onFocus={e => e.target.style.borderColor=accent} onBlur={e => e.target.style.borderColor=inputBorder} />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <S onClick={() => setFolderModal(null)} style={{ background:"transparent", border:`1px solid ${inputBorder}`, borderRadius:10, color:textSecondary, fontSize:12, padding:"10px 16px" }}>CANCEL</S>
              <S onClick={folderModal==="add"?addFolder:renameFolder} style={{ background:accent, borderRadius:10, color:"#fff", fontSize:12, fontWeight:500, padding:"10px 20px" }}>{folderModal==="add"?"CREATE":"RENAME"}</S>
            </div>
          </div>
        </div>
      )}

      {/* DELETE FOLDER */}
      {folderModal==="delete" && (
        <div style={{ position:"fixed", inset:0, background:overlay, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeIn 0.2s" }}
          onClick={e => e.target===e.currentTarget && setFolderModal(null)}>
          <div style={{ background:modalBg, border:`1px solid ${cardBorder}`, borderRadius:18, padding:28, width:"100%", maxWidth:340, textAlign:"center", animation:"scaleIn 0.2s" }}>
            <div style={{ fontSize:28, marginBottom:12 }}>🗂️</div>
            <h3 style={{ color:textPrimary, fontSize:16, fontWeight:600, marginBottom:8 }}>Delete "{folderTarget}"?</h3>
            <p style={{ color:textSecondary, fontSize:13, marginBottom:22 }}>Notes will move to your first folder.</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <S onClick={() => setFolderModal(null)} style={{ background:"transparent", border:`1px solid ${inputBorder}`, borderRadius:10, color:textSecondary, fontSize:12, padding:"10px 20px" }}>CANCEL</S>
              <S onClick={deleteFolder} style={{ background:"#f87171", borderRadius:10, color:"#fff", fontSize:12, fontWeight:500, padding:"10px 20px" }}>DELETE</S>
            </div>
          </div>
        </div>
      )}

      {/* MOVE NOTE */}
      {movingNoteId && (
        <div style={{ position:"fixed", inset:0, background:overlay, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeIn 0.2s" }}
          onClick={e => e.target===e.currentTarget && setMovingNoteId(null)}>
          <div style={{ background:modalBg, border:`1px solid ${cardBorder}`, borderRadius:18, padding:28, width:"100%", maxWidth:340, animation:"scaleIn 0.2s" }}>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:textPrimary, marginBottom:20 }}>MOVE TO FOLDER</h2>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {folders.map(f => (
                <S key={f} onClick={() => moveNote(movingNoteId, f)}
                  style={{ background:inputBg, border:`1px solid ${inputBorder}`, borderRadius:10, color:textPrimary, fontSize:13, padding:"11px 16px", textAlign:"left" }}
                  onMouseOver={e => { e.currentTarget.style.borderColor=accent; e.currentTarget.style.color=accent; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor=inputBorder; e.currentTarget.style.color=textPrimary; }}>
                  {f}
                </S>
              ))}
            </div>
            <S onClick={() => setMovingNoteId(null)} style={{ background:"transparent", border:`1px solid ${inputBorder}`, borderRadius:10, color:textSecondary, fontSize:12, padding:"10px 16px", marginTop:16, width:"100%" }}>CANCEL</S>
          </div>
        </div>
      )}

      {/* DELETE NOTE */}
      {deleteConfirm && (
        <div style={{ position:"fixed", inset:0, background:overlay, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeIn 0.15s" }}
          onClick={e => e.target===e.currentTarget && setDeleteConfirm(null)}>
          <div style={{ background:modalBg, border:`1px solid ${cardBorder}`, borderRadius:18, padding:28, width:"100%", maxWidth:320, textAlign:"center", animation:"scaleIn 0.18s" }}>
            <div style={{ fontSize:28, marginBottom:12 }}>🗑️</div>
            <h3 style={{ color:textPrimary, fontSize:16, fontWeight:600, marginBottom:8 }}>Delete this note?</h3>
            <p style={{ color:textSecondary, fontSize:13, marginBottom:22 }}>This can't be undone.</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <S onClick={() => setDeleteConfirm(null)} style={{ background:"transparent", border:`1px solid ${inputBorder}`, borderRadius:10, color:textSecondary, fontSize:12, padding:"10px 20px" }}>CANCEL</S>
              <S onClick={() => deleteNote(deleteConfirm)} style={{ background:"#f87171", borderRadius:10, color:"#fff", fontSize:12, fontWeight:500, padding:"10px 20px" }}>DELETE</S>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onOpen, onPin, onCopy, onMove, onDelete, copyFeedback, tp, ts, card, cb, accent, as }) {
  return (
    <div className="nc" onClick={() => onOpen(note)}
      style={{ background:card, border:`1px solid ${note.color ? note.color+"55" : cb}`, borderTop:note.color?`3px solid ${note.color}`:`1px solid ${cb}`, borderRadius:14, padding:"16px 18px", cursor:"pointer", boxShadow:note.color?`0 2px 20px ${note.color}18`:"none" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:8 }}>
        <h3 style={{ color:tp, fontSize:14, fontWeight:500, lineHeight:1.4, wordBreak:"break-word", flex:1 }}>{note.title}</h3>
        <div style={{ display:"flex", gap:3, flexShrink:0 }} onClick={e => e.stopPropagation()}>
          <button className="ib" onClick={e => onPin(note.id,e)} title={note.pinned?"Unpin":"Pin"}
            style={{ width:26, height:26, fontSize:12, color:note.pinned?accent:ts }}>📌</button>
          <button className="ib" onClick={e => onCopy(note,e)} title="Copy"
            style={{ width:26, height:26, fontSize:11, color:copyFeedback===note.id?accent:ts }}>
            {copyFeedback===note.id?"✓":"⧉"}
          </button>
          <button className="ib" onClick={e => { e.stopPropagation(); onMove(note.id); }} title="Move"
            style={{ width:26, height:26, fontSize:12, color:ts }}>↗</button>
          <button className="ib" onClick={e => { e.stopPropagation(); onDelete(note.id); }} title="Delete"
            style={{ width:26, height:26, fontSize:11, color:ts }}>✕</button>
        </div>
      </div>
      {note.body && (
        <p style={{ color:ts, fontSize:12, lineHeight:1.6, marginBottom:12, display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
          {note.body}
        </p>
      )}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ background:as, color:accent, fontSize:9, letterSpacing:"0.08em", textTransform:"uppercase", padding:"3px 8px", borderRadius:20, border:`1px solid ${accent}33` }}>
          {note.folder}
        </span>
        <span style={{ color:ts, fontSize:10 }}>{timeAgo(note.updatedAt)}</span>
      </div>
    </div>
  );
}

function NoteModal({ activeNote, editTitle, setEditTitle, editBody, setEditBody, editFolder, setEditFolder, editColor, setEditColor, folders, onSave, onClose, onDelete, modalBg, cardBorder, inputBg, inputBorder, textPrimary, textSecondary, accent, dark, S }) {
  const [findText, setFindText] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const textareaRef = useRef(null);

  const matches = findText.trim()
    ? [...editBody.matchAll(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))]
    : [];

  useEffect(() => { setMatchIdx(0); }, [findText]);

  const jumpToMatch = (idx) => {
    if (!matches.length || !textareaRef.current) return;
    const match = matches[idx % matches.length];
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(match.index, match.index + findText.length);
    const lineHeight = 24;
    const lines = editBody.substring(0, match.index).split('\n').length;
    textareaRef.current.scrollTop = (lines - 3) * lineHeight;
  };

  const nextMatch = () => { const next = (matchIdx + 1) % matches.length; setMatchIdx(next); jumpToMatch(next); };
  const prevMatch = () => { const prev = (matchIdx - 1 + matches.length) % matches.length; setMatchIdx(prev); jumpToMatch(prev); };

  const NOTE_COLORS = [
    { id: "none", value: null },
    { id: "purple", value: "#7c6af7" },
    { id: "cyan", value: "#22d3ee" },
    { id: "green", value: "#4ade80" },
    { id: "orange", value: "#fb923c" },
    { id: "pink", value: "#f472b6" },
    { id: "red", value: "#f87171" },
    { id: "yellow", value: "#facc15" },
  ];

  const overlay = "rgba(0,0,0,0.65)";

  return (
    <div style={{ position:"fixed", inset:0, background:overlay, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20, animation:"fadeIn 0.2s" }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:modalBg, border:`1px solid ${cardBorder}`, borderRadius:18, padding:32, width:"100%", maxWidth:780, maxHeight:"92vh", overflowY:"auto", animation:"scaleIn 0.2s", position:"relative" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:textPrimary }}>{activeNote ? "EDIT NOTE" : "NEW NOTE"}</h2>
          <button className="ib" onClick={onClose} style={{ color:textSecondary, fontSize:16, width:32, height:32 }}>✕</button>
        </div>
        <div style={{ background: dark?"#1a1a28":"#f0f0ff", border:`1px solid ${accent}33`, borderRadius:10, padding:"10px 14px", marginBottom:18, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ color:textSecondary, fontSize:13 }}>⌕</span>
          <input style={{ flex:1, background:"transparent", border:"none", outline:"none", color:textPrimary, fontSize:13, fontFamily:"inherit" }}
            placeholder="Search inside this note..." value={findText} onChange={e => setFindText(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter") nextMatch(); }} />
          <span style={{ color:textSecondary, fontSize:11, whiteSpace:"nowrap" }}>
            {matches.length > 0 ? `${matchIdx+1}/${matches.length}` : findText ? "0 results" : ""}
          </span>
          {matches.length > 0 && <>
            <button onClick={prevMatch} style={{ background:"none", border:`1px solid ${inputBorder}`, borderRadius:6, color:textSecondary, cursor:"pointer", padding:"3px 8px", fontSize:12 }}>↑</button>
            <button onClick={nextMatch} style={{ background:"none", border:`1px solid ${inputBorder}`, borderRadius:6, color:textSecondary, cursor:"pointer", padding:"3px 8px", fontSize:12 }}>↓</button>
          </>}
          {findText && <button onClick={() => setFindText("")} style={{ background:"none", border:"none", color:textSecondary, cursor:"pointer", fontSize:14 }}>✕</button>}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          <div>
            <label style={{ color:textSecondary, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:6 }}>Title *</label>
            <input autoFocus style={{ width:"100%", background:inputBg, border:`1px solid ${inputBorder}`, borderRadius:10, color:textPrimary, fontSize:14, padding:"11px 14px", outline:"none" }}
              placeholder="Note title..." value={editTitle} onChange={e => setEditTitle(e.target.value)}
              onFocus={e => e.target.style.borderColor=accent} onBlur={e => e.target.style.borderColor=inputBorder} />
          </div>
          <div>
            <label style={{ color:textSecondary, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:6 }}>Folder</label>
            <select style={{ width:"100%", background:inputBg, border:`1px solid ${inputBorder}`, borderRadius:10, color:textPrimary, fontSize:13, padding:"11px 14px", outline:"none", cursor:"pointer" }}
              value={editFolder} onChange={e => setEditFolder(e.target.value)}>
              {folders.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ color:textSecondary, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", display:"block", marginBottom:8 }}>Color Label</label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {NOTE_COLORS.map(c => (
              <div key={c.id} onClick={() => setEditColor(c.value)}
                style={{ width:26, height:26, borderRadius:"50%", background:c.value||(dark?"#2a2a3a":"#e0e0f0"), border:`2px solid ${editColor===c.value ? accent:"transparent"}`, cursor:"pointer", transition:"border 0.15s", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {editColor===c.value && <span style={{ color:"#fff", fontSize:10 }}>✓</span>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
            <label style={{ color:textSecondary, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase" }}>Content</label>
            <span style={{ color:textSecondary, fontSize:10 }}>{editBody.length} chars · {editBody.trim() ? editBody.trim().split(/\s+/).length : 0} words</span>
          </div>
          <textarea ref={textareaRef}
            style={{ width:"100%", background:inputBg, border:`1px solid ${inputBorder}`, borderRadius:10, color:textPrimary, fontSize:13, padding:"14px 16px", outline:"none", minHeight:280, lineHeight:1.8, resize:"vertical" }}
            placeholder="Write anything... (Press Ctrl+F to search inside)" value={editBody} onChange={e => setEditBody(e.target.value)}
            onFocus={e => e.target.style.borderColor=accent} onBlur={e => e.target.style.borderColor=inputBorder} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          {activeNote && <S onClick={onDelete} style={{ background:"#f8717122", border:"1px solid #f8717144", borderRadius:10, color:"#f87171", fontSize:12, padding:"10px 16px" }}>DELETE</S>}
          <div style={{ display:"flex", gap:10, marginLeft:"auto" }}>
            <S onClick={onClose} style={{ background:"transparent", border:`1px solid ${inputBorder}`, borderRadius:10, color:textSecondary, fontSize:12, padding:"10px 16px" }}>CANCEL</S>
            <S onClick={onSave} style={{ background:accent, borderRadius:10, color:"#fff", fontSize:12, fontWeight:500, padding:"10px 20px", opacity:editTitle.trim()?1:0.5 }}>{activeNote?"UPDATE":"SAVE NOTE"}</S>
          </div>
        </div>
      </div>
    </div>
  );
}