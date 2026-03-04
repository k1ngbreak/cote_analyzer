import React, { useState, useEffect, useCallback } from "react";

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
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${rowId}`, { method: "PATCH", headers, body: JSON.stringify({ data }) });
}
async function sbInit(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers });
  const rows = await res.json();
  if (!rows || rows.length === 0) {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify({ data: [] }) });
    const inserted = await ins.json();
    return inserted[0]?.id || 1;
  }
  return rows[0].id;
}

function analyzeOdds(before, after, thUp, thDown) {
  const diff = Math.round((after - before) * 100) / 100;
  const movement = diff >= 0 ? "up" : "down";
  const breach = movement === "up" ? diff > thUp : Math.abs(diff) < thDown;
  return { before, after, diff, movement, breach };
}
function getP1IsFav(m) {
  return m.a1.after < m.a2.after;
}

function winnerLabel(winner, p1IsFav) {
  if (winner === "favori") return "Favori";
  if (winner === "outsider") return "Outsider";
  if (winner === "p1") return p1IsFav ? "Favori" : "Outsider";
  return p1IsFav ? "Outsider" : "Favori";
}

function getOddsBracket(odd) {
  if (odd <= 1.30) return "Ultra-Fav (<=1.30)";
  if (odd <= 1.60) return "Fav Solide (1.31-1.60)";
  if (odd <= 1.95) return "Match Serré (1.61-1.95)";
  return "Outsider (>1.95)";
}

function computeRuleStats(rule, history, thUp, thDown) {
  const ruleThUp = rule.custom_thUp || thUp;
  const ruleThDown = rule.custom_thDown || thDown;

  const matchingMatches = history.filter((m) => {
    if (rule.custom_bracket) {
      const p1Fav = getP1IsFav(m);
      const favAfter = p1Fav ? m.a1.after : m.a2.after;
      if (getOddsBracket(favAfter) !== rule.custom_bracket) return false;
    }

    const a1 = analyzeOdds(m.a1.before, m.a1.after, ruleThUp, ruleThDown);
    const a2 = analyzeOdds(m.a2.before, m.a2.after, ruleThUp, ruleThDown);

    const m1 = rule.p1_movement === "any" || (a1.movement === rule.p1_movement && a1.breach === rule.p1_breach);
    const m2 = rule.p2_movement === "any" || (a2.movement === rule.p2_movement && a2.breach === rule.p2_breach);
    return m1 && m2;
  });

  if (matchingMatches.length === 0) return null;

  let correctCount = 0;
  const winOdds = [];
  const roundStats = {};

  matchingMatches.forEach((m) => {
    const p1Fav = getP1IsFav(m);
    const winnerIsFav = (m.winner === "p1" && p1Fav) || (m.winner === "p2" && !p1Fav) || m.winner === "favori";
    const correct = winnerIsFav === (rule.winner === "favori");
    if (correct) {
      correctCount++;
      winOdds.push(rule.winner === "favori"
        ? (p1Fav ? m.a1.after : m.a2.after)
        : (p1Fav ? m.a2.after : m.a1.after));
    }
    if (m.round?.toString().trim()) {
      const rnd = m.round.toString().trim();
      if (!roundStats[rnd]) roundStats[rnd] = { correct: 0, total: 0 };
      roundStats[rnd].total++;
      if (correct) roundStats[rnd].correct++;
    }
  });

  const total = matchingMatches.length;
  const confidence = Math.round((correctCount / total) * 100);
  const avgWinOdd = winOdds.length ? (winOdds.reduce((a, b) => a + b, 0) / winOdds.length).toFixed(2) : "—";
  const topRounds = Object.entries(roundStats)
    .sort((a, b) => b[1].total - a[1].total).slice(0, 4)
    .map(([rnd, s]) => ({ rnd, total: s.total, pct: Math.round((s.correct / s.total) * 100) }));
  const totalWithRound = Object.values(roundStats).reduce((acc, s) => acc + s.total, 0);
  return { total, correctCount, confidence, avgWinOdd, topRounds, totalWithRound };
}

function OddsInput({ label, color, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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

  const emptyRule = { label: "", description: "", p1_movement: "up", p1_breach: true, p2_movement: "down", p2_breach: true, winner: "favori", active: true };
  const [showForm, setShowForm] = useState(false);
  const [newRule, setNewRule] = useState(emptyRule);

  const [hP1, setHP1] = useState({ before: "", after: "" });
  const [hP2, setHP2] = useState({ before: "", after: "" });
  const [hWinner, setHWinner] = useState("p1");
  const [hLabel, setHLabel] = useState("");
  const [hRound, setHRound] = useState("");
  const [hLastWinner, setHLastWinner] = useState("favori");
  // Pour l'onglet Analyser : qui a gagné le dernier match entre ces deux joueurs
  const [lastWinnerInput, setLastWinnerInput] = useState("favori");

  const [extractConf, setExtractConf] = useState(70);
  const [suggested, setSuggested] = useState([]);
  const [showSug, setShowSug] = useState(false);

  const [editingRoundId, setEditingRoundId] = useState(null);
  const [editingRoundVal, setEditingRoundVal] = useState("");

  const [goldenPatterns, setGoldenPatterns] = useState([]);
  const [showDeepScan, setShowDeepScan] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [minMatchesDeep, setMinMatchesDeep] = useState(5);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [rId, hId] = await Promise.all([sbInit("rules"), sbInit("history")]);
        setRulesRowId(rId); setHistoryRowId(hId);
        const [r, h] = await Promise.all([sbGet("rules"), sbGet("history")]);
        setRules(r); setHistory(h);
      } catch { setDbError("Impossible de se connecter à la base de données."); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const saveRules = useCallback(async (newRules) => {
    setRules(newRules);
    if (!rulesRowId) return;
    setSaving(true);
    try { await sbSet("rules", rulesRowId, newRules); } catch {}
    setSaving(false);
  }, [rulesRowId]);

  const saveHistory = useCallback(async (newHistory) => {
    setHistory(newHistory);
    if (!historyRowId) return;
    setSaving(true);
    try { await sbSet("history", historyRowId, newHistory); } catch {}
    setSaving(false);
  }, [historyRowId]);

  const analyzeP = (p) => {
    const b = parseFloat(p.before), a = parseFloat(p.after);
    if (isNaN(b) || isNaN(a)) return null;
    return analyzeOdds(b, a, thresholdUp, thresholdDown);
  };

  const a1 = analyzeP(p1), a2 = analyzeP(p2);
  const hasAnalysis = a1 && a2;
  const p1IsFavorite = hasAnalysis && (parseFloat(p1.after) < parseFloat(p2.after));

const matchedRules = hasAnalysis ? rules.filter((r) => {
    if (!r.active) return false;

    const favInput = p1IsFavorite ? a1 : a2;
    const outInput = p1IsFavorite ? a2 : a1;
    const favAfter = p1IsFavorite ? parseFloat(p1.after) : parseFloat(p2.after);
    const currentBracket = getOddsBracket(favAfter);

    if (!r.custom_thUp) {
      const m1 = r.p1_movement === "any" || (favInput.movement === r.p1_movement && favInput.breach === r.p1_breach);
      const m2 = r.p2_movement === "any" || (outInput.movement === r.p2_movement && outInput.breach === r.p2_breach);
      // Filtre lastWinner si la règle le spécifie
      const m3 = !r.last_winner || r.last_winner === lastWinnerInput;
      return m1 && m2 && m3;
    }

    if (r.custom_bracket !== currentBracket) return false;

    const customA1 = analyzeOdds(parseFloat(p1.before), parseFloat(p1.after), r.custom_thUp, r.custom_thDown);
    const customA2 = analyzeOdds(parseFloat(p2.before), parseFloat(p2.after), r.custom_thUp, r.custom_thDown);

    const favCustom = p1IsFavorite ? customA1 : customA2;
    const outCustom = p1IsFavorite ? customA2 : customA1;

    const m1 = r.p1_movement === "any" || (favCustom.movement === r.p1_movement && favCustom.breach === r.p1_breach);
    const m2 = r.p2_movement === "any" || (outCustom.movement === r.p2_movement && outCustom.breach === r.p2_breach);
    const m3 = !r.last_winner || r.last_winner === lastWinnerInput;

    return m1 && m2 && m3;
  }) : [];

  const addRule = () => {
    if (!newRule.label.trim()) return;
    saveRules([...rules, { ...newRule, id: Date.now() }]);
    setNewRule(emptyRule); setShowForm(false);
  };

  const addMatch = () => {
    const b1 = parseFloat(hP1.before), af1 = parseFloat(hP1.after);
    const b2 = parseFloat(hP2.before), af2 = parseFloat(hP2.after);
    if ([b1, af1, b2, af2].some(isNaN)) return;
    const ma1 = analyzeOdds(b1, af1, thresholdUp, thresholdDown);
    const ma2 = analyzeOdds(b2, af2, thresholdUp, thresholdDown);
    const entry = {
      id: Date.now(),
      label: hLabel || `Match #${history.length + 1}`,
      a1: ma1, a2: ma2,
      winner: hWinner,
      lastWinner: hLastWinner,
      p1IsFav: af1 < af2,
      round: hRound.trim() || "",
      date: new Date().toLocaleDateString("fr-FR"),
    };
    saveHistory([entry, ...history]);
    setHP1({ before: "", after: "" }); setHP2({ before: "", after: "" });
    setHLabel(""); setHWinner("p1"); setHRound(""); setHLastWinner("favori");
    setShowSug(false);
  };

  const saveRoundEdit = (matchId) => {
    const updated = history.map(m => m.id === matchId ? { ...m, round: editingRoundVal.trim() } : m);
    saveHistory(updated);
    setEditingRoundId(null);
    setEditingRoundVal("");
  };

  const extractPatterns = () => {
    const map = {};
    history.forEach((m) => {
      // ✅ FIX: On normalise toujours en favori/outsider avant de créer la clé
      const p1Fav = getP1IsFav(m);
      const favA = p1Fav ? m.a1 : m.a2;
      const outA = p1Fav ? m.a2 : m.a1;
      const lastW = m.lastWinner || "inconnu";
      const k = `${favA.movement}:${favA.breach}|${outA.movement}:${outA.breach}|last:${lastW}`;

      if (!map[k]) map[k] = { fav: 0, outsider: 0, meta: { a1: favA, a2: outA }, lastWinner: lastW, favOdds: [], outsiderOdds: [], roundStats: {}, winnerOddsWhenCorrect: [] };
      const winnerIsFav = (m.winner === "p1" && p1Fav) || (m.winner === "p2" && !p1Fav) || m.winner === "favori";
      const favFinalOdd = p1Fav ? m.a1.after : m.a2.after;
      const outsiderFinalOdd = p1Fav ? m.a2.after : m.a1.after;
      map[k].favOdds.push(favFinalOdd);
      map[k].outsiderOdds.push(outsiderFinalOdd);
      map[k]._winnerIsFavArr = map[k]._winnerIsFavArr || [];
      map[k]._winnerIsFavArr.push({ winnerIsFav, favFinalOdd, outsiderFinalOdd });
      if (m.round && m.round.toString().trim()) {
        const rnd = m.round.toString().trim();
        if (!map[k].roundStats[rnd]) map[k].roundStats[rnd] = { win: 0, total: 0 };
        map[k].roundStats[rnd].total++;
        if (winnerIsFav) map[k].roundStats[rnd].win++;
      }
      if (winnerIsFav) map[k].fav++;
      else map[k].outsider++;
    });
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "—";
    const out = [];
    Object.entries(map).forEach(([, v]) => {
      const total = v.fav + v.outsider;
      const bestW = v.fav >= v.outsider ? "favori" : "outsider";
      const conf = Math.round((Math.max(v.fav, v.outsider) / total) * 100);
      const dominantIsFav = bestW === "favori";
      const oddsWhenCorrect = (v._winnerIsFavArr || [])
        .filter(x => x.winnerIsFav === dominantIsFav)
        .map(x => dominantIsFav ? x.favFinalOdd : x.outsiderFinalOdd);
      const avgWinOddWhenCorrect = oddsWhenCorrect.length
        ? (oddsWhenCorrect.reduce((a, b) => a + b, 0) / oddsWhenCorrect.length).toFixed(2)
        : "—";

      const topRounds = Object.entries(v.roundStats)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 4)
        .map(([rnd, s]) => {
          const winPct = bestW === "favori"
            ? Math.round((s.win / s.total) * 100)
            : Math.round(((s.total - s.win) / s.total) * 100);
          return { rnd, total: s.total, pct: winPct };
        });
      const totalWithRound = Object.values(v.roundStats).reduce((acc, s) => acc + s.total, 0);
      if (conf >= extractConf) out.push({ ...v, total, winner: bestW, confidence: conf, avgFavOdd: avg(v.favOdds), avgOutsiderOdd: avg(v.outsiderOdds), avgWinOddWhenCorrect, topRounds, totalWithRound });
    });
    setSuggested(out.sort((a, b) => b.confidence - a.confidence));
    setShowSug(true);
  };

  const runDeepScan = () => {
    setIsScanning(true);
    setShowDeepScan(true);
    
    setTimeout(() => {
      const testThresholds = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45];
      const foundConfigs = [];

      testThresholds.forEach(thUp => {
        testThresholds.forEach(thDown => {
          const map = {};

          history.forEach(m => {
            const p1Fav = getP1IsFav(m);
            const favAfter = p1Fav ? m.a1.after : m.a2.after;
            const bracket = getOddsBracket(favAfter);
            
            const a1 = analyzeOdds(m.a1.before, m.a1.after, thUp, thDown);
            const a2 = analyzeOdds(m.a2.before, m.a2.after, thUp, thDown);
            
            const lastW = m.lastWinner || "inconnu";
            const k = `[${bracket}] Favori:${a1.movement}(${a1.breach ? 'KO' : 'OK'}) | Outsider:${a2.movement}(${a2.breach ? 'KO' : 'OK'}) | LastWin=${lastW}`;
            const winnerIsFav = (m.winner === "p1" && p1Fav) || (m.winner === "p2" && !p1Fav) || m.winner === "favori";

            if (!map[k]) map[k] = { fav: 0, outsider: 0, thUp, thDown, bracket, a1, a2, lastWinner: lastW };
            if (winnerIsFav) map[k].fav++;
            else map[k].outsider++;
          });

          Object.entries(map).forEach(([key, v]) => {
            const total = v.fav + v.outsider;
            if (total >= minMatchesDeep) {
              const confFav = Math.round((v.fav / total) * 100);
              const confOut = Math.round((v.outsider / total) * 100);
              
              if (confFav >= 80) foundConfigs.push({ ...v, winner: "favori", confidence: confFav, total, key });
              if (confOut >= 80) foundConfigs.push({ ...v, winner: "outsider", confidence: confOut, total, key });
            }
          });
        });
      });

      const uniqueBest = [];
      foundConfigs.sort((a, b) => b.confidence - a.confidence || b.total - a.total).forEach(config => {
        if (!uniqueBest.some(u => u.key === config.key && u.winner === config.winner)) {
          uniqueBest.push(config);
        }
      });

      setGoldenPatterns(uniqueBest);
      setIsScanning(false);
    }, 100);
  };


  const alreadyAddedGolden = (p) => rules.some((r) =>
    r.p1_movement === p.a1.movement && r.p1_breach === p.a1.breach &&
    r.p2_movement === p.a2.movement && r.p2_breach === p.a2.breach &&
    r.custom_bracket === p.bracket &&
    r.custom_thUp === p.thUp &&
    r.custom_thDown === p.thDown
  );

