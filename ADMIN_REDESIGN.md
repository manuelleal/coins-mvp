# Admin UI Redesign — Role-Based Visual Personalities

## Overview

The admin dashboard has been completely redesigned with two distinct visual personalities based on user role:

1. **SUPER ADMIN** - Professional CEO command center (Linear.app + Google Analytics style)
2. **SCHOOL ADMIN** - Friendly school principal interface (Duolingo + Notion style)

## Files Modified

### 1. `styles.css`
Added comprehensive design tokens and role-based CSS:
- New CSS variables in `:root` for the admin design system
- `body.admin-layout-super` - All super admin styles (sidebar nav, fixed top bar, professional layout)
- `body.admin-layout-school` - All school admin styles (header + tabs, warm accent, friendly feel)
- Shared component styles (buttons, forms, tables, badges, empty states, loading skeletons)

**Key Design Tokens:**
```css
--admin-bg: #0D1117;
--admin-surface: #161B22;
--admin-surface-2: #21262D;
--admin-gold: #F0B429;
--admin-text: #E6EDF3;
--admin-text-muted: #7D8590;
```

### 2. `admin.html`
Completely restructured with dual layouts:
- `#superAdminLayout` - Hidden by default, shown for super_admin role
- `#schoolAdminLayout` - Hidden by default, shown for admin role

**Super Admin Structure:**
- Fixed left sidebar (220px) with icon + label navigation
- Top bar with breadcrumb and user info
- Main content area with dashboard, institutions, users, groups, economy, AI config, policies, admins

**School Admin Structure:**
- Fixed header with school avatar, school name, and user name
- Tab-based navigation below header (Dashboard, Teachers, Groups, Users, Attendance, Challenges, Store, Cobros, Announcements, Feedback)
- Main content area

Both layouts:
- NO decorative banners or fantasy images
- NO emoji in navigation
- NO glassmorphism effects
- Clean, professional typography
- Gold accents for primary actions
- Consistent spacing and alignment

### 3. `admin-init.js` (NEW)
Initialization script that:
- Detects user role on page load
- Shows correct layout based on role
- Applies `admin-layout-super` or `admin-layout-school` class to body
- Wires up navigation/tab click handlers
- Maintains active state indicators
- Overrides `showAdminView()` to work with both layouts
- Preserves all existing JavaScript logic from app.js

## Visual Comparison

### SUPER ADMIN (Linear.app style)
```
┌─────────────────────────────────────────────────────┐
│ Global        │ Dashboard | Schools | Users | ...  │
│ Sidebar       │ ↑ Breadcrumb            [User] [Out]│
│               ├──────────────────────────────────────┤
│ ✓ Dashboard   │                                      │
│ ✓ Schools     │ Super Admin Dashboard                │
│ ✓ Users       │                                      │
│ ✓ Groups      │ ┌──────────┬──────────┬──────────┐  │
│ ✓ Economy     │ │ Instit   │  Students│ Teachers │  │
│ ✓ AI Config   │ │ 24       │ 1,240    │ 48       │  │
│ ✓ Policies    │ └──────────┴──────────┴──────────┘  │
│ ✓ Admins      │                                      │
└─────────────────────────────────────────────────────┘
```

