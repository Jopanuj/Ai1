const log = document.getElementById('log');
const cmd = document.getElementById('cmd');
const previewFrame = document.getElementById('previewFrame');
const previewLabel = document.getElementById('previewLabel');
const previewReload = document.getElementById('previewReload');

const STORAGE_KEY = 'bench_keys_v2';
let keys = loadKeys();            // [{provider, key}]
let conversations = {};           // key index -> [{role, content}]
let mode = 'code';
let power = 'max';                // low | medium | high | max -- how hard the model reasons
let lastPreviewCode = null;

const MODEL_IDS = {
  anthropic: 'claude-opus-5',     // Anthropic flagship, July 2026
  openai: 'gpt-5.6-sol',          // OpenAI flagship, GPT-5.6 family
  gemini: 'gemini-3.1-pro-preview' // Google flagship reasoning tier
};

// Each provider ships its own "think harder" dial. This maps our one
// power/1-4 setting onto each provider's real parameter -- this is the
// legitimate way to get noticeably better answers out of the same model.
const POWER_MAP = {
  anthropic: { low: 'low', medium: 'medium', high: 'high', max: 'max' },       // output_config.effort
  openai:    { low: 'low', medium: 'medium', high: 'high', max: 'max' },       // reasoning_effort
  gemini:    { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', max: 'HIGH' }       // thinkingConfig.thinking_level (no level above HIGH yet)
};

const MODE_PROMPTS = {
  code: "You are a sharp, no-nonsense senior engineer. Give working, runnable code first, terse explanation after. Prefer complete file contents over fragments when short enough. Flag any real risk in one line, no lectures.",
  '3d': "You are a 3D graphics specialist focused on Three.js. Assume the code runs in a plain HTML page where Three.js r128 is already loaded globally as THREE, and the code should create its own canvas/renderer and append it to document.body, then run its own animation loop. Give one complete, self-contained, runnable snippet. Briefly explain the key technique used.",
  general: "You are a capable, direct technical assistant. Be concise and concrete."
};

function loadKeys(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveKeys(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); }

function detectProvider(raw){
  const k = raw.trim();
  if (/^sk-ant-/.test(k)) return 'anthropic';
  if (/^AIza/.test(k)) return 'gemini';
  if (/^sk-/.test(k)) return 'openai';
  return null;
}
function maskKey(k){
  if (k.length <= 10) return k[0] + '***' + k.slice(-2);
  return k.slice(0,6) + '...' + k.slice(-4);
}

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.tab === 'chat' ? 'screen' : 'previewPanel').classList.add('active');
  });
});
previewReload.addEventListener('click', () => { if(lastPreviewCode) renderPreview(lastPreviewCode); });

