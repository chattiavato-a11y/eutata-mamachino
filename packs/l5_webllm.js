// l5_webllm.js
// WebLLM adapter with a DEFAULT loader. Nothing is fetched until called.
// You may host assets at /static/webllm/ (runtime + models). If not present,
// the loader throws and we fall back gracefully to server or local extractive.

export const WebLLM = (() => {
  let engine = null;
  let ready = false;
  let lastModel = null;

  function hasWebGPU(){ return !!navigator.gpu; }

  // Default loader — used if window.__WEBLLM_LOADER__ is not provided.
  // Host these paths yourself (or remove the loader to disable).
  async function __defaultLoader({ model, progress }){
    // 1) Load runtime
    await new Promise((res, rej) => {
      if (window.mlc?.createMLCEngine) return res();
      const s = document.createElement('script');
      s.src = '/static/webllm/web-llm.min.js'; // YOU host this file
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    // 2) Create engine
    if (!window.mlc?.createMLCEngine) throw new Error('engine_missing');
    const eng = await window.mlc.createMLCEngine(model, {
      // YOU host model blobs under this base (example layout):
      // /static/webllm/models/<model>/...
      assetBaseUrl: '/static/webllm/models/',
      initProgressCallback: (p)=> progress && progress(p)
    });
    // Optional compatibility shim to mimic OpenAI-like streaming:
    if (!eng.chat) {
      eng.chat = {
        completions: {
          async create(opts){
            // naive non-stream fallback:
            const out = await eng.chatCompletion({
              messages: opts.messages, temperature: opts.temperature ?? 0.2
            });
            // Wrap as async iterator
            async function* gen(){
              yield { choices: [ { delta: { content: out || '' } } ] };
            }
            return gen();
          }
        }
      };
      eng.modelId = model;
    }
    return eng;
  }

  async function load({ model='Llama-3.1-8B-Instruct-q4f16_1', progress } = {}){
    if (!hasWebGPU()) throw new Error('webgpu_unavailable');
    if (ready && engine && lastModel === model) return true;
    const loader = (typeof window.__WEBLLM_LOADER__ === 'function')
      ? window.__WEBLLM_LOADER__
      : __defaultLoader;
    engine = await loader({ model, progress });
    lastModel = model; ready = !!engine;
    return ready;
  }

  async function generate({ prompt, system='', onToken }){
    if (!ready || !engine) throw new Error('not_ready');
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    let out = '';
    const stream = await engine.chat.completions.create({
      model: engine.modelId || 'local',
      stream: true,
      temperature: 0.2,
      messages
    });

    for await (const ev of stream){
      const delta = ev?.choices?.[0]?.delta?.content || '';
      if (delta){
        out += delta;
        onToken && onToken(delta);
      }
    }
    return out;
  }

  return { hasWebGPU, load, generate, get ready(){ return ready; } };
})();
