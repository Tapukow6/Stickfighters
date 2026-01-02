Deploying the game to Vercel
===========================

This project serves a static HTML5 Canvas game from the `game/` folder. Below are two straightforward ways to deploy it to Vercel.

Option A — Connect the Git repo in the Vercel dashboard
1. Push your repository to GitHub (or GitLab/Bitbucket).
2. Go to https://vercel.com and sign in.
3. Click "New Project" → Import Git Repository → select your repo.
4. In the Setup options, Vercel should detect the `vercel.json` in the repo. If not, set the "Framework Preset" to "Other" and leave build settings blank.
5. Deploy. The site will be served with the `game/index.html` as root (see `vercel.json`).

Option B — Deploy with the Vercel CLI (fast)
1. Install the Vercel CLI if you don't have it:

```bash
npm i -g vercel
```

2. From the repo root run:

```bash
vercel login
vercel
# follow interactive prompts; choose project name and organization
# when prompted for which directory to deploy, accept the default (root)
```

3. To deploy production (non-interactive):

```bash
vercel --prod
```

Notes and tips
--------------
- The included `vercel.json` maps the root of the deployed site to `game/index.html` and serves all static assets from the `game/` folder.
- If you want to serve the site at a subpath, adjust the `routes` config in `vercel.json`.
- If you make dynamic server-side changes later, you can add API endpoints under an `api/` folder and adjust `vercel.json` accordingly.
- If your game depends on any build step (e.g., bundling), add a `package.json` with a `build` script and update `vercel.json` to run the build and publish the output directory.

Troubleshooting
---------------
- If the site shows a blank page, open DevTools and check the Console for JS errors and the Network tab for 404s. Ensure assets are referenced relative to the site root (they are in `game/` currently and `vercel.json` routes them there).
- If deploying from the CLI and you get an unexpected directory served, specify the project’s root when prompted or pass `--cwd ./` to the command.

If you want, I can:
- Create a small `package.json` and a build flow if you plan to add bundling.
- Add a `.vercelignore` to exclude dev files.
- Walk you through pushing to GitHub and running the `vercel` CLI interactively.