/* ---------- printing ---------- */
function printLine(text, cls){
  const div = document.createElement('div');
  div.className = 'line' + (cls ? ' ' + cls : '');
  div.textContent = text;
  log.appendChild(div);
  scrollDown();
}
function printEcho(text){
  const div = document.createElement('div');
  div.className = 'line echo';
  div.textContent = text;
  log.appendChild(div);
  scrollDown();
}
function scrollDown(){ window.scrollTo({top: document.body.scrollHeight, behavior:'smooth'}); }
function escapeHtml(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function looks3D(code){
  return /THREE\.|three\.js|WebGLRenderer|new Scene\(/i.test(code);
}

function renderMarkdownish(text){
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  let html = '';
  for(let i=0;i<parts.length;i+=3){
    html += escapeHtml(parts[i]||'').replace(/\n/g,'<br>');
    if(parts[i+2] !== undefined){
      const code = parts[i+2];
      const id = 'code_' + Math.random().toString(36).slice(2,9);
      html += `<pre><code id="${id}">${escapeHtml(code)}</code>`;
      html += `<button class="copybtn" onclick="copyCode('${id}')">copy</button>`;
      if(looks3D(code)) html += `<button class="previewbtn" onclick="sendToPreview('${id}')">▶ preview</button>`;
      html += `</pre>`;
    }
  }
  return html;
}
function copyCode(id){
  const code = document.getElementById(id).textContent;
  navigator.clipboard.writeText(code);
}
function sendToPreview(id){
  const code = document.getElementById(id).textContent;
  renderPreview(code);
  document.querySelector('.tab[data-tab="preview"]').click();
}
function renderPreview(code){
  lastPreviewCode = code;
  previewLabel.textContent = 'running ' + code.length + ' chars of Three.js';
  const doc = `<!DOCTYPE html><html><head><style>*{margin:0}html,body{height:100%;overflow:hidden}canvas{display:block}</style></head><body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<script>
try {
${code}
} catch(e) {
  document.body.innerHTML = '<pre style="color:#E06B5C;font-family:monospace;padding:16px;">' + e.message + '</pre>';
}
<\/script>
</body></html>`;
  previewFrame.srcdoc = doc;
}

function printReply(provider, text){
  const div = document.createElement('div');
  div.className = 'reply';
  div.innerHTML = `<span class="tag">${provider} · ${MODEL_IDS[provider]}</span>${renderMarkdownish(text)}`;
  log.appendChild(div);
  scrollDown();
  const codeMatch = text.match(/```(?:\w*)\n?([\s\S]*?)```/);
  if(codeMatch && looks3D(codeMatch[1]) && document.querySelector('.tab[data-tab="preview"]').classList.contains('active') === false){
    // auto-load first 3D snippet into preview tab quietly, without switching tabs
    lastPreviewCode = codeMatch[1];
    previewLabel.textContent = 'new 3D code ready — open the 3d preview tab';
  }
}

function printKeyTable(){
  if(!keys.length){ printLine('no keys stored. paste one: key sk-ant-... (or sk-... / AIza...)', 'sys'); return; }
  const wrap = document.createElement('div');
  wrap.className = 'keytable';
  keys.forEach((k, i)=>{
    const row = document.createElement('div');
    row.className = 'keyrow';
    row.innerHTML = `<span class="kprov">[${i}] ${k.provider}</span><span class="kmask">${maskKey(k.key)} -- ${MODEL_IDS[k.provider]}</span>`;
    wrap.appendChild(row);
  });
  log.appendChild(wrap);
  scrollDown();
}

function printHelp(){
  [
    'commands:',
    '  key <paste api key>     add a key -- provider auto-detected from its format',
    '  keys                    list stored keys and which model each will use',
    '  rm <index>               remove a stored key',
    '  mode code|3d|general      set what the model optimizes for',
    '  power low|medium|high|max how hard each model reasons before answering (default: max)',
    '  reset                    clear conversation memory (keys stay saved)',
    '  clear                    clear the screen',
    '  <anything else>          sent to every configured provider, with memory of your thread',
    '',
    'each key keeps its own conversation thread. 3D-looking code blocks get a',
    '"preview" button that renders them live in the 3d preview tab.',
    '"power" uses each provider\'s own real reasoning-depth setting -- higher',
    'levels genuinely think longer, at higher latency and cost on your key.',
    'keys live only in this browser (localStorage) and go straight to their provider.'
  ].forEach(l => printLine(l, 'sys'));
}

cmd.addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    const val = cmd.value;
    cmd.value = '';
    if(val.trim().length) handleInput(val.trim());
  }
});

