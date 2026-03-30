# Create a new GitHub repository for URL_Check

This project can live as a **standalone** Git repository (separate from the AroundMe monorepo).

## Choose how you move the code

### Option A — Clean copy (simplest)

Avoid nested Git folders inside the monorepo:

```bash
# macOS / Linux
cp -R /path/to/Aroundme/URL_Check ~/url-check
cd ~/url-check
git init -b main
git add .
git commit -m "Initial commit: URL Check monitoring platform"
```

Then add the GitHub remote and push (step 2 below).

### Option B — Keep Git history from the monorepo (advanced)

From the **monorepo root** (where `URL_Check/` is tracked):

```bash
cd /path/to/Aroundme
git subtree split --prefix=URL_Check -b url-check-export
mkdir -p ../url-check-repo && cd ../url-check-repo
git init -b main
git pull ../Aroundme url-check-export
```

Then add `origin` pointing at your new GitHub repo and `git push -u origin main`.

### Option C — `git init` inside the monorepo folder (not recommended)

Running `git init` directly inside `Aroundme/URL_Check` creates a **nested** repository; the parent repo will not track inner files the same way. Prefer **Option A** or **B**.

---

## 1. Create the empty repo on GitHub

1. Open [github.com/new](https://github.com/new).
2. **Repository name:** e.g. `url-check` (URLs are easier in lowercase).
3. **Public** or **Private**.
4. **Do not** initialize with README, `.gitignore`, or license (this project already includes them).
5. **Create repository** and copy the remote URL, e.g. `https://github.com/YOUR_USERNAME/url-check.git`.

## 2. Push your first commit

```bash
cd ~/url-check   # or your standalone folder from Option A/B

git remote add origin https://github.com/YOUR_USERNAME/url-check.git
git push -u origin main
```

SSH:

```bash
git remote add origin git@github.com:YOUR_USERNAME/url-check.git
git push -u origin main
```

## 3. GitHub CLI (optional)

With [`gh`](https://cli.github.com/) and `gh auth login`:

```bash
cd ~/url-check
gh repo create url-check --private --source=. --remote=origin --push
```

Change `--public` / `--private` and the name as needed.

## 4. After publishing

- Set the GitHub **About** description (e.g. *Config-driven URL / service health monitoring*).
- Optional: add **Topics** — `monitoring`, `fastapi`, `react`, `vite`, `docker`.

## 5. Clone elsewhere

```bash
git clone https://github.com/YOUR_USERNAME/url-check.git
cd url-check
docker compose up -d --build
```

- **UI:** http://localhost:5173  
- **API:** http://localhost:8000  

See the root [README.md](../README.md) for local dev without Docker.
