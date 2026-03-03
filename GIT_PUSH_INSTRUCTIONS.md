# Git Push Instructions — Admin Dashboard Redesign

## Push to GitHub (v0 UI Method)

This is the recommended method since scripts cannot access the git repo in the execution environment.

### Steps:

1. **Open v0 Sidebar** — Click the left panel in v0 (three horizontal lines at top-left)
2. **GitHub Integration** — Click the GitHub icon (Octocat) in the sidebar
3. **View Changes** — You'll see all modified files:
   - `admin.html` (removed fantasy background + decor-overlay)
   - `admin-init.js` (reads localStorage on DOMContentLoaded)
   - `styles.css` (admin layouts override background-image)
   - `.revert_info.json` (commit metadata for revert)
4. **Push to Branch** — Click "Push" or "Create Pull Request"
   - Branch: `v0/ddiddimmo-4985-db65374e`
   - Org: `manuelleal`
   - Repo: `coins-mvp`

---

## Revert if Needed

If you need to revert this commit after push:

### Option 1: Revert the commit (creates new commit)
```bash
git revert <commit-hash> --no-edit
git push origin HEAD
```

### Option 2: Hard reset (if push hasn't synced yet)
```bash
git reset --hard HEAD~1
git push origin HEAD --force-with-lease
```

### Option 3: Via GitHub Web Interface
1. Go to `https://github.com/manuelleal/coins-mvp/pulls`
2. Find the PR or commit
3. Click "Revert" button (GitHub provides this for merged commits)

---

## Commit Information

**Commit Hash**: Will be shown after push (use `git log --oneline -1`)  
**Branch**: `v0/ddiddimmo-4985-db65374e`  
**Message**: `feat: admin dashboard redesign with role-based personalities`

See `.revert_info.json` for full commit details.
