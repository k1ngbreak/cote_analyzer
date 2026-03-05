// ── Fonctions utilitaires (dupliquées ici car le Worker est isolé) ──

function analyzeOdds(before, after, thUp, thDown) {
  const diff = Math.round((after - before) * 100) / 100;
  const movement = diff >= 0 ? "up" : "down";
  const breach = movement === "up" ? diff > thUp : Math.abs(diff) < thDown;
  return { before, after, diff, movement, breach };
}

function getP1IsFav(m) {
  return m.a1.after < m.a2.after;
}

function getOddsBracket(odd) {
  if (odd <= 1.30) return "Ultra-Fav (<=1.30)";
  if (odd <= 1.60) return "Fav Solide (1.31-1.60)";
  if (odd <= 1.95) return "Match Serré (1.61-1.95)";
  return "Outsider (>1.95)";
}

function scanSet(matchSet, thUp, thDown) {
  const map = {};
  matchSet.forEach(m => {
    const p1Fav = getP1IsFav(m);
    const favAfter = p1Fav ? m.a1.after : m.a2.after;
    const bracket = getOddsBracket(favAfter);
    const a1 = analyzeOdds(m.a1.before, m.a1.after, thUp, thDown);
    const a2 = analyzeOdds(m.a2.before, m.a2.after, thUp, thDown);
    const lastW = m.lastWinner || "inconnu";
    const k = `[${bracket}] Favori:${a1.movement}(${a1.breach ? "KO" : "OK"}) | Outsider:${a2.movement}(${a2.breach ? "KO" : "OK"}) | LastWin=${lastW}`;
    const winnerIsFav = (m.winner === "p1" && p1Fav) || (m.winner === "p2" && !p1Fav) || m.winner === "favori";
    if (!map[k]) map[k] = { fav: 0, outsider: 0, thUp, thDown, bracket, a1, a2, lastWinner: lastW };
    if (winnerIsFav) map[k].fav++;
    else map[k].outsider++;
  });
  return map;
}

// ── Réception du message depuis l'app ──
self.onmessage = function (e) {
  const { history, minMatchesDeep } = e.data;

  // Seuils : 0.01 à 0.60 par pas de 0.01 → 60x60 = 3600 combinaisons
  const thresholds = [];
  for (let i = 1; i <= 60; i++) {
    thresholds.push(Math.round(i * 0.01 * 100) / 100);
  }

  // ── TRAIN / TEST SPLIT ──
  const sorted = [...history].sort((a, b) => a.id - b.id);
  const splitIdx = Math.floor(sorted.length * 0.7);
  const trainSet = sorted.slice(0, splitIdx);
  const testSet = sorted.slice(splitIdx);
  const hasTestSet = testSet.length >= 2;

  const patternRobustness = {};
  const foundConfigs = [];
  const total_combinations = thresholds.length * thresholds.length;
  let done = 0;

  // ── PHASE 1 : scan sur le train set ──
  thresholds.forEach(thUp => {
    thresholds.forEach(thDown => {
      const trainMap = scanSet(trainSet, thUp, thDown);

      Object.entries(trainMap).forEach(([key, v]) => {
        const total = v.fav + v.outsider;
        if (total >= minMatchesDeep) {
          const confFav = Math.round((v.fav / total) * 100);
          const confOut = Math.round((v.outsider / total) * 100);

          if (!patternRobustness[key]) patternRobustness[key] = { favori: 0, outsider: 0 };
          if (confFav >= 80) {
            patternRobustness[key].favori++;
            foundConfigs.push({ ...v, winner: "favori", confidence: confFav, total, key });
          }
          if (confOut >= 80) {
            patternRobustness[key].outsider++;
            foundConfigs.push({ ...v, winner: "outsider", confidence: confOut, total, key });
          }
        }
      });

      done++;
      // Envoie la progression toutes les 200 combinaisons
      if (done % 200 === 0) {
        self.postMessage({ type: "progress", pct: Math.round((done / total_combinations) * 100) });
      }
    });
  });

  // ── PHASE 2 : dédoublonner ──
  const uniqueTrain = [];
  foundConfigs.sort((a, b) => b.confidence - a.confidence || b.total - a.total).forEach(config => {
    if (!uniqueTrain.some(u => u.key === config.key && u.winner === config.winner)) {
      uniqueTrain.push(config);
    }
  });

  // ── PHASE 3 : validation sur le test set ──
  const validated = uniqueTrain.map(p => {
    const robustness = patternRobustness[p.key]?.[p.winner] || 1;

    if (!hasTestSet) {
      return { ...p, robustness, validated: false, testConfidence: null, testTotal: 0, validationSkipped: true };
    }

    const testMap = scanSet(testSet, p.thUp, p.thDown);
    const testEntry = testMap[p.key];

    if (!testEntry) {
      return { ...p, robustness, validated: false, testConfidence: null, testTotal: 0 };
    }

    const testTotal = testEntry.fav + testEntry.outsider;
    const testCorrect = p.winner === "favori" ? testEntry.fav : testEntry.outsider;
    const testConf = Math.round((testCorrect / testTotal) * 100);
    const isValidated = testConf >= 60;

    return { ...p, robustness, validated: isValidated, testConfidence: testConf, testTotal };
  });

  validated.sort((a, b) => {
    if (a.validated !== b.validated) return b.validated - a.validated;
    if (b.robustness !== a.robustness) return b.robustness - a.robustness;
    return b.confidence - a.confidence;
  });

  // ── Résultat final ──
  self.postMessage({ type: "result", patterns: validated });
};
