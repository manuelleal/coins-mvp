# Rollback / Recovery Notes (LINGO-COINS)

If anything breaks after recent fixes, you can return to the previous state quickly.

## Current safe point
- Git commit before latest changes: `e5e2634790ec411093bad4782321dd46d6b01be3`

## Recover options

### Option A — Discard uncommitted changes (DESTRUCTIVE)
> This will erase local edits.

```bash
git reset --hard e5e2634790ec411093bad4782321dd46d6b01be3
```

### Option B — Keep edits but park them (SAFE)
```bash
git stash push -u -m "wip: before rollback"
git checkout e5e2634790ec411093bad4782321dd46d6b01be3
```

### Option C — Inspect what changed
```bash
git status -sb
git diff
```

## Files touched in this fix batch
- `index.html` (registration UI: institution selector)
- `app.js` (registration multi-tenant filtering + storing institution_id)
- `student.html` (hide completed challenges from dashboard banner)
- `modules/groups.js` (teacher_groups mapping now checks errors)
- `modules/school_admin_teachers.js` (teacher_groups assignment now checks errors)
