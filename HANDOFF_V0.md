# HANDOFF V0 — Lingo-Coins Design System

## 1. PROJECT CONTEXT

- **App name:** Lingo-Coins
- **Stack:** Vanilla JS + Bootstrap 5 + Supabase
- **Audience:** Colombian teachers + students aged 13–22

### Existing color variables (from `styles.css`)
Source: @styles.css#6-26

```css
--bg-900: #081020;
--bg-850: #0a1326;
--bg-800: #111d34;
--bg-700: #1a2945;
--gold-500: #fbbf24;
--gold-400: #fcd34d;
--gold-600: #d4a111;
--text-100: #f8fafc;
--text-200: #dbe5f6;
--text-300: #9fb0cf;
--danger: #ef4444;
--success: #10b981;
--shadow-soft: 0 10px 35px rgba(2, 8, 23, 0.38);
--shadow-gold: 0 0 22px rgba(251, 191, 36, 0.28);
--glass: rgba(11, 24, 46, 0.68);
--glass-border: rgba(159, 176, 207, 0.25);
--radius: 12px;
--radius-lg: 18px;
--radius-xl: 22px;
```

### Existing fonts and UI patterns
- **Primary font stack:** `"Segoe UI", Tahoma, Geneva, Verdana, sans-serif` @styles.css#37-44
- **Visual language:** dark glassmorphism + gold highlights (`glass-panel`, `card-premium`, `section-title`) @styles.css#118-133, @styles.css#165-179
- **UI style patterns already used:**
  - Icon-led headers with decorative banners @styles.css#165-179
  - Floating mascots and decorative overlays @styles.css#221-247
  - Gold CTA emphasis (`#navChallenges`, `.btn-primary`) @styles.css#809-818, @styles.css#336-342
  - Dense dashboard cards and tables, heavy use of inline styles in templates (admin/student)

---

## 2. WHAT IS BROKEN (list every known bug)

### A) Console errors / warnings found

#### `admin.html`
- No `console.error` / `console.warn` statements found in this file scan.

#### `student.html`
Found in inline script:
- `console.error('Failed to parse user data:', e);` @student.html#257-263
- `console.warn('Student has no group assigned - skipping geofence');` @student.html#424-427
- `console.warn('Group location not set - geofence disabled for', user.grupo);` @student.html#429-431
- `console.error('Geofence check error:', e);` @student.html#435-437
- `console.error('[DRAKO_HINT]', e);` @student.html#1388-1390
- `console.error('[FLOW_FINALIZE]', e);` @student.html#1725-1728
- `console.warn('[INIT] Profile not found for ID:', user.id);` @student.html#2089-2091
- `console.error('[INIT] Failed to load profile:', e);` @student.html#2092-2094
- `console.error('Failed to load announcements:', e);` @student.html#2143-2145
- `console.error('Failed to check attendance status:', e);` @student.html#2152-2155
- `console.error('Failed to load leaderboard:', e);` @student.html#2178-2180
- `console.error('[INIT] Failed to set up real-time listeners:', e);` @student.html#2219-2221

#### `app.js`
Found in shared logic/helpers:
- `Supabase CDN not loaded. Check script order.` @app.js#56-60
- `Error getting attendance range by group` @app.js#99-103
- `Error computing consecutive session absences` @app.js#153-157
- `Error in optimistic coin update` @app.js#254-258
- `Error loading challenge questions` @app.js#544-548
- `Error auto-closing expired auctions` @app.js#670-674
- Generic structured error logger `console.error('[' + tag + ']', err)` @app.js#694-696
- `Error loading groups` (multiple) @app.js#773-775, @app.js#1049-1053
- `Group rename propagation failed` @app.js#1182-1184
- `Error getting group location` @app.js#1248-1252
- `Error loading filtered students` @app.js#1293-1297
- `Error updating coins` @app.js#1308-1312
- `Error adding coins` @app.js#1329-1333
- `Error checking attendance` @app.js#1539-1543
- `Error getting attendance report` @app.js#1598-1600
- `Error getting attendance by group` @app.js#1628-1630
- `Error getting profile` @app.js#1641-1645
- `Error getting profile by documento` @app.js#1656-1660
- `Error getting leaderboard` @app.js#1698-1700
- `Error fetching auctions` @app.js#1760-1764
- `Error fetching auctions for student` @app.js#1784-1786
- `Error getting auction bids` @app.js#2233-2236
- `Error buying shop item` @app.js#2316-2318
- `Error getting inventory` @app.js#2342-2345
- `Error getting feedback messages` @app.js#2386-2389
- `Error getting billing claims` @app.js#2510-2513
- `Error getting announcements` @app.js#2582-2584
- `Error getting admin announcements` @app.js#2595-2598
- `Error getting challenges` @app.js#2727-2729
- `Error getting submissions` @app.js#2749-2751
- `Error getting attendance history` @app.js#2957-2960
- `console.error('[TEACHER_GROUPS]', e)` @app.js#3237-3239
- Also warning path: `console.warn('[AUDIT_LOG] Insert failed:', ...)` @app.js#3342-3344

