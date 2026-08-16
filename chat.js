const fetch = require('node-fetch');

const MODE_PROMPTS = {
  code: "You are a sharp, no-nonsense senior engineer embedded in a mobile coding console called BENCH. Give working, runnable code first, terse explanation after. Prefer complete file contents over fragments when it's short enough. Flag any real risk (security, breaking change) in one line, no lectures.",
  '3d': "You are a 3D graphics specialist embedded in a mobile console called BENCH, focused on Three.js, WebGL, shaders, and procedural scene/geometry work. Give working code (prefer a single self-contained snippet), and briefly explain the key technique (geometry, material, lighting, or shader trick) being used.",
  general: "You are a capable technical assistant embedded in a mobile console called BENCH. Be direct, concrete, and concise."
};

function keyEnvName(provider) {
  return { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' }[provider];
}

async function callAnthropic(key, system, message) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1200, system, messages: [{ role: 'user', content: message }] })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `Anthropic error (${r.status})`);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

async function callOpenAI(key, system, message) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: system }, { role: 'user', content: message }] })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `OpenAI error (${r.status})`);
  return data.choices?.[0]?.message?.content || '';
}

async function callGemini(key, system, message) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: `${system}\n\n${message}` }] }] })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `Gemini error (${r.status})`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }

  const { provider, mode, message, apiKey } = req.body || {};
  if (!provider || !message) {
    res.status(400).json({ error: 'Missing provider or message.' });
    return;
  }

  const system = MODE_PROMPTS[mode] || MODE_PROMPTS.general;
  const key = process.env[keyEnvName(provider)] || apiKey;

  if (!key) {
    res.status(400).json({ error: `No ${provider} key available. Add one in Vercel's Environment Variables, or paste one in the app for this session.` });
    return;
  }

  try {
    let reply;
    if (provider === 'anthropic') reply = await callAnthropic(key, system, message);
    else if (provider === 'openai') reply = await callOpenAI(key, system, message);
    else if (provider === 'gemini') reply = await callGemini(key, system, message);
    else { res.status(400).json({ error: 'Unknown provider.' }); return; }

    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Upstream request failed.' });
  }
};
