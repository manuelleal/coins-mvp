# CONTEXT_PROJECT

## System goals
Lingo-Coins is a classroom gamification system for English practice where students earn coins with learning/attendance and spend coins in rewards flows.

Primary modules:
- Coins economy
- Challenges
- Store and auctions
- Attendance (QR/manual)
- Announcements

## Current baseline
- Release: **v1.0-MVP-STABLE**
- Focus: production stability, clean UX, and safe static deploy readiness

## Roles
- `student`: earns/spends coins through classroom gameplay
- `admin` / `teacher`: manages groups, attendance, challenges, auctions/store, announcements
- `super_admin`: elevated admin management and protected operations

## Main product flow
1. Student earns coins (attendance + challenge performance)
2. Student spends coins (store purchases + auction bids)
3. Admin oversees lifecycle (content creation, attendance sessions, close auctions, announcements)

## Tech stack
- Frontend: HTML + CSS + Vanilla JS
- UI: Bootstrap 5 + Bootstrap Icons
- Backend: Supabase (PostgreSQL + realtime)

## Visual identity
- Premium dark + gold theme
- Local fantasy mascots and game-like icons
- Controlled decorative elements
- Mobile-first responsive behavior

## Scope guardrails
- Keep business logic and schema stable in visual phases
- Prefer safe, incremental UI refactors
- Preserve existing functional flows