#### `styles.css`
- No `console.*` usage (as expected).

### B) Known UI/functional bugs from code scan
- **Role helper naming bug:** `isAdminRole()` returns `teacher`, `admin`, and `super_admin`, which conflates semantics and can cause route guard confusion @app.js#677-680.
- **Student query includes admin/super_admin records:** `loadStudents` query includes `['student','admin','super_admin']`, which is likely incorrect for student-specific list contexts @app.js#1295-1299.
- **Undefined CSS variable usage in student view:** `var(--gold)` is used but not defined in root tokens (root uses `--gold-500`, etc.) @student.html#152 and @styles.css#6-26.
- **Navigation density/duplication risk in admin shell:** two dashboard tabs exist (`navDashboard` and `navAdminDashboard`) and role-switching relies on hide/show rather than separate layouts @admin.html#18-20 and @admin.html#446-463.
- **Admin mobile table overflow by design fallback:** hard min-width table (`640px`) under small breakpoints creates unavoidable horizontal scroll @styles.css#767-769.

### C) Features partially implemented
- **Admin AI Challenge Generator is placeholder-only** (disabled controls + “Coming soon”) @admin.html#115-139.
- **Student dashboard has “coming soon” cards with no interactions** (Exam Prep, Business English, Speaking AI, School Tournaments) @student.html#169-173.
- **Coin ledger is optional migration mode with fallback legacy behavior** (not guaranteed active in all environments) @app.js#162-171.
- **Legacy compatibility paths in data layer** (schema fallback and optional columns) indicate mixed-state implementation rather than stabilized contract @app.js#606-617 and @app.js#646-652.

### D) TODO / placeholder comments found
- `<!-- AI GENERATOR PLACEHOLDER — plug future AI module here -->` @admin.html#115
- `<!-- Hook point: AI generator will inject its UI into #adminAiGeneratorMount -->` @admin.html#123
- `<!-- END AI PLACEHOLDER -->` @admin.html#139
- Geofence status comment indicating disabled behavior in student page inline script @student.html#359-360

---

## 3. WHAT NEEDS IMPROVEMENT (UX/UI)

### Student dashboard (currently overloaded)
Current “Home” mixes too many blocks at once: wallet, level/streak, XP, top-progress, attendance mini-week, badges, active challenge spotlight, status alerts, bulletin, leaderboard, feedback form, and 4 “coming soon” tiles @student.html#90-173.

**Needs:**
- Reduce cognitive load; progressive disclosure.
- Prioritize one primary action per screen state.
- Collapse secondary stats into drill-down panels.

### Teacher builder (accordion cards built, needs polish)
Design tokens exist for accordion-based challenge builder cards and are visually consistent but still feel utility-first rather than product-grade @styles.css#879-979.

**Needs:**
- Better hierarchy (question title, type, score weight, required fields).
- Better empty states and completion guidance.
- Fewer inline controls per row on mobile.

### Navigation (role-based tabs inconsistent)
Admin shell has one HTML with role-dependent tab visibility and two dashboard IDs, which increases mental model complexity and maintenance burden @admin.html#18-34 and @admin.html#446-463.

**Needs:**
- Unified tab IA model by role.
- Distinct visual identity per role context.
- Reduce hidden-but-mounted sections.

### Mobile issues identified
- Admin tables force horizontal scrolling (`min-width: 640px`) @styles.css#767-769.
- Dense nav chips + many tabs can wrap unpredictably on mobile @styles.css#740-751 and @admin.html#16-34.
- Multiple fixed/animated overlays and toasts can stack visually on small screens (`.bid-toast-container`, mascots) @styles.css#845-854 and @styles.css#726-760.