async function handleInput(raw){
  printEcho(raw);
  const [word, ...rest] = raw.split(' ');
  const arg = rest.join(' ');

  if(word === 'help'){ printHelp(); return; }
  if(word === 'clear'){ log.innerHTML=''; return; }
  if(word === 'keys'){ printKeyTable(); return; }
  if(word === 'reset'){ conversations = {}; printLine('conversation memory cleared for all keys', 'sys'); return; }

  if(word === 'key'){
    if(!arg){ printLine('usage: key <paste api key>', 'warn'); return; }
    const provider = detectProvider(arg);
    if(!provider){ printLine("couldn't identify that key's provider (expected sk-ant-..., sk-..., or AIza...)", 'err'); return; }
    keys.push({ provider, key: arg.trim() });
    saveKeys();
    printLine(`added ${provider} key -- will use ${MODEL_IDS[provider]} -- ${maskKey(arg.trim())}`, 'sys');
    return;
  }

  if(word === 'rm'){
    const i = parseInt(arg, 10);
    if(isNaN(i) || !keys[i]){ printLine('usage: rm <index> -- run "keys" to see indexes', 'warn'); return; }
    const removed = keys.splice(i,1)[0];
    saveKeys();
    delete conversations[i];
    printLine(`removed ${removed.provider} key`, 'sys');
    return;
  }

  if(word === 'mode'){
    if(!['code','3d','general'].includes(arg)){ printLine('usage: mode code | 3d | general', 'warn'); return; }
    mode = arg;
    printLine(`focus set to: ${mode}`, 'sys');
    return;
  }

  if(word === 'power'){
    if(!['low','medium','high','max'].includes(arg)){ printLine('usage: power low | medium | high | max -- how hard each model reasons before answering', 'warn'); return; }
    power = arg;
    printLine(`reasoning power set to: ${power} -- slower and pricier at the top end, but genuinely more thorough`, 'sys');
    return;
  }

  if(!keys.length){
    printLine('no keys configured yet. paste one first: key sk-ant-...  (or sk-... / AIza...)', 'warn');
    return;
  }
  await sendToAll(raw);
}

async function sendToAll(message){
  printLine(`sending to ${keys.length} provider(s) at power=${power}, with thread memory...`, 'sys');
  const system = MODE_PROMPTS[mode];

  const results = await Promise.allSettled(
    keys.map((k, i) => {
      if(!conversations[i]) conversations[i] = [];
      conversations[i].push({ role: 'user', content: message });
      return callProvider(k.provider, k.key, system, conversations[i]);
    })
  );

  results.forEach((r, i) => {
    const provider = keys[i].provider;
    if(r.status === 'fulfilled'){
      conversations[i].push({ role: 'assistant', content: r.value });
      printReply(provider, r.value);
    } else {
      printLine(`[${provider}] failed: ${r.reason.message}`, 'err');
    }
  });
}

async function callProvider(provider, key, system, messages){
  if(provider === 'anthropic') return callAnthropic(key, system, messages);
  if(provider === 'openai') return callOpenAI(key, system, messages);
  if(provider === 'gemini') return callGemini(key, system, messages);
  throw new Error('unknown provider');
}

async function callAnthropic(key, system, messages){
  // output_config.effort is Claude Opus 5's real reasoning-depth dial.
  // Higher effort = the model thinks longer before answering. max_tokens
  // has to leave room for that thinking, so it scales with power too.
  const maxTokens = { low: 1200, medium: 2000, high: 4000, max: 8000 }[power];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL_IDS.anthropic,
      max_tokens: maxTokens,
      system, messages,
      output_config: { effort: POWER_MAP.anthropic[power] }
    })
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
}

async function callOpenAI(key, system, messages){
  // reasoning_effort is GPT-5.6's equivalent dial.
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type':'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL_IDS.openai,
      messages: [{role:'system',content:system}, ...messages],
      reasoning_effort: POWER_MAP.openai[power]
    })
  });
  const data = await r.json();
  if(!r.ok) throw new Error((data.error?.message || `HTTP ${r.status}`) + ' -- OpenAI often blocks direct browser calls (CORS); that is a limit of static hosting, not a bug here');
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(key, system, messages){
  // thinking_level is Gemini 3.1 Pro's dial -- LOW/MEDIUM/HIGH (HIGH is its
  // "Deep Think Mini" tier, the deepest reasoning this model offers).
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const maxOut = { low: 1500, medium: 3000, high: 6000, max: 8192 }[power];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_IDS.gemini}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        maxOutputTokens: maxOut,
        thinkingConfig: { thinking_level: POWER_MAP.gemini[power] }
      }
    })
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error?.message || `HTTP ${r.status}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// boot
printLine(`stored keys: ${keys.length} -- reasoning power: ${power} (change with: power low|medium|high|max)`, 'sys');
if(keys.length) printKeyTable();
