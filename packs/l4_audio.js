// L4: Speech In/Out using browser engines only.
// STT uses Web Speech API (if available). TTS uses speechSynthesis.
// Fails gracefully when unsupported.

export const L4Audio = (() => {
  const hasTTS = !!window.speechSynthesis;
  const hasSTT = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function speak(text, lang='en'){
    if (!hasTTS || !text) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'es' ? 'es-ES' : 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return true;
  }

  function listen({ lang='en', onResult, onEnd }={}){
    if (!hasSTT) return () => {};
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang === 'es' ? 'es-ES' : 'en-US';
    rec.interimResults = true; rec.continuous = false;
    rec.onresult = (e)=>{
      const t = Array.from(e.results).map(r=>r[0].transcript).join(' ');
      onResult && onResult(t, e.results[e.results.length-1].isFinal);
    };
    rec.onend = ()=> onEnd && onEnd();
    rec.start();
    return ()=> { try { rec.stop(); } catch{} };
  }

  return { hasTTS, hasSTT, speak, listen };
})();