### Generic/unfinished-looking components
- Placeholder AI generator card in admin @admin.html#115-139.
- Student “coming-soon-card” tiles @student.html#169-173.
- Repeated generic loading placeholders (“Loading...”) across many views, reducing perceived quality @admin.html#47-48, @admin.html#141, @student.html#157, @student.html#206.

---

## 4. ROLE CONFUSION (super_admin vs admin)

### What each role sees currently

#### `super_admin` (admin shell)
Visible nav set from role map:
- Dashboard
- Schools
- Users
- Groups
- Economy
- AI Config
- Policies
- Admins

Source: @admin.html#446-463

#### `admin` (school admin)
Visible nav set from role map:
- Dashboard (school dashboard)
- Teachers
- Groups
- Users
- Attendance
- Challenges
- Store
- Cobros
- Announcements
- Feedback

Source: @admin.html#446-463

### Current technical behavior notes
- `InstitutionsModule.init(...)` is only initialized for `super_admin` in `admin.html` boot logic @admin.html#1112-1115.
- Users/Groups modules are loaded for both roles, with school scoping handled in module logic.
- Recently-added role hardening in `modules/institutions.js` blocks global sections for non-super-admin and scopes school selectors to own institution.

### What each role SHOULD see (target model)

#### `super_admin` should see
- Global institutions management
- Global admins management
- Global economy/credit pool
- Global policy and AI model configuration
- Cross-institution analytics

#### `admin` should see
- Only own institution dashboard
- Own teachers, students, groups
- Own attendance/challenges/store/cobros/announcements/feedback
- No global school list, no global policy editor, no global AI config, no cross-school admin management

### Nav tabs and views per role (recommended locked contract)
- **super_admin:** `dashboard`, `institutions`, `users`, `groups`, `economy`, `aiConfig`, `policies`, `admins`
- **admin:** `adminDashboard`, `teachers`, `users`, `groups`, `attendance`, `challenges`, `store`, `cobros`, `announcements`, `feedback`

(These match current role map in @admin.html#459-463 and should be treated as product contract.)

---

## 5. V0 DESIGN BRIEF

Design a full V0 UI refresh for Lingo-Coins while preserving current architecture and data flows.

### Design direction
- **Tone:** gamified, premium, energetic, not childish.
- **Color base:** dark navy + gold (`#D4A017`) + white.
- **Visual references:**
  - TikTok: frictionless tab switching and focus state
  - FIFA rewards: progression and reward reveal moments
  - Spotify Wrapped: rich, celebratory stat presentation

### Core experiences to design

#### A) Student dashboard (TikTok-style, one thing at a time)
- Structure around 3 core sections:
  1. **Practice**
  2. **Progress**
  3. **Store**
- Default screen should surface one immediate CTA (start practice / continue challenge).
- Move secondary widgets (leaderboard, attendance history, badges detail) into subviews or collapsible drawers.

#### B) Teacher dashboard (clean command center)
Must prioritize:
- **Students**
- **Challenges**
- **Attendance**

Should support quick scanning + action workflows (bulk-safe actions, clear state tags, fast filters).

#### C) Challenge player
- Full-screen focus mode.
- One question at a time.
- Strong visual feedback for correctness/progress.
- Large tap targets, zero-distraction layout.

### Deliverable quality expected from V0
- Production-ready component specs (states, spacing, responsive behavior).
- Explicit interaction design for loading, empty, success, and error states.
- Mobile-first variants for all primary flows.

---

## 6. COMPONENTS TO REDESIGN (priority order)

1. **Student dashboard home**
2. **Challenge player (student)**
3. **Challenge builder (teacher)**
4. **Teacher students view**
5. **Login screen**

For each, V0 should provide:
- desktop + mobile layout
- interaction states
- tokenized spacing/typography/color usage
- component boundaries for Vanilla JS rendering

---

## 7. WHAT V0 SHOULD NOT TOUCH

V0 must **not** alter:
- Authentication logic
- Supabase queries
- `CONFIG` object
- Any existing working feature

Interpretation for designers:
- Only redesign structure, visual hierarchy, and interaction patterns.
- Preserve existing data contracts and role/permission behavior.
- If a flow is confusing, redesign UI/UX around it rather than changing backend logic.

---

## Implementation Note for Engineering Handoff

When translating V0 designs into code:
- Keep JS behavior/API calls intact.
- Replace templates/styles incrementally behind existing IDs/classes to avoid regression.
- Validate role-scoped views after each redesign pass (`super_admin`, `admin`, `teacher`, `student`).
