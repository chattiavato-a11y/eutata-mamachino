// L5: Local micro-drafter (BM25 + extractive composition).
// Loads /packs/site-pack.json from YOUR origin (same Worker or static).
// No external libs, no model weights. Returns a grounded answer with [#ids] or null if insufficient.

export const L5Local = (() => {
  let PACK = null, INDEX = null;

  function tok(s){
    const t = (s||'').toLowerCase().normalize('NFKC');
    return t.match(/[a-z0-9áéíóúüñ]+/gi) || [];
  }
  function buildIndex(pack){
    const docs = [];
    for (const d of (pack.docs||[])){
      for (const c of (d.chunks||[])){
        const tokens = tok(c.text);
        docs.push({ id:c.id, text:c.text, lang:d.lang||'en', url:d.url||d.url, title:d.title||'', tokens, len:tokens.length });
      }
    }
    const N = docs.length || 1;
    let total = 0; const df = new Map();
    for (const doc of docs){
      total += doc.len; const seen = new Set(doc.tokens);
      for (const term of seen) df.set(term, (df.get(term)||0)+1);
    }
    const avgdl = total / N; const idf = new Map();
    for (const [term, n] of df.entries()){
      idf.set(term, Math.log(1 + (N - n + 0.5)/(n + 0.5)));
    }
    return { docs, avgdl, idf, N };
  }
  function bm25(q, doc, idx, k1=1.2, b=0.75){
    const terms = tok(q); if (!terms.length) return 0;
    let s=0, dl=doc.len||1;
    for (const term of terms){
      const idf = idx.idf.get(term); if (!idf) continue;
      let tf=0; for (const t of doc.tokens) if (t===term) tf++;
      if (!tf) continue;
      s += idf * ((tf*(k1+1))/(tf + k1*(1 - b + b*(dl/idx.avgdl))));
    }
    return s;
  }

  async function ensurePack(){
    if (PACK && INDEX) return;
    const r = await fetch('/packs/site-pack.json');
    if (!r.ok) throw new Error('pack_missing');
    PACK = await r.json();
    INDEX = buildIndex(PACK);
  }

  function composeExtractive(top, lang, bm25Min){
    const strong = top.filter(t=>t.score>=bm25Min).slice(0,4);
    if (!strong.length) return null;
    const lines = strong.map(t=>`${t.text} [#${t.id}]`);
    return lang==='es'
      ? `Basado en el contenido recuperado:\n\n${lines.join('\n\n')}`
      : `Based on retrieved content:\n\n${lines.join('\n\n')}`;
  }

  async function draft({ query, lang='en', bm25Min=0.6, coverageNeeded=2 }){
    await ensurePack();
    const scored=[];
    for (const d of INDEX.docs){
      if (lang && d.lang && d.lang!==lang) continue;
      const s = bm25(query, d, INDEX); if (s>0) scored.push({...d, score:s});
    }
    scored.sort((a,b)=>b.score-a.score);
    const top = scored.slice(0,5);
    const bm25_max = top[0]?.score || 0;
    const coverage = top.filter(x=>x.score>=bm25Min).length;
    const pass = bm25_max>=bm25Min && coverage>=coverageNeeded;
    if (!pass) return null;
    return composeExtractive(top, lang, bm25Min);
  }

  return { draft };
})();
