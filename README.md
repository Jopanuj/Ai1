# BENCH

A self-hosted console: type in your own API key(s), pick a provider, and get a coding / 3D-design-focused AI copilot on your phone or laptop — for free, hosted from your own GitHub repo.

## Why not just GitHub Pages

GitHub Pages only serves static files — it can't run a backend. Since OpenAI and Gemini block direct calls from a browser (CORS) and you don't want keys sitting in client-side JS, this needs a small server. **Vercel's free tier** solves that: it connects directly to a GitHub repo, runs the `api/` folder as serverless functions, and serves `public/` as the site — no separate hosting bill, no server to maintain.

## Publish it — GitHub + Vercel (free)

**1. Push this folder to GitHub**
```bash
cd bench-console
git init
git add .
git commit -m "BENCH console"
gh repo create bench-console --public --source=. --push
```
(No `gh` CLI? Create an empty repo on github.com, then `git remote add origin <your-repo-url>` and `git push -u origin main`.)

**2. Connect it to Vercel**
- Go to vercel.com -> sign in with your GitHub account (free, no card needed)
- **Add New Project** -> pick your `bench-console` repo -> **Import**
- Leave build settings as default (Vercel reads `vercel.json` automatically) -> **Deploy**

**3. Add your API key(s)**
- In the Vercel project -> **Settings -> Environment Variables**
- Add whichever of these you have: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`
- **Redeploy** (Deployments tab -> ... -> Redeploy) so the function picks them up

You'll get a live URL like `bench-console-yourname.vercel.app` -- open it on your phone, add it to your home screen, done. Every future `git push` auto-redeploys.

No key saved in Vercel? The app will just ask for one in the UI instead, and use it for that session only.

## Run it locally first (optional)

```bash
npm install
cp .env.example .env   # paste in a key
npm start
```
Open `http://localhost:3000`. This uses `server.js` (plain Express) -- handy for testing on your Termux tablet without deploying anywhere.

## Files

```
bench-console/
├── api/
│   ├── chat.js        # serverless function Vercel runs -- provider routing + prompts
│   └── status.js       # tells the frontend which providers have a key configured
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js           # frontend, calls /api/chat and /api/status
├── server.js            # local-only Express server (same logic as api/, for Termux/local testing)
├── vercel.json           # tells Vercel how to build/route this project
├── package.json
├── .env.example
└── .gitignore
```

## Modes

The **Focus** toggle (Code / 3D design / General) changes the system prompt sent to the model -- tuned for runnable code, Three.js/WebGL/shader work, or general help.
