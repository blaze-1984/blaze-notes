import { useState, useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "blazenotes_v2";
const THEME_KEY = "blazenotes_theme";
const FOLDERS_KEY = "blazenotes_folders_v2";

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

export default function BlazeNotes() {
  const [theme, setTheme] = useState(() => loadData(THEME_KEY, "dark"));
  const dark = theme === "dark";
  const [notes, setNotesRaw] = useState(() => loadData(STORAGE_KEY, []));
  const [folders, setFoldersRaw] = useState(() => loadData(FOLDERS_KEY, ["Ideas", "Processes", "Commands"]));
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

  const setNotes = useCallback((val) => {
    setNotesRaw(prev => { const next = typeof val === "function" ? val(prev) : val; saveData(STORAGE_KEY, next); return next; });
  }, []);
  const setFolders = useCallback((val) => {
    setFoldersRaw(prev => { const next = typeof val === "function" ? val(prev) : val; saveData(FOLDERS_KEY, next); return next; });
  }, []);

  const toggleTheme = () => { const n = dark ? "light" : "dark"; setTheme(n); saveData(THEME_KEY, n); };
  const openNew = () => { setEditTitle(""); setEditBody(""); setEditFolder(folders[0] || ""); setEditColor(null); setActiveNote(null); setModal("note"); };
  const openEdit = (note) => { setEditTitle(note.title); setEditBody(note.body || ""); setEditFolder(note.folder); setEditColor(note.color || null); setActiveNote(note); setModal("note"); };

  const saveNote = () => {
    if (!editTitle.trim()) return;
    if (!activeNote) {
      setNotes(prev => [{ id: generateId(), title: editTitle.trim(), body: editBody, folder: editFolder, color: editColor, pinned: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
    } else {
      setNotes(prev => prev.map(n => n.id === activeNote.id ? { ...n, title: editTitle.trim(), body: editBody, folder: editFolder, color: editColor, updatedAt: new Date().toISOString() } : n));
    }
    setModal(null);
  };

  const deleteNote = (id) => { setNotes(prev => prev.filter(n => n.id !== id)); setDeleteConfirm(null); setModal(null); };
  const togglePin = (id, e) => { e.stopPropagation(); setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n)); };
  const moveNote = (noteId, newFolder) => { setNotes(prev => prev.map(n => n.id === noteId ? { ...n, folder: newFolder, updatedAt: new Date().toISOString() } : n)); setMovingNoteId(null); };
  const handleCopy = (note, e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(note.body || note.title).catch(() => {});
    setCopyFeedback(note.id);
    setTimeout(() => setCopyFeedback(null), 1500);
  };

  const addFolder = () => {
    const t = folderInput.trim();
    if (!t || folders.includes(t)) return;
    setFolders(prev => [...prev, t]);
    setFolderInput(""); setFolderModal(null);
  };
  const renameFolder = () => {
    const t = folderInput.trim();
    if (!t || folders.includes(t)) return;
    setFolders(prev => prev.map(f => f === folderTarget ? t : f));
    setNotes(prev => prev.map(n => n.folder === folderTarget ? { ...n, folder: t } : n));
    if (filter === folderTarget) setFilter(t);
    setFolderInput(""); setFolderModal(null);
  };
  const deleteFolder = () => {
    const fallback = folders.find(f => f !== folderTarget) || "";
    setFolders(prev => prev.filter(f => f !== folderTarget));
    setNotes(prev => prev.map(n => n.folder === folderTarget ? { ...n, folder: fallback } : n));
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
            </div>
          </div>
          <div style={{ height: 3, background: dark ? "#1e1e2a" : "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: notes.length ? `${(notes.filter(n=>n.pinned).length/notes.length)*100}%` : "0%", background: `linear-gradient(90deg, ${accent}, #a78bfa)`, borderRadius: 4, transition: "width 0.4s" }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>

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

  const nextMatch = () => {
    const next = (matchIdx + 1) % matches.length;
    setMatchIdx(next);
    jumpToMatch(next);
  };
  const prevMatch = () => {
    const prev = (matchIdx - 1 + matches.length) % matches.length;
    setMatchIdx(prev);
    jumpToMatch(prev);
  };

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

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:textPrimary }}>{activeNote ? "EDIT NOTE" : "NEW NOTE"}</h2>
          <button className="ib" onClick={onClose} style={{ color:textSecondary, fontSize:16, width:32, height:32 }}>✕</button>
        </div>

        {/* Always visible search bar */}
        <div style={{ background: dark?"#1a1a28":"#f0f0ff", border:`1px solid ${accent}33`, borderRadius:10, padding:"10px 14px", marginBottom:18, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ color:textSecondary, fontSize:13 }}>⌕</span>
          <input
            style={{ flex:1, background:"transparent", border:"none", outline:"none", color:textPrimary, fontSize:13, fontFamily:"inherit" }}
            placeholder="Search inside this note..."
            value={findText}
            onChange={e => setFindText(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter") nextMatch(); }}
          />
          <span style={{ color:textSecondary, fontSize:11, whiteSpace:"nowrap" }}>
            {matches.length > 0 ? `${matchIdx+1}/${matches.length}` : findText ? "0 results" : ""}
          </span>
          {matches.length > 0 && <>
            <button onClick={prevMatch} style={{ background:"none", border:`1px solid ${inputBorder}`, borderRadius:6, color:textSecondary, cursor:"pointer", padding:"3px 8px", fontSize:12 }}>↑</button>
            <button onClick={nextMatch} style={{ background:"none", border:`1px solid ${inputBorder}`, borderRadius:6, color:textSecondary, cursor:"pointer", padding:"3px 8px", fontSize:12 }}>↓</button>
          </>}
          {findText && <button onClick={() => setFindText("")} style={{ background:"none", border:"none", color:textSecondary, cursor:"pointer", fontSize:14 }}>✕</button>}
        </div>

        {/* Two column layout */}
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

        {/* Color */}
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

        {/* Content */}
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

        {/* Actions */}
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