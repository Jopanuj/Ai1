# bench :: terminal v2

Pure static, terminal-style AI console with real conversation memory and a live 3D preview pane. No backend, no build step, no npm.

## Host it on GitHub Pages (free)

1. New GitHub repo -> upload `index.html`, `style.css`, `app.js` to the root
2. Settings -> Pages -> Deploy from branch -> `main` / root -> Save
3. Live at `https://<you>.github.io/<repo>/` in about a minute

## Run it in Termux

```bash
pkg install python
cd bench-terminal
python -m http.server 8080
```
Open `http://localhost:8080` in the browser -- don't open `index.html` directly as a file, some Android browsers block API calls from `file://` pages.

## What's actually running

Current flagship model per provider, as of August 2026:

| Provider  | Model            | Works direct-from-browser? |
|-----------|------------------|------------------------------|
| Anthropic | claude-opus-5    | Yes (Anthropic supports this) |
| Google    | gemini-3.1-pro-preview | Yes (Google supports this) |
| OpenAI    | gpt-5.6-sol      | Usually blocked by OpenAI's CORS policy -- included, but expect it may fail without a backend proxy |

These model IDs will go stale as providers ship new versions -- check each provider's docs periodically and swap the string in `MODEL_IDS` at the top of `app.js` if a newer flagship comes out.

## Commands

```
key <paste api key>     add a key -- provider auto-detected from its format
keys                    list stored keys and which model each uses
rm <index>               remove a key
mode code|3d|general      set what the model optimizes for
power low|medium|high|max how hard each model reasons before answering (default: max)
reset                    clear conversation memory (keys stay saved)
clear                    clear the screen
<anything else>          sent to every configured provider, with your thread's memory
```

## The "power" dial -- the real way to get better answers

Every provider here ships its own reasoning-depth control, and the app is wired straight into it:

| Provider  | Real parameter                  | What it does |
|-----------|----------------------------------|--------------|
| Anthropic | `output_config.effort`           | Opus 5 spends more internal reasoning tokens before answering |
| OpenAI    | `reasoning_effort`                | GPT-5.6 Sol does the same, its own way |
| Google    | `thinkingConfig.thinking_level`   | Gemini 3.1 Pro's top level is its "Deep Think Mini" reasoning tier |

Set with `power max` for the most thorough answer each model is capable of, or drop to `low`/`medium` for faster, cheaper responses on simple questions. This is a real lever those providers built in -- not a trick, and not something that changes the model itself. Higher power costs more tokens and takes longer; there's no setting that makes it both smarter and free.

## 3D preview

Any reply containing Three.js-looking code gets a **▶ preview** button next to copy. Tap it and the code runs live in the "3d preview" tab, in a sandboxed iframe with Three.js r128 loaded. Ask in `mode 3d` for best results -- it primes the model to write a self-contained snippet that creates its own renderer and appends it to the page.

## Memory

Each key keeps its own back-and-forth thread, so follow-up messages like "make it spin faster" or "now fix that bug" actually have context. `reset` wipes memory without touching your saved keys.

## Honest limits

- No provider offers unlimited free access -- your key's own limits apply, this app adds none of its own.
- "Sent to every provider" means you get every model's answer side by side. It is not one merged super-model -- that isn't something any wrapper can honestly claim.
- Keys live only in this browser's localStorage and are sent only to the provider they belong to.
