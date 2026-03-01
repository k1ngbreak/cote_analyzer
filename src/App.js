import React, { useState, useEffect, useCallback } from "react";

// ─── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL = "https://smukymittiagdivppblk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdWt5bWl0dGlhZ2RpdnBwYmxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNjQ3MTYsImV4cCI6MjA4Nzk0MDcxNn0.wobc_-76HeUph69H3qsBpgCUbRXPin5JZptO767t89w";

const headers = {
  "Content-Type": "application/json",
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Prefer: "return=representation",
};

async function sbGet(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc&limit=1`, { headers });
  const rows = await res.json();
  if (!rows || rows.length === 0) return [];
  return rows[0].data || [];
}

async function sbSet(table, rowId, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${rowId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ data }),
  });
}

async function sbInit(table) {
  // Check if row exists, if not insert
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers });
  const rows = await res.json();
  if (!rows || rows.length === 0) {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: [] }),
    });
    const inserted = await ins.json();
    return inserted[0]?.id || 1;
  }
  return rows[0].id;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function analyzeOdds(before, after, thUp, thDown) {
  const diff = after - before;
  const movement = diff >= 0 ? "up" : "down";
  const breach = movement === "up" ? diff >= thUp : Math.abs(diff) < thDown;
  return { before, after, diff, movement, breach };
}

// ─── Components ───────────────────────────────────────────────────────────────

function OddsInput({ label, color, value, onChange }) {
  const S = { display: "flex", flexDirection: "column", gap: "0.5rem" };
  return (
    <div style={S}>
      <label style={{ color, fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "1rem" }}>{label}</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        {[["before", "Cote initiale", "1.50"], ["after", "Cote finale", "1.90"]].map(([k, lbl, ph]) => (
          <div key={k}>
            <span style={{ display: "block", fontSize: "0.65rem", color: "#6b6b88", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl}</span>
            <input className="inp" type="number" step="0.01" min="1" placeholder={ph} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ movement, diff, breach }) {
  const up = movement === "up";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.7rem", borderRadius: 999, fontSize: "0.7rem", fontWeight: 500, background: up ? "#1a0a0a" : "#0a1a0a", border: `1px solid ${breach ? "#f87171" : "#34d399"}`, color: breach ? "#fca5a5" : "#6ee7b7", flexWrap: "wrap" }}>
      {up ? "▲" : "▼"} {Math.abs(diff).toFixed(2)} {breach ? "⚠ Seuil non-respecté" : "✓ Seuil OK"}
    </span>
  );
}

function Spinner() {
  return <div style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #3a3a55", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("analyze");
  const [thresholdUp, setThresholdUp] = useState(0.34);
  const [thresholdDown, setThresholdDown] = useState(0.14);
  const [p1, setP1] = useState({ before: "", after: "" });
  const [p2, setP2] = useState({ before: "", after: "" });
  const [rules, setRules] = useState([]);
  const [history, setHistory] = useState([]);
  const [rulesRowId, setRulesRowId] = useState(null);
  const [historyRowId, setHistoryRowId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Rule form
  const emptyRule = { label: "", description: "", p1_movement: "up", p1_breach: true, p2_movement: "down", p2_breach: true, winner: "p1", active: true };
  const [showForm, setShowForm] = useState(false);
  const [newRule, setNewRule] = useState(emptyRule);

  // History form
  const [hP1, setHP1] = useState({ before: "", after: "" });
  const [hP2, setHP2] = useState({ before: "", after: "" });
  const [hWinner, setHWinner] = useState("p1");
  const [hLabel, setHLabel] = useState("");

  // Pattern detection
  const [extractConf, setExtractConf] = useState(70);
  const [suggested, setSuggested] = useState([]);
  const [showSug, setShowSug] = useState(false);

  // ── Load from Supabase on mount
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [rId, hId] = await Promise.all([sbInit("rules"), sbInit("history")]);
        setRulesRowId(rId);
        setHistoryRowId(hId);
        const [r, h] = await Promise.all([sbGet("rules"), sbGet("history")]);
        setRules(r);
        setHistory(h);
      } catch (e) {
        setDbError("Impossible de se connecter à la base de données.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Save rules to Supabase
  const saveRules = useCallback(async (newRules) => {
    setRules(newRules);
    if (!rulesRowId) return;
    setSaving(true);
    try { await sbSet("rules", rulesRowId, newRules); } catch {}
    setSaving(false);
  }, [rulesRowId]);

  // ── Save history to Supabase
  const saveHistory = useCallback(async (newHistory) => {
    setHistory(newHistory);
    if (!historyRowId) return;
    setSaving(true);
    try { await sbSet("history", historyRowId, newHistory); } catch {}
    setSaving(false);
  }, [historyRowId]);

  // ── Analyze
  const analyzeP = (p) => {
    const b = parseFloat(p.before), a = parseFloat(p.after);
    if (isNaN(b) || isNaN(a)) return null;
    return analyzeOdds(b, a, thresholdUp, thresholdDown);
  };

  const a1 = analyzeP(p1), a2 = analyzeP(p2);
  const hasAnalysis = a1 && a2;
  const p1IsFavorite = hasAnalysis && a1.before < a2.before;

  const matchedRules = hasAnalysis ? rules.filter((r) => {
    if (!r.active) return false;
    const m1 = r.p1_movement === "any" || (a1.movement === r.p1_movement && a1.breach === r.p1_breach);
    const m2 = r.p2_movement === "any" || (a2.movement === r.p2_movement && a2.breach === r.p2_breach);
    return m1 && m2;
  }) : [];

  // ── Add rule
  const addRule = () => {
    if (!newRule.label.trim()) return;
    saveRules([...rules, { ...newRule, id: Date.now() }]);
    setNewRule(emptyRule);
    setShowForm(false);
  };

  // ── Add match
  const addMatch = () => {
    const b1 = parseFloat(hP1.before), af1 = parseFloat(hP1.after);
    const b2 = parseFloat(hP2.before), af2 = parseFloat(hP2.after);
    if ([b1, af1, b2, af2].some(isNaN)) return;
    const ma1 = analyzeOdds(b1, af1, thresholdUp, thresholdDown);
    const ma2 = analyzeOdds(b2, af2, thresholdUp, thresholdDown);
    const entry = { id: Date.now(), label: hLabel || `Match #${history.length + 1}`, a1: ma1, a2: ma2, winner: hWinner, date: new Date().toLocaleDateString("fr-FR") };
    saveHistory([entry, ...history]);
    setHP1({ before: "", after: "" }); setHP2({ before: "", after: "" }); setHLabel(""); setHWinner("p1");
    setShowSug(false);
  };

  // ── Pattern detection
  const extractPatterns = () => {
    const map = {};
    history.forEach((m) => {
      const k = `${m.a1.movement}:${m.a1.breach}|${m.a2.movement}:${m.a2.breach}`;
      if (!map[k]) map[k] = { p1: 0, p2: 0, meta: m };
      map[k][m.winner]++;
    });
    const out = [];
    Object.entries(map).forEach(([, v]) => {
      const total = v.p1 + v.p2;
      const bestW = v.p1 >= v.p2 ? "p1" : "p2";
      const conf = Math.round((Math.max(v.p1, v.p2) / total) * 100);
      if (conf >= extractConf) out.push({ ...v, total, winner: bestW, confidence: conf });
    });
    setSuggested(out.sort((a, b) => b.confidence - a.confidence));
    setShowSug(true);
  };

  const alreadyAdded = (s) => rules.some((r) =>
    r.p1_movement === s.meta.a1.movement && r.p1_breach === s.meta.a1.breach &&
    r.p2_movement === s.meta.a2.movement && r.p2_breach === s.meta.a2.breach &&
    r.winner === s.winner
  );

  const addSuggested = (s) => {
    const label = `J1 ${s.meta.a1.movement === "up" ? "monte" : "baisse"} (${s.meta.a1.breach ? "seuil KO" : "seuil OK"}) + J2 ${s.meta.a2.movement === "up" ? "monte" : "baisse"} (${s.meta.a2.breach ? "seuil KO" : "seuil OK"}) → ${s.winner === "p1" ? "J1" : "J2"} gagne`;
    const rule = {
      id: Date.now(), label,
      description: `Détectée auto — ${s.total} matchs, confiance ${s.confidence}%`,
      p1_movement: s.meta.a1.movement, p1_breach: s.meta.a1.breach,
      p2_movement: s.meta.a2.movement, p2_breach: s.meta.a2.breach,
      winner: s.winner, active: true, confidence: s.confidence,
    };
    saveRules([...rules, rule]);
  };

  // ── Styles
  const S = {
    btn: { display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 1.25rem", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.8rem", fontWeight: 500 },
    section: { background: "#12121e", border: "1px solid #1e1e30", borderRadius: 12, padding: "1.5rem", marginBottom: "1.25rem" },
    sTitle: { fontFamily: "Syne, sans-serif", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6b88", marginBottom: "1.25rem" },
    input: { width: "100%", background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 6, color: "#e8e6f0", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.9rem", padding: "0.6rem 0.75rem", outline: "none", boxSizing: "border-box" },
    select: { width: "100%", background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 6, color: "#e8e6f0", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.9rem", padding: "0.6rem 0.75rem", outline: "none", boxSizing: "border-box" },
    label: { display: "block", fontSize: "0.68rem", color: "#6b6b88", marginBottom: "0.35rem", letterSpacing: "0.06em", textTransform: "uppercase" },
  };

  const tabs = [
    { key: "analyze", label: "Analyser" },
    { key: "history", label: "Historique", count: history.length },
    { key: "kb", label: "Règles", count: rules.filter(r => r.active).length },
    { key: "settings", label: "Seuils" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0f; color: #e8e6f0; font-family: 'IBM Plex Mono', monospace; }
        .inp, select, textarea { font-family: 'IBM Plex Mono', monospace !important; background: #0a0a0f !important; color: #e8e6f0 !important; -webkit-appearance: none; appearance: none; border: 1px solid #2a2a3a; border-radius: 6px; padding: 0.6rem 0.75rem; width: 100%; font-size: 0.9rem; outline: none; }
        .inp:focus, select:focus, textarea:focus { border-color: #a78bfa !important; }
        .inp:-webkit-autofill { -webkit-box-shadow: 0 0 0px 1000px #0a0a0f inset !important; -webkit-text-fill-color: #e8e6f0 !important; }
        .inp::placeholder { color: #3a3a55; opacity: 1; }
        select option { background: #0a0a0f; color: #e8e6f0; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        .fg { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        @media (max-width: 540px) {
          .g2 { grid-template-columns: 1fr !important; }
          .fg { grid-template-columns: 1fr !important; }
          .tab-label { display: none; }
          .tab-icon { display: inline !important; }
        }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem", borderBottom: "1px solid #2a2a3a", paddingBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: "Syne, sans-serif", fontSize: "2rem", fontWeight: 800, background: "linear-gradient(135deg, #a78bfa, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ODDS ANALYZER</div>
            <div style={{ fontSize: "0.72rem", color: "#6b6b88", marginTop: "0.25rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Analyse · Historique · Extraction auto · Knowledge Base</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.68rem" }}>
            {loading && <><Spinner /><span style={{ color: "#6b6b88" }}>Chargement…</span></>}
            {saving && <><Spinner /><span style={{ color: "#a78bfa" }}>Sauvegarde…</span></>}
            {!loading && !saving && !dbError && <span style={{ color: "#4ade80" }}>● Connecté</span>}
            {dbError && <span style={{ color: "#f87171" }}>● {dbError}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", marginBottom: "2rem", border: "1px solid #2a2a3a", borderRadius: 8, overflow: "hidden" }}>
          {tabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "0.7rem 0.4rem", background: tab === key ? "#1a1a2e" : "transparent", border: "none", borderBottom: tab === key ? "2px solid #a78bfa" : "2px solid transparent", color: tab === key ? "#a78bfa" : "#6b6b88", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.7rem", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              <span className="tab-label">{label}</span>
              {count !== undefined && <span style={{ marginLeft: "0.3rem", background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.1rem 0.4rem", fontSize: "0.62rem", color: "#a78bfa" }}>{count}</span>}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "3rem", color: "#6b6b88" }}>
            <Spinner /><br /><br />Connexion à la base de données…
          </div>
        )}

        {!loading && (
          <>
            {/* ── ANALYZE ── */}
            {tab === "analyze" && (
              <>
                <div style={S.section}>
                  <div style={S.sTitle}>Saisie des cotes</div>
                  <div className="g2">
                    <OddsInput label="Joueur 1" color="#a78bfa" value={p1} onChange={setP1} />
                    <OddsInput label="Joueur 2" color="#60a5fa" value={p2} onChange={setP2} />
                  </div>
                </div>

                {hasAnalysis && (
                  <div style={S.section}>
                    <div style={S.sTitle}>Résultat</div>
                    {[
                      { label: "Joueur 1", color: "#a78bfa", a: a1, fav: p1IsFavorite },
                      { label: "Joueur 2", color: "#60a5fa", a: a2, fav: !p1IsFavorite },
                    ].map(({ label, color, a, fav }, i) => (
                      <div key={i} style={{ borderRadius: 10, padding: "1.25rem", marginBottom: "0.75rem", background: i === 0 ? "linear-gradient(135deg,#0f0a1a,#120e22)" : "linear-gradient(135deg,#0a1018,#0e1420)", border: `1px solid ${i === 0 ? "#2d1f5e" : "#1e3a5e"}` }}>
                        <div style={{ fontFamily: "Syne, sans-serif", fontSize: "1.1rem", fontWeight: 700, color, marginBottom: "0.75rem" }}>
                          {label}
                          {fav && <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "#fbbf24", border: "1px solid #78350f", borderRadius: 4, padding: "0.15rem 0.4rem", background: "#1c1008", verticalAlign: "middle" }}>FAVORI</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
                          <span style={{ fontSize: "1.5rem", fontWeight: 600 }}>{a.before.toFixed(2)}</span>
                          <span style={{ color: "#6b6b88" }}>→</span>
                          <span style={{ fontSize: "1.5rem", fontWeight: 600 }}>{a.after.toFixed(2)}</span>
                        </div>
                        <Badge movement={a.movement} diff={a.diff} breach={a.breach} />
                      </div>
                    ))}

                    {matchedRules.length > 0 ? (
                      <div style={{ background: "linear-gradient(135deg,#0f1a0f,#0a150a)", border: "1px solid #1e4a1e", borderRadius: 10, padding: "1.25rem", marginTop: "1rem" }}>
                        <div style={{ fontFamily: "Syne, sans-serif", fontSize: "0.85rem", fontWeight: 700, color: "#4ade80", marginBottom: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>🎯 {matchedRules.length} règle(s) déclenchée(s)</div>
                        {matchedRules.map((r) => (
                          <div key={r.id} style={{ background: "#0d1f0d", border: "1px solid #1e3a1e", borderRadius: 8, padding: "0.85rem", marginBottom: "0.5rem" }}>
                            <div style={{ fontSize: "0.82rem", color: "#86efac", fontWeight: 500, marginBottom: "0.3rem" }}>{r.label}</div>
                            {r.description && <div style={{ fontSize: "0.72rem", color: "#6b6b88", marginBottom: "0.4rem" }}>{r.description}</div>}
                            <div style={{ fontSize: "0.78rem", color: "#6b6b88" }}>Prédiction : <strong style={{ color: "#fbbf24" }}>{r.winner === "p1" ? "Joueur 1" : "Joueur 2"}</strong></div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ background: "#12100a", border: "1px dashed #3a2a1a", borderRadius: 8, padding: "1rem", marginTop: "0.75rem", fontSize: "0.78rem", color: "#6b6b88", textAlign: "center" }}>
                        Aucune règle ne correspond — ajoute des matchs dans Historique pour en détecter automatiquement.
                      </div>
                    )}
                  </div>
                )}
                {!hasAnalysis && <div style={{ textAlign: "center", padding: "2rem", color: "#6b6b88", fontSize: "0.8rem" }}>Saisis les cotes avant/après pour les deux joueurs.</div>}
              </>
            )}

            {/* ── HISTORY ── */}
            {tab === "history" && (
              <>
                <div style={S.section}>
                  <div style={S.sTitle}>Ajouter un match</div>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={S.label}>Nom du match (optionnel)</label>
                    <input className="inp" type="text" placeholder="ex: Djokovic vs Alcaraz" value={hLabel} onChange={(e) => setHLabel(e.target.value)} />
                  </div>
                  <div className="g2" style={{ marginBottom: "0.75rem" }}>
                    <OddsInput label="Joueur 1" color="#a78bfa" value={hP1} onChange={setHP1} />
                    <OddsInput label="Joueur 2" color="#60a5fa" value={hP2} onChange={setHP2} />
                  </div>
                  <div className="fg" style={{ marginBottom: "0.75rem" }}>
                    <div>
                      <label style={S.label}>Gagnant réel</label>
                      <select value={hWinner} onChange={(e) => setHWinner(e.target.value)}>
                        <option value="p1">Joueur 1</option>
                        <option value="p2">Joueur 2</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button
                        style={{ ...S.btn, background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "white", width: "100%", justifyContent: "center" }}
                        onClick={addMatch}
                        disabled={!hP1.before || !hP1.after || !hP2.before || !hP2.after}
                      >
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pattern detection */}
                {history.length >= 2 && (
                  <div style={S.section}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                      <div style={S.sTitle}>Détection automatique</div>
                      <button style={{ ...S.btn, background: "linear-gradient(135deg,#065f46,#047857)", color: "#d1fae5" }} onClick={extractPatterns}>🔍 Analyser les patterns</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "0.72rem", color: "#6b6b88", whiteSpace: "nowrap" }}>Confiance min.</span>
                      <input className="inp" type="number" min="50" max="100" step="5" value={extractConf} onChange={(e) => setExtractConf(parseInt(e.target.value) || 70)} style={{ width: 80 }} />
                      <span style={{ fontSize: "0.72rem", color: "#6b6b88" }}>%</span>
                    </div>

                    {showSug && (
                      <div style={{ marginTop: "1.25rem" }}>
                        <div style={{ borderTop: "1px solid #1e1e30", marginBottom: "1rem", paddingTop: "1rem" }} />
                        {suggested.length === 0 ? (
                          <div style={{ textAlign: "center", color: "#6b6b88", fontSize: "0.78rem" }}>Aucun pattern avec cette confiance. Baisse le seuil ou ajoute plus de matchs.</div>
                        ) : suggested.map((s, i) => (
                          <div key={i} style={{ background: "#0a0f0a", border: "1px solid #1e3a1e", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "0.65rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 600, marginBottom: "0.25rem" }}>{s.confidence}% confiance · {s.total} match{s.total > 1 ? "s" : ""}</div>
                              <div style={{ width: 80, height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden", marginBottom: "0.6rem" }}>
                                <div style={{ height: "100%", width: `${s.confidence}%`, background: "linear-gradient(90deg,#4ade80,#22c55e)", borderRadius: 3 }} />
                              </div>
                              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                {[
                                  `J1: ${s.meta.a1.movement === "up" ? "monte" : "baisse"} ${s.meta.a1.breach ? "⚠" : "✓"}`,
                                  `J2: ${s.meta.a2.movement === "up" ? "monte" : "baisse"} ${s.meta.a2.breach ? "⚠" : "✓"}`,
                                ].map((t, j) => <span key={j} style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#a0a0c0" }}>{t}</span>)}
                                <span style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#fbbf24" }}>→ {s.winner === "p1" ? "J1" : "J2"} gagne</span>
                              </div>
                              <div style={{ fontSize: "0.65rem", color: "#6b6b88", marginTop: "0.4rem" }}>J1 gagne: {s.p1}× · J2 gagne: {s.p2}×</div>
                            </div>
                            <button
                              style={{ ...S.btn, background: alreadyAdded(s) ? "#1a1a2e" : "linear-gradient(135deg,#065f46,#047857)", color: alreadyAdded(s) ? "#4ade80" : "#d1fae5", fontSize: "0.72rem", padding: "0.5rem 0.85rem", flexShrink: 0, border: alreadyAdded(s) ? "1px solid #4ade80" : "none" }}
                              onClick={() => !alreadyAdded(s) && addSuggested(s)}
                            >
                              {alreadyAdded(s) ? "✓ Ajoutée" : "+ Règle"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* History list */}
                <div style={S.section}>
                  <div style={S.sTitle}>Matchs ({history.length})</div>
                  {history.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "#6b6b88", fontSize: "0.8rem" }}>Aucun match. Ajoute ton premier match ci-dessus.</div>
                  ) : history.map((m) => (
                    <div key={m.id} style={{ background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <div>
                          <div style={{ fontFamily: "Syne, sans-serif", fontSize: "0.9rem", fontWeight: 700 }}>{m.label}</div>
                          <div style={{ fontSize: "0.68rem", color: "#6b6b88", marginTop: "0.2rem" }}>{m.date}</div>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <span style={{ background: "#1c1008", border: "1px solid #78350f", borderRadius: 4, padding: "0.15rem 0.5rem", fontSize: "0.65rem", color: "#fbbf24" }}>🏆 {m.winner === "p1" ? "J1" : "J2"} gagne</span>
                          <button style={{ ...S.btn, padding: "0.35rem 0.65rem", fontSize: "0.68rem", background: "transparent", border: "1px solid #3a1a1a", color: "#f87171" }} onClick={() => saveHistory(history.filter(h => h.id !== m.id))}>✕</button>
                        </div>
                      </div>
                      <div className="g2">
                        {[{ label: "Joueur 1", a: m.a1, color: "#a78bfa" }, { label: "Joueur 2", a: m.a2, color: "#60a5fa" }].map((p, i) => (
                          <div key={i} style={{ background: "#12121e", borderRadius: 8, padding: "0.75rem" }}>
                            <div style={{ fontSize: "0.7rem", color: p.color, marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.label}</div>
                            <div style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>{p.a.before.toFixed(2)} → {p.a.after.toFixed(2)}</div>
                            <Badge movement={p.a.movement} diff={p.a.diff} breach={p.a.breach} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── KB ── */}
            {tab === "kb" && (
              <div style={S.section}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div style={S.sTitle}>Règles ({rules.length})</div>
                  <button style={{ ...S.btn, background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "white" }} onClick={() => setShowForm(!showForm)}>{showForm ? "Annuler" : "+ Nouvelle règle"}</button>
                </div>

                {showForm && (
                  <div style={{ background: "#0a0a0f", border: "1px solid #2a2a3a", borderRadius: 10, padding: "1.25rem", marginBottom: "1.25rem" }}>
                    <div style={{ fontFamily: "Syne, sans-serif", fontSize: "0.8rem", color: "#a78bfa", marginBottom: "1rem", fontWeight: 700, textTransform: "uppercase" }}>Nouvelle règle</div>
                    <div className="fg" style={{ marginBottom: "0.75rem" }}>
                      <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Nom *</label><input className="inp" type="text" placeholder="ex: J1 monte sans seuil + J2 baisse sans seuil → J2 gagne" value={newRule.label} onChange={(e) => setNewRule({ ...newRule, label: e.target.value })} /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Description</label><textarea className="inp" style={{ minHeight: 60, resize: "vertical", lineHeight: 1.5 }} placeholder="Explication..." value={newRule.description} onChange={(e) => setNewRule({ ...newRule, description: e.target.value })} /></div>
                      <div><label style={S.label}>J1 — Mouvement</label><select value={newRule.p1_movement} onChange={(e) => setNewRule({ ...newRule, p1_movement: e.target.value })}><option value="up">▲ Monte</option><option value="down">▼ Baisse</option><option value="any">Peu importe</option></select></div>
                      <div><label style={S.label}>J1 — Seuil</label><select value={newRule.p1_breach ? "b" : "o"} onChange={(e) => setNewRule({ ...newRule, p1_breach: e.target.value === "b" })}><option value="b">⚠ Non-respecté</option><option value="o">✓ Respecté</option></select></div>
                      <div><label style={S.label}>J2 — Mouvement</label><select value={newRule.p2_movement} onChange={(e) => setNewRule({ ...newRule, p2_movement: e.target.value })}><option value="up">▲ Monte</option><option value="down">▼ Baisse</option><option value="any">Peu importe</option></select></div>
                      <div><label style={S.label}>J2 — Seuil</label><select value={newRule.p2_breach ? "b" : "o"} onChange={(e) => setNewRule({ ...newRule, p2_breach: e.target.value === "b" })}><option value="b">⚠ Non-respecté</option><option value="o">✓ Respecté</option></select></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Gagnant prédit</label><select value={newRule.winner} onChange={(e) => setNewRule({ ...newRule, winner: e.target.value })}><option value="p1">Joueur 1</option><option value="p2">Joueur 2</option></select></div>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <button style={{ ...S.btn, background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "white" }} onClick={addRule}>Enregistrer</button>
                      <button style={{ ...S.btn, background: "transparent", border: "1px solid #2a2a3a", color: "#a0a0c0" }} onClick={() => setShowForm(false)}>Annuler</button>
                    </div>
                  </div>
                )}

                {rules.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "#6b6b88", fontSize: "0.8rem" }}>Aucune règle. Ajoute des matchs dans Historique et extrais des règles auto !</div>
                ) : rules.map((r) => (
                  <div key={r.id} style={{ background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "0.75rem", display: "flex", alignItems: "flex-start", gap: "1rem", opacity: r.active === false ? 0.45 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.85rem", color: "#c4b5fd", fontWeight: 500, marginBottom: "0.3rem" }}>{r.label}</div>
                      {r.description && <div style={{ fontSize: "0.72rem", color: "#6b6b88", lineHeight: 1.5, marginBottom: "0.5rem" }}>{r.description}</div>}
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        {[
                          `J1: ${r.p1_movement === "up" ? "monte" : r.p1_movement === "down" ? "baisse" : "~"} ${r.p1_breach ? "⚠" : "✓"}`,
                          `J2: ${r.p2_movement === "up" ? "monte" : r.p2_movement === "down" ? "baisse" : "~"} ${r.p2_breach ? "⚠" : "✓"}`,
                        ].map((t, i) => <span key={i} style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#a0a0c0" }}>{t}</span>)}
                        <span style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#fbbf24" }}>→ {r.winner === "p1" ? "J1 gagne" : "J2 gagne"}</span>
                        {r.confidence && <span style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#a78bfa" }}>🤖 {r.confidence}%</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flexShrink: 0 }}>
                      <button onClick={() => saveRules(rules.map(x => x.id === r.id ? { ...x, active: !x.active } : x))} style={{ background: "transparent", border: `1px solid ${r.active !== false ? "#4ade80" : "#f87171"}`, borderRadius: 4, color: r.active !== false ? "#4ade80" : "#f87171", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.65rem", padding: "0.3rem 0.6rem", cursor: "pointer" }}>{r.active !== false ? "ON" : "OFF"}</button>
                      <button onClick={() => saveRules(rules.filter(x => x.id !== r.id))} style={{ background: "transparent", border: "1px solid #3a1a1a", borderRadius: 4, color: "#f87171", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.65rem", padding: "0.3rem 0.6rem", cursor: "pointer" }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── SETTINGS ── */}
            {tab === "settings" && (
              <div style={S.section}>
                <div style={S.sTitle}>Configuration des seuils</div>
                <div className="fg">
                  <div>
                    <label style={S.label}>▲ Hausse — non-respecté si diff &gt; X</label>
                    <input className="inp" type="number" step="0.01" min="0.01" value={thresholdUp} onChange={(e) => setThresholdUp(parseFloat(e.target.value) || 0.35)} />
                    <div style={{ fontSize: "0.68rem", color: "#6b6b88", marginTop: "0.4rem" }}>Actuel : diff &gt; {thresholdUp} = non-respecté</div>
                  </div>
                  <div>
                    <label style={S.label}>▼ Baisse — non-respecté si |diff| &lt; X</label>
                    <input className="inp" type="number" step="0.01" min="0.01" value={thresholdDown} onChange={(e) => setThresholdDown(parseFloat(e.target.value) || 0.14)} />
                    <div style={{ fontSize: "0.68rem", color: "#6b6b88", marginTop: "0.4rem" }}>Actuel : |diff| &lt; {thresholdDown} = non-respecté</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
