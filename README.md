# Lingo-Coins (COINS)

Release baseline: **v1.0-MVP-STABLE**

## Purpose

Lingo-Coins is a gamified English-class platform where students earn coins through classroom actions (attendance + challenges) and spend coins in store/auction flows managed by teachers/admins.

## Tech stack

- Frontend: HTML, CSS, Vanilla JavaScript
- UI: Bootstrap 5 + Bootstrap Icons
- Backend: Supabase (PostgreSQL + realtime)
- Deployment target: Static hosting (Netlify recommended)

## Project structure

```txt
COINS/
├── index.html
├── student.html
├── admin.html
├── attendance.html
├── app.js
├── styles.css
├── assets/
│   └── images/
│       ├── fondo-dashboard.webp
│       ├── fondo-challenges.webp
│       ├── fondo-store.webp
│       ├── fondo-subastas.webp
│       └── ... (characters/icons/decor)
├── README.md
├── CONTEXT_PROJECT.md
└── MIGRATION_*.sql
```

## Roles

- `student`: dashboard, attendance, challenges, store/auctions, bag
- `teacher`: operational admin access
- `admin`: operational admin access
- `super_admin`: admin management and elevated controls

## Core MVP flows

1. Register/login student
2. Manage groups/users (admin)
3. Attendance check-in (QR + manual code + geofence checks)
4. Complete challenges and earn coins (reward tiers + retry)
5. Spend coins in store and auctions
6. Announcements and admin operations

## Run locally

From project root:

```powershell
python -m http.server 5500
```

Open:

- `http://127.0.0.1:5500/index.html`
- `http://127.0.0.1:5500/student.html`
- `http://127.0.0.1:5500/admin.html`
- `http://127.0.0.1:5500/attendance.html`

## Deploy (Netlify)

1. Verify root files and `assets/images` are present.
2. Zip project contents (or drag folder contents).
3. Netlify → **Add new site** → **Deploy manually**.
4. Upload and validate pages + Supabase connectivity.

## Known MVP limitations

- Supabase anon credentials are currently configured in frontend (`app.js`).
- Security model is MVP-level for classroom deployment.
- Advanced observability and CI/CD automation are limited.