- **Color scheme:** Dark navy (#0D1117), light text, gold accents (#F0B429)
- **Navigation:** Sidebar with hover effects and active state with gold left border
- **Cards:** Minimal borders, smooth hover animations, gold hover effects
- **Tables:** Clean, uppercase headers, minimal row borders
- **Overall feel:** Serious, professional, data-driven

### SCHOOL ADMIN (Duolingo + Notion style)
```
┌─────────────────────────────────────────────────────┐
│ [🎓] School Name      Dashboard | Teachers | ...   │
│ School Admin           [User] [Out]                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│ School Dashboard                                    │
│                                                      │
│ ┌──────────────┬──────────────┬──────────────┐      │
│ │ Teachers     │ Students     │ Active       │      │
│ │ 24           │ 480          │ Challenges   │      │
│ └──────────────┴──────────────┴──────────────┘      │
│                                                      │
│ Recent Activity                                     │
└─────────────────────────────────────────────────────┘
```

- **Color scheme:** Same dark navy, but with gold left borders on cards
- **Navigation:** Horizontal tabs with underline active indicator
- **Header:** School avatar circle with gold border, school name prominent
- **Cards:** Left-border accent (gold), warm hover effects
- **Overall feel:** Friendly, approachable, organized

## CSS Architecture

### Class Naming Convention
All admin classes use `admin-` prefix and follow this pattern:
- Layout: `.admin-wrapper`, `.admin-sidebar`, `.admin-header`, `.admin-content`
- Navigation: `.admin-nav-item`, `.admin-tabs`, `.admin-tab-item`
- Components: `.admin-card`, `.admin-btn-primary`, `.admin-form-input`
- Status: `.admin-status-active`, `.admin-badge-success`
- States: `.admin-loading-skeleton`, `.admin-empty-state`

### Responsive Design
- Mobile breakpoint: `@media (max-width: 768px)`
- Super admin sidebar converts to horizontal tab-like layout
- School admin tabs remain horizontally scrollable
- All form inputs and buttons scale appropriately

## Implementation Details

### Role Detection
The `admin-init.js` script reads `window.currentUser.rol`:
- `'super_admin'` → Shows super admin layout with sidebar
- `'admin'` → Shows school admin layout with header + tabs

### View Switching
- Original `showAdminView()` from app.js is wrapped
- New implementation:
  1. Hides all `.admin-view` elements
  2. Shows requested view
  3. Updates navigation/tab active state
  4. Calls original handler for data loading

### Preserved Functionality
- All Supabase queries from app.js work unchanged
- All button click handlers remain functional
- All data loading and rendering logic is untouched
- Role-based view filtering is preserved

## Design Token Usage

### Colors
```css
body.admin-layout-super {
    --admin-bg: #0D1117;           /* Page background */
    --admin-surface: #161B22;      /* Cards, panels */
    --admin-surface-2: #21262D;    /* Table headers */
    --admin-gold: #F0B429;         /* Primary action */
    --admin-text: #E6EDF3;         /* Primary text */
    --admin-text-muted: #7D8590;   /* Secondary text */
}
```

### Components
```html
<!-- Button -->
<button class="admin-btn-primary">Action</button>

<!-- Form Input -->
<input type="text" class="admin-form-input">

<!-- Status Badge -->
<span class="admin-status-badge admin-status-active">Active</span>

<!-- Empty State -->
<div class="admin-empty-state">
    <div class="admin-empty-state-icon"><i class="bi bi-search"></i></div>
    <div class="admin-empty-state-title">No data</div>
</div>

<!-- Loading Skeleton -->
<div class="admin-loading-skeleton"></div>
```

## Migration Notes

### What Was Kept
✅ All JavaScript logic from app.js  
✅ All Supabase queries  
✅ All data loading handlers  
✅ Role-based filtering  
✅ User authentication flow  
✅ CONFIG object  
✅ All existing modules and utilities  

### What Changed
- HTML structure (sidebar vs header+tabs based on role)
- CSS styling (new admin design system)
- Visual layout (fixed sidebar vs fixed header)
- Navigation structure (vertical sidebar vs horizontal tabs)
- No changes to JavaScript business logic

### Data Attributes Preserved
All IDs remain unchanged:
- `#viewDashboard`, `#viewInstitutions`, `#viewUsers`, etc.
- `#btnCreateSchool`, `#btnLoadUsersBySchool`, etc.
- `#adminName`, `#adminDashboardCards`, etc.

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Mobile responsive down to 320px width.

## Future Enhancements
1. Dark/light mode toggle (prepared with CSS variables)
2. Custom school branding (logo in admin header)
3. Collapsible sidebar for super admin on larger screens
4. Analytics dashboard for super admin
5. More granular role permissions UI
