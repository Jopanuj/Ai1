const state = { mode: 'code', busy: false, serverKeys: {} };

const providerHints = {
  anthropic: "Claude Sonnet — strongest default here for coding and 3D-scene work.",
  openai: "GPT-4o.",
  gemini: "Gemini 1.5 Pro."
};

const providerSel = document.getElementById('provider');
const keyField = document.getElementById('keyField');
const keyLabel = document.getElementById('keyLabel');
const apiKeyInput = document.getElementById('apiKey');
const providerHint = document.getElementById('providerHint');
const mark = document.getElementById('mark');
const statusTag = document.getElementById('statusTag');
const trace = document.getElementById('trace');
const tracePath = document.getElementById('tracePath');
const log = document.getElementById('log');
const emptyState = document.getElementById('emptyState');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const clearLink = document.getElementById('clearLink');

// Ask the server which providers already have a key configured in .env
fetch('/api/status').then(r => r.json()).then(data => {
  state.serverKeys = data;
  updateProviderUI();
}).catch(() => updateProviderUI());

function updateProviderUI() {
  const p = providerSel.value;
  const hasServerKey = state.serverKeys[p];
  keyLabel.textContent = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' }[p] + ' API key';

  if (hasServerKey) {
    keyField.style.display = 'none';
    providerHint.textContent = providerHints[p] + ' Key is configured on the server — nothing to paste in.';
    providerHint.className = 'hint ok';
  } else {
    keyField.style.display = 'block';
    providerHint.textContent = providerHints[p] + ' No server key found for this provider — paste one below for this session, or add it to .env on the server.';
    providerHint.className = 'hint warn';
  }
  refreshSignal();
}
providerSel.addEventListener('change', updateProviderUI);
apiKeyInput.addEventListener('input', refreshSignal);

function currentlyConnected() {
  return state.serverKeys[providerSel.value] || apiKeyInput.value.trim().length > 4;
}
function refreshSignal() {
  const connected = currentlyConnected();
  mark.classList.toggle('live', connected);
  statusTag.classList.toggle('on', connected);
  statusTag.textContent = connected ? providerSel.value + ' · ready' : 'no signal';
}

document.querySelectorAll('.modebtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modebtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
  });
});

/* ---- animated trace ---- */
let t = 0;
function drawTrace(amplitude) {
  t += 0.18;
  let d = "M0,18 ";
  for (let x = 0; x <= 400; x += 8) {
    const n = Math.sin(x * 0.06 + t) * amplitude * (0.4 + Math.random() * 0.6 * (amplitude > 1 ? 1 : 0));
    d += `L${x},${(18 + n).toFixed(1)} `;
  }
  tracePath.setAttribute('d', d);
}
function loopTrace() {
  const amp = state.busy ? 9 : (currentlyConnected() ? 2 : 0.4);
  trace.classList.toggle('live', state.busy || currentlyConnected());
  drawTrace(amp);
  requestAnimationFrame(loopTrace);
}
loopTrace();

/* ---- chat rendering ---- */
function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function renderMarkdownish(text) {
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  let html = '';
  for (let i = 0; i < parts.length; i += 3) {
    html += escapeHtml(parts[i] || '').replace(/\n/g, '<br>');
    if (parts[i + 2] !== undefined) {
      const code = parts[i + 2];
      html += `<pre><button class="copybtn" onclick="copyCode(this)">copy</button><code>${escapeHtml(code)}</code></pre>`;
    }
  }
  return html;
}
function copyCode(btn) {
  const code = btn.parentElement.querySelector('code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'copied';
    setTimeout(() => (btn.textContent = 'copy'), 1200);
  });
}
function addMessage(role, text) {
  emptyState.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;
  wrap.innerHTML = `<span class="tag">${role === 'user' ? 'you' : providerSel.value}</span><div class="bubble">${renderMarkdownish(text)}</div>`;
  log.appendChild(wrap);
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg ai';
  wrap.id = 'typingRow';
  wrap.innerHTML = `<span class="tag">${providerSel.value}</span><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  log.appendChild(wrap);
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
function removeTyping() {
  document.getElementById('typingRow')?.remove();
}

clearLink.addEventListener('click', () => {
  log.innerHTML = '';
  log.appendChild(emptyState);
  emptyState.style.display = 'block';
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
sendBtn.addEventListener('click', send);

async function send() {
  const text = input.value.trim();
  if (!text || state.busy) return;
  if (!currentlyConnected()) {
    addMessage('ai', `No key wired in for ${providerSel.value} yet. Paste one above, or add it to .env on the server.`);
    return;
  }
  addMessage('user', text);
  input.value = ''; input.style.height = 'auto';
  state.busy = true; sendBtn.disabled = true;
  addTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerSel.value,
        mode: state.mode,
        message: text,
        apiKey: apiKeyInput.value.trim() || undefined
      })
    });
    const data = await res.json();
    removeTyping();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    addMessage('ai', data.reply || '(empty response)');
  } catch (err) {
    removeTyping();
    addMessage('ai', `Signal lost: ${err.message}`);
  } finally {
    state.busy = false; sendBtn.disabled = false;
  }
}