const addGoldenRule = (p) => {
    const lwLabel = p.lastWinner && p.lastWinner !== "inconnu" ? ` + Dernier:${p.lastWinner === "favori" ? "Fav" : "Out"}` : "";
    const label = `🔥 [${p.bracket}] Favori ${p.a1.movement === "up" ? "monte" : "baisse"} (${p.a1.breach ? "KO" : "OK"}) + Outsider ${p.a2.movement === "up" ? "monte" : "baisse"} (${p.a2.breach ? "KO" : "OK"})${lwLabel} → ${p.winner === "favori" ? "Favori" : "Outsider"}`;
    
    setRules(prevRules => {
      const updated = [...prevRules, {
        id: Date.now() + Math.random(),
        label,
        description: `Deep Scan — ${p.total} matchs, ${p.confidence}% réussite. Seuils Optis : Hausse >${p.thUp}, Baisse <${p.thDown}.`,
        p1_movement: p.a1.movement, p1_breach: p.a1.breach,
        p2_movement: p.a2.movement, p2_breach: p.a2.breach,
        last_winner: p.lastWinner && p.lastWinner !== "inconnu" ? p.lastWinner : undefined,
        winner: p.winner,
        active: true,
        confidence: p.confidence,
        custom_thUp: p.thUp,
        custom_thDown: p.thDown,
        custom_bracket: p.bracket
      }];
      
      if (rulesRowId) {
        sbSet("rules", rulesRowId, updated).catch(() => {});
      }
      return updated;
    });
  };

  const normalizeHistory = () => {
    if (!window.confirm("Ceci va réorganiser tes 50 matchs pour que J1 soit toujours le favori. Continuer ?")) return;

    const fixedHistory = history.map(m => {
      const p1Fav = getP1IsFav(m);
      
      if (p1Fav) {
        return { ...m, p1IsFav: true }; 
      }

      let newWinner = m.winner;
      if (m.winner === "p1") newWinner = "p2";
      else if (m.winner === "p2") newWinner = "p1";

      return {
        ...m,
        a1: m.a2,
        a2: m.a1,
        winner: newWinner,
        p1IsFav: true
      };
    });

    saveHistory(fixedHistory);
    alert("Historique corrigé ! 🧹 Tes matchs sont maintenant parfaitement alignés.");
  };
  
  const alreadyAdded = (s) => rules.some((r) =>
    r.p1_movement === s.meta.a1.movement && r.p1_breach === s.meta.a1.breach &&
    r.p2_movement === s.meta.a2.movement && r.p2_breach === s.meta.a2.breach
  );

  const existingRule = (s) => rules.find((r) =>
    r.p1_movement === s.meta.a1.movement && r.p1_breach === s.meta.a1.breach &&
    r.p2_movement === s.meta.a2.movement && r.p2_breach === s.meta.a2.breach
  );

  const addSuggested = (s) => {
    const label = `Favori ${s.meta.a1.movement === "up" ? "monte" : "baisse"} (${s.meta.a1.breach ? "seuil KO" : "seuil OK"}) + Outsider ${s.meta.a2.movement === "up" ? "monte" : "baisse"} (${s.meta.a2.breach ? "seuil KO" : "seuil OK"}) + Dernier: ${s.lastWinner === "favori" ? "Fav" : s.lastWinner === "outsider" ? "Out" : "?"} → ${s.winner === "favori" ? "Favori" : "Outsider"} gagne`;
    const existing = existingRule(s);
    if (existing) {
      saveRules(rules.map(r => r.id === existing.id ? {
        ...r, label, winner: s.winner,
        last_winner: s.lastWinner !== "inconnu" ? s.lastWinner : undefined,
        description: `Détectée auto — ${s.total} matchs, confiance ${s.confidence}%`,
        confidence: s.confidence,
      } : r));
    } else {
      saveRules([...rules, {
        id: Date.now(), label,
        description: `Détectée auto — ${s.total} matchs, confiance ${s.confidence}%`,
        p1_movement: s.meta.a1.movement, p1_breach: s.meta.a1.breach,
        p2_movement: s.meta.a2.movement, p2_breach: s.meta.a2.breach,
        last_winner: s.lastWinner !== "inconnu" ? s.lastWinner : undefined,
        winner: s.winner, active: true, confidence: s.confidence,
      }]);
    }
  };

  const S = {
    btn: { display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 1.25rem", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.8rem", fontWeight: 500 },
    section: { background: "#12121e", border: "1px solid #1e1e30", borderRadius: 12, padding: "1.5rem", marginBottom: "1.25rem" },
    sTitle: { fontFamily: "Syne, sans-serif", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b6b88", marginBottom: "1.25rem" },
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
        @keyframes pulse-gold {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
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
        }
      `}</style>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>

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

        <div style={{ display: "flex", marginBottom: "2rem", border: "1px solid #2a2a3a", borderRadius: 8, overflow: "hidden" }}>
          {tabs.map(({ key, label, count }) => (
            <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: "0.7rem 0.4rem", background: tab === key ? "#1a1a2e" : "transparent", border: "none", borderBottom: tab === key ? "2px solid #a78bfa" : "2px solid transparent", color: tab === key ? "#a78bfa" : "#6b6b88", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.7rem", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {label}
              {count !== undefined && <span style={{ marginLeft: "0.3rem", background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.1rem 0.4rem", fontSize: "0.62rem", color: "#a78bfa" }}>{count}</span>}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", padding: "3rem", color: "#6b6b88" }}><Spinner /><br /><br />Connexion…</div>}

        {!loading && (
          <>
            {tab === "analyze" && (
              <>
                <div style={S.section}>
                  <div style={S.sTitle}>Saisie des cotes</div>
                  <div className="g2">
                    <OddsInput label="Joueur 1" color="#a78bfa" value={p1} onChange={setP1} />
                    <OddsInput label="Joueur 2" color="#60a5fa" value={p2} onChange={setP2} />
                  </div>
                  <div style={{ marginTop: "1rem" }}>
                    <label style={S.label}>⏮ Gagnant du dernier match entre ces deux joueurs</label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      {["favori", "outsider"].map(v => (
                        <button key={v} onClick={() => setLastWinnerInput(v)} style={{ flex: 1, padding: "0.55rem", borderRadius: 6, border: `1px solid ${lastWinnerInput === v ? (v === "favori" ? "#f59e0b" : "#60a5fa") : "#2a2a3a"}`, background: lastWinnerInput === v ? (v === "favori" ? "#1c1008" : "#0a1018") : "transparent", color: lastWinnerInput === v ? (v === "favori" ? "#fbbf24" : "#93c5fd") : "#6b6b88", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.78rem", cursor: "pointer", fontWeight: lastWinnerInput === v ? 600 : 400 }}>
                          {v === "favori" ? "⭐ Favori avait gagné" : "💥 Outsider avait gagné"}
                        </button>
                      ))}
                    </div>
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
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: fav ? "#fbbf24" : "#a0a0c0", border: `1px solid ${fav ? "#78350f" : "#2a2a3a"}`, borderRadius: 4, padding: "0.15rem 0.4rem", background: fav ? "#1c1008" : "#12121e", verticalAlign: "middle" }}>
                            {fav ? "FAVORI" : "OUTSIDER"}
                          </span>
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
                      <div>
                        {matchedRules.map((r) => {
                          const stats = computeRuleStats(r, history, thresholdUp, thresholdDown);
                          const isGolden = stats && stats.confidence >= 80;
                          
                          return (
                            <div key={r.id} style={{ 
                              background: isGolden ? "linear-gradient(135deg, #2a1600, #140a00)" : "#0d1f0d", 
                              border: `1px solid ${isGolden ? "#f59e0b" : "#1e3a1e"}`, 
                              borderRadius: 8, 
                              padding: "0.85rem 1rem", 
                              marginBottom: "0.75rem",
                              animation: isGolden ? "pulse-gold 2s infinite" : "none"
                            }}>
                              <div style={{ fontSize: "0.85rem", color: isGolden ? "#fbbf24" : "#86efac", fontWeight: 700, marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                {isGolden && <span style={{ background: "#f59e0b", color: "#451a03", padding: "0.1rem 0.4rem", borderRadius: 4, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Signal Fort</span>}
                                {r.label}
                              </div>
                              
                              {stats ? (
                                <div style={{ borderTop: "1px solid #1a3a1a", paddingTop: "0.65rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                                    <div style={{ flex: 1, height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
                                      <div style={{ height: "100%", width: `${stats.confidence}%`, background: stats.confidence >= 70 ? "linear-gradient(90deg,#4ade80,#22c55e)" : stats.confidence >= 50 ? "linear-gradient(90deg,#fbbf24,#f59e0b)" : "linear-gradient(90deg,#f87171,#ef4444)", borderRadius: 3 }} />
                                    </div>
                                    <span style={{ fontSize: "0.72rem", color: stats.confidence >= 70 ? "#4ade80" : stats.confidence >= 50 ? "#fbbf24" : "#f87171", fontWeight: 600, whiteSpace: "nowrap" }}>{stats.confidence}% réussite</span>
                                    <span style={{ fontSize: "0.65rem", color: "#6b6b88", whiteSpace: "nowrap" }}>{stats.correctCount}/{stats.total}m</span>
                                  </div>
                                  {stats.avgWinOdd !== "—" && (
                                    <div style={{ marginBottom: "0.5rem" }}>
                                      <span style={{ background: "#0f1a0f", border: "1px solid #166534", borderRadius: 4, padding: "0.2rem 0.6rem", fontSize: "0.65rem", color: "#4ade80", fontWeight: 600 }}>
                                        ✓ Cote moy. {r.winner === "favori" ? "Favori" : "Outsider"} quand correct : {stats.avgWinOdd}
                                      </span>
                                    </div>
                                  )}
                                  {stats.topRounds.length > 0 ? (
                                    <div>
                                      <span style={{ fontSize: "0.62rem", color: "#6b6b88", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rounds ({stats.totalWithRound}/{stats.total} renseignés) :</span>
                                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                                        {stats.topRounds.map((rd, ri) => (
                                          <span key={ri} style={{ background: ri === 0 ? "#1a0f2e" : "#12121e", border: `1px solid ${rd.pct >= 80 ? "#7c3aed" : rd.pct >= 60 ? "#2563eb" : "#2a2a3a"}`, borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: rd.pct >= 80 ? "#c4b5fd" : rd.pct >= 60 ? "#93c5fd" : "#a0a0c0" }}>
                                            {ri === 0 ? "🎯 " : ""}{rd.rnd} · {rd.pct}% ({rd.total}m)
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: "0.62rem", color: "#3a3a55" }}>Aucun round renseigné pour cette règle</div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: "0.68rem", color: "#3a3a55", borderTop: "1px solid #1a3a1a", paddingTop: "0.5rem" }}>
                                  Pas encore de données dans l'historique pour cette règle.
                                </div>
                              )}
                            </div>
                          );
                        })}
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

            {tab === "history" && (
              <>
                <div style={S.section}>
                  <div style={S.sTitle}>Ajouter un match</div>
                  <div className="fg" style={{ marginBottom: "0.75rem" }}>
                    <div>
                      <label style={S.label}>Nom du match (optionnel)</label>
                      <input className="inp" type="text" placeholder="ex: Djokovic vs Alcaraz" value={hLabel} onChange={(e) => setHLabel(e.target.value)} />
                    </div>
                    <div>
                      <label style={S.label}>Round (optionnel)</label>
                      <input className="inp" type="text" placeholder="ex: 1/8, QF, SF…" value={hRound} onChange={(e) => setHRound(e.target.value)} />
                    </div>
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
                    <div>
                      <label style={S.label}>Gagnant du dernier match</label>
                      <select value={hLastWinner} onChange={(e) => setHLastWinner(e.target.value)}>
                        <option value="favori">Favori</option>
                        <option value="outsider">Outsider</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button style={{ ...S.btn, background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "white", width: "100%", justifyContent: "center" }} onClick={addMatch} disabled={!hP1.before || !hP1.after || !hP2.before || !hP2.after}>
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>

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
                          <div style={{ textAlign: "center", color: "#6b6b88", fontSize: "0.78rem" }}>Aucun pattern avec cette confiance.</div>
                        ) : suggested.map((s, i) => (
                          <div key={i} style={{ background: "#0a0f0a", border: "1px solid #1e3a1e", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "0.65rem", display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "0.72rem", color: "#4ade80", fontWeight: 600, marginBottom: "0.25rem" }}>{s.confidence}% confiance · {s.total} match{s.total > 1 ? "s" : ""}</div>
                              <div style={{ width: 80, height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden", marginBottom: "0.6rem" }}>
                                <div style={{ height: "100%", width: `${s.confidence}%`, background: "linear-gradient(90deg,#4ade80,#22c55e)", borderRadius: 3 }} />
                              </div>
                              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                                {[`Favori: ${s.meta.a1.movement === "up" ? "monte" : "baisse"} ${s.meta.a1.breach ? "⚠" : "✓"}`, `Outsider: ${s.meta.a2.movement === "up" ? "monte" : "baisse"} ${s.meta.a2.breach ? "⚠" : "✓"}`]
                                  .map((t, j) => <span key={j} style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#a0a0c0" }}>{t}</span>)}
                                {s.lastWinner && s.lastWinner !== "inconnu" && (
                                  <span style={{ background: "#0a1018", border: "1px solid #1e3a5e", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#93c5fd" }}>
                                    ⏮ Dernier: {s.lastWinner === "favori" ? "Fav" : "Out"}
                                  </span>
                                )}
                                <span style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#fbbf24" }}>
                                  → {s.winner === "favori" ? "Favori" : "Outsider"} gagne
                                </span>
                              </div>
                              <div style={{ fontSize: "0.65rem", color: "#6b6b88", marginBottom: "0.4rem" }}>Favori gagne: {s.fav}× · Outsider gagne: {s.outsider}×</div>
                              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                                <span style={{ background: "#1c1008", border: "1px solid #78350f", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#fbbf24" }}>Cote moy. Favori : {s.avgFavOdd}</span>
                                <span style={{ background: "#0a1018", border: "1px solid #1e3a5e", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#93c5fd" }}>Cote moy. Outsider : {s.avgOutsiderOdd}</span>
                              </div>
                              <div style={{ marginBottom: "0.4rem" }}>
                                <span style={{ background: "#0f1a0f", border: "1px solid #166534", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#4ade80", fontWeight: 600 }}>✓ Cote moy. {s.winner === "favori" ? "Favori" : "Outsider"} quand correct : {s.avgWinOddWhenCorrect}</span>
                              </div>
                              {s.topRounds && s.topRounds.length > 0 && (
                                <div style={{ marginTop: "0.3rem" }}>
                                  <span style={{ fontSize: "0.62rem", color: "#6b6b88", textTransform: "uppercase", letterSpacing: "0.06em" }}>Rounds ({s.totalWithRound}/{s.total} matchs renseignés) : </span>
                                  <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                                    {s.topRounds.map((r, ri) => (
                                      <span key={ri} style={{ background: ri === 0 ? "#1a0f2e" : "#12121e", border: `1px solid ${r.pct >= 80 ? "#7c3aed" : r.pct >= 60 ? "#2563eb" : "#2a2a3a"}`, borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: r.pct >= 80 ? "#c4b5fd" : r.pct >= 60 ? "#93c5fd" : "#a0a0c0" }}>
                                        {ri === 0 ? "🎯 " : ""}{r.rnd} · {r.pct}% ({r.total}m)
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {s.topRounds && s.topRounds.length === 0 && s.total > 0 && (
                                <div style={{ fontSize: "0.62rem", color: "#3a3a55", marginTop: "0.3rem" }}>Aucun round renseigné pour ce pattern</div>
                              )}
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

                {history.length >= 2 && (
                  <div style={{ ...S.section, border: "1px solid #ea580c", background: "linear-gradient(to bottom right, #1a0f0a, #0a0a0f)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                      <div>
                        <div style={{ ...S.sTitle, color: "#f59e0b", marginBottom: "0.2rem" }}>Deep Scan (Golden Patterns)</div>
                        <div style={{ fontSize: "0.68rem", color: "#a0a0c0" }}>Recherche les seuils générant +80% de réussite.</div>
                      </div>
                      <button 
                        style={{ ...S.btn, background: "linear-gradient(135deg, #f59e0b, #ea580c)", color: "white", fontWeight: 600 }} 
                        onClick={runDeepScan} 
                        disabled={isScanning}
                      >
                        {isScanning ? "Analyse en cours..." : "✨ Lancer le Deep Scan"}
                      </button>
                    </div>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                      <span style={{ fontSize: "0.72rem", color: "#6b6b88" }}>Échantillon min. :</span>
                      <input className="inp" type="number" min="2" max="50" value={minMatchesDeep} onChange={(e) => setMinMatchesDeep(parseInt(e.target.value) || 5)} style={{ width: 70, borderColor: "#ea580c" }} />
                      <span style={{ fontSize: "0.72rem", color: "#6b6b88" }}>matchs</span>
                    </div>
                
                    {showDeepScan && !isScanning && (
                      <div style={{ marginTop: "1.25rem" }}>
                        <div style={{ borderTop: "1px solid #3a1a0a", marginBottom: "1rem" }} />
                        {goldenPatterns.length === 0 ? (
                          <div style={{ textAlign: "center", color: "#6b6b88", fontSize: "0.78rem" }}>Aucun pattern à +80% trouvé avec cet échantillon.</div>
                        ) : goldenPatterns.map((p, i) => (
                          <div key={i} style={{ background: "#1c1008", border: "1px solid #78350f", borderRadius: 10, padding: "1rem", marginBottom: "0.65rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                              <div>
                                <div style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 700 }}>🔥 {p.confidence}% réussite ({p.winner === "favori" ? "Favori" : "Outsider"})</div>
                                <div style={{ fontSize: "0.7rem", color: "#d97706" }}>Sur {p.total} matchs</div>
                              </div>
                              <button
                                style={{ ...S.btn, background: alreadyAddedGolden(p) ? "#2a180a" : "linear-gradient(135deg,#f59e0b,#ea580c)", color: alreadyAddedGolden(p) ? "#f59e0b" : "white", fontSize: "0.65rem", padding: "0.4rem 0.85rem", border: alreadyAddedGolden(p) ? "1px solid #f59e0b" : "none" }}
                                onClick={() => !alreadyAddedGolden(p) && addGoldenRule(p)}
                              >
                                {alreadyAddedGolden(p) ? "✓ Dans les règles" : "+ Ajouter aux Règles"}
                              </button>
                            </div>
                            <div style={{ fontSize: "0.85rem", color: "#fef3c7", marginBottom: "0.5rem", fontWeight: 500 }}>
                              {p.key}
                            </div>
                            <div style={{ fontSize: "0.68rem", color: "#a1a1aa", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                              <span><strong>Seuil Hausse :</strong> {p.thUp}</span>
                              <span><strong>Seuil Baisse :</strong> {p.thDown}</span>
                              <span><strong>Détail :</strong> {p.fav} Fav - {p.outsider} Out</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={S.section}>
                  <div style={S.sTitle}>Matchs ({history.length})</div>
                  {history.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "#6b6b88", fontSize: "0.8rem" }}>Aucun match.</div>
                  ) : history.map((m) => {
                    const p1Fav = getP1IsFav(m);
                    const wLabel = winnerLabel(m.winner, p1Fav);
                    const isEditingRound = editingRoundId === m.id;
                    return (
                      <div key={m.id} style={{ background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "0.75rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                          <div>
                            <div style={{ fontFamily: "Syne, sans-serif", fontSize: "0.9rem", fontWeight: 700 }}>{m.label}</div>
                            <div style={{ fontSize: "0.68rem", color: "#6b6b88", marginTop: "0.2rem" }}>{m.date}</div>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <span style={{ background: "#1c1008", border: "1px solid #78350f", borderRadius: 4, padding: "0.15rem 0.5rem", fontSize: "0.65rem", color: "#fbbf24" }}>🏆 {wLabel} gagne</span>
                            {m.lastWinner && (
                              <span style={{ background: "#0a0f1a", border: "1px solid #1e3a5e", borderRadius: 4, padding: "0.15rem 0.5rem", fontSize: "0.65rem", color: "#93c5fd" }}>
                                ⏮ Dernier match : {m.lastWinner === "favori" ? "Favori" : "Outsider"}
                              </span>
                            )}
                            <button style={{ ...S.btn, padding: "0.35rem 0.65rem", fontSize: "0.68rem", background: "transparent", border: "1px solid #3a1a1a", color: "#f87171" }} onClick={() => saveHistory(history.filter(h => h.id !== m.id))}>✕</button>
                          </div>
                        </div>

                        <div style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.65rem", color: "#6b6b88", textTransform: "uppercase", letterSpacing: "0.06em" }}>Round :</span>
                          {isEditingRound ? (
                            <>
                              <input
                                className="inp"
                                type="text"
                                placeholder="ex: 1/8, QF, SF…"
                                value={editingRoundVal}
                                onChange={(e) => setEditingRoundVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveRoundEdit(m.id); if (e.key === "Escape") { setEditingRoundId(null); setEditingRoundVal(""); } }}
                                autoFocus
                                style={{ width: 120, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                              />
                              <button onClick={() => saveRoundEdit(m.id)} style={{ background: "#065f46", border: "none", borderRadius: 4, color: "#d1fae5", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.65rem", padding: "0.3rem 0.6rem", cursor: "pointer" }}>✓</button>
                              <button onClick={() => { setEditingRoundId(null); setEditingRoundVal(""); }} style={{ background: "transparent", border: "1px solid #3a1a1a", borderRadius: 4, color: "#f87171", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.65rem", padding: "0.3rem 0.6rem", cursor: "pointer" }}>✕</button>
                            </>
                          ) : (
                            <button
                              onClick={() => { setEditingRoundId(m.id); setEditingRoundVal(m.round || ""); }}
                              style={{ background: m.round ? "#1a1a2e" : "transparent", border: `1px solid ${m.round ? "#7c3aed" : "#2a2a3a"}`, borderRadius: 4, color: m.round ? "#c4b5fd" : "#3a3a55", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.65rem", padding: "0.25rem 0.6rem", cursor: "pointer" }}
                            >
                              {m.round ? m.round : "+ Ajouter round"}
                            </button>
                          )}
                        </div>

                        <div className="g2">
                          {[{ label: "Favori", a: m.a1, color: "#a78bfa", fav: true }, { label: "Outsider", a: m.a2, color: "#60a5fa", fav: false }].map((p, i) => (
                            <div key={i} style={{ background: "#12121e", borderRadius: 8, padding: "0.75rem" }}>
                              <div style={{ fontSize: "0.7rem", color: p.color, marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                {p.label} <span style={{ color: p.fav ? "#fbbf24" : "#6b6b88" }}>({p.fav ? "Favori" : "Outsider"})</span>
                              </div>
                              <div style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>{p.a.before.toFixed(2)} → {p.a.after.toFixed(2)}</div>
                              <Badge movement={p.a.movement} diff={p.a.diff} breach={p.a.breach} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

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
                      <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Nom *</label><input className="inp" type="text" placeholder="ex: Favori monte (seuil KO) → Outsider gagne" value={newRule.label} onChange={(e) => setNewRule({ ...newRule, label: e.target.value })} /></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Description</label><textarea className="inp" style={{ minHeight: 60, resize: "vertical", lineHeight: 1.5 }} placeholder="Explication..." value={newRule.description} onChange={(e) => setNewRule({ ...newRule, description: e.target.value })} /></div>
                      <div><label style={S.label}>J1 — Mouvement</label><select value={newRule.p1_movement} onChange={(e) => setNewRule({ ...newRule, p1_movement: e.target.value })}><option value="up">▲ Monte</option><option value="down">▼ Baisse</option><option value="any">Peu importe</option></select></div>
                      <div><label style={S.label}>J1 — Seuil</label><select value={newRule.p1_breach ? "b" : "o"} onChange={(e) => setNewRule({ ...newRule, p1_breach: e.target.value === "b" })}><option value="b">⚠ Non-respecté</option><option value="o">✓ Respecté</option></select></div>
                      <div><label style={S.label}>J2 — Mouvement</label><select value={newRule.p2_movement} onChange={(e) => setNewRule({ ...newRule, p2_movement: e.target.value })}><option value="up">▲ Monte</option><option value="down">▼ Baisse</option><option value="any">Peu importe</option></select></div>
                      <div><label style={S.label}>J2 — Seuil</label><select value={newRule.p2_breach ? "b" : "o"} onChange={(e) => setNewRule({ ...newRule, p2_breach: e.target.value === "b" })}><option value="b">⚠ Non-respecté</option><option value="o">✓ Respecté</option></select></div>
                      <div style={{ gridColumn: "1/-1" }}><label style={S.label}>Gagnant prédit</label><select value={newRule.winner} onChange={(e) => setNewRule({ ...newRule, winner: e.target.value })}><option value="favori">Favori</option><option value="outsider">Outsider</option></select></div>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem" }}>
                      <button style={{ ...S.btn, background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "white" }} onClick={addRule}>Enregistrer</button>
                      <button style={{ ...S.btn, background: "transparent", border: "1px solid #2a2a3a", color: "#a0a0c0" }} onClick={() => setShowForm(false)}>Annuler</button>
                    </div>
                  </div>
                )}
                {rules.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "#6b6b88", fontSize: "0.8rem" }}>Aucune règle.</div>
                ) : rules.map((r) => (
                  <div key={r.id} style={{ background: "#0a0a0f", border: "1px solid #1e1e30", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "0.75rem", display: "flex", alignItems: "flex-start", gap: "1rem", opacity: r.active === false ? 0.45 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.85rem", color: "#c4b5fd", fontWeight: 500, marginBottom: "0.3rem" }}>{r.label}</div>
                      {r.description && <div style={{ fontSize: "0.72rem", color: "#6b6b88", lineHeight: 1.5, marginBottom: "0.5rem" }}>{r.description}</div>}
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                      {[`Favori: ${r.p1_movement === "up" ? "monte" : r.p1_movement === "down" ? "baisse" : "~"} ${r.p1_breach ? "⚠" : "✓"}`, `Outsider: ${r.p2_movement === "up" ? "monte" : r.p2_movement === "down" ? "baisse" : "~"} ${r.p2_breach ? "⚠" : "✓"}`]
                         .map((t, i) => <span key={i} style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#a0a0c0" }}>{t}</span>)}
                        {r.last_winner && <span style={{ background: "#0a1018", border: "1px solid #1e3a5e", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#93c5fd" }}>⏮ Dernier: {r.last_winner === "favori" ? "Fav" : "Out"}</span>}
                        <span style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 4, padding: "0.2rem 0.5rem", fontSize: "0.65rem", color: "#fbbf24" }}>→ {winnerLabel(r.winner, true)} gagne</span>
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

            {tab === "settings" && (
              <div style={S.section}>
                <div style={S.sTitle}>Configuration des seuils</div>
                <div className="fg">
                  <div>
                    <label style={S.label}>▲ Hausse — non-respecté si diff &gt; X</label>
                    <input className="inp" type="number" step="0.01" min="0.01" value={thresholdUp} onChange={(e) => setThresholdUp(parseFloat(e.target.value) || 0.34)} />
                    <div style={{ fontSize: "0.68rem", color: "#6b6b88", marginTop: "0.4rem" }}>Actuel : diff &gt; {thresholdUp} = non-respecté</div>
                  </div>
                  <div>
                    <label style={S.label}>▼ Baisse — non-respecté si |diff| &lt; X</label>
                    <input className="inp" type="number" step="0.01" min="0.01" value={thresholdDown} onChange={(e) => setThresholdDown(parseFloat(e.target.value) || 0.14)} />
                    <div style={{ fontSize: "0.68rem", color: "#6b6b88", marginTop: "0.4rem" }}>Actuel : |diff| &lt; {thresholdDown} = non-respecté</div>
                  </div>
                </div>
                <div style={{ ...S.section, marginTop: "1.25rem", border: "1px solid #7f1d1d", background: "#2a0a0a" }}>
                  <div style={{ ...S.sTitle, color: "#f87171" }}>Maintenance de la Base de Données</div>
                  <div style={{ fontSize: "0.78rem", color: "#fca5a5", marginBottom: "1rem", lineHeight: 1.5 }}>
                    Utilise ce bouton si tu as saisi des matchs où le Favori était en Joueur 2. 
                    L'outil va scanner tout ton historique et inverser les données pour que le Favori soit TOUJOURS en Joueur 1.
                  </div>
                  <button 
                    style={{ ...S.btn, background: "#7f1d1d", color: "white" }} 
                    onClick={normalizeHistory}
                  >
                    🧹 Normaliser l'historique (Forcer Fav = J1)
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
