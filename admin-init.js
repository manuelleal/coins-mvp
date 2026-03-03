/**
 * Admin Layout Initialization
 * Handles role-based UI switching between Super Admin and School Admin layouts
 * Preserves all existing app.js functionality
 */

(function() {
    'use strict';

    // Wait for Supabase and auth to be ready
    function initializeAdminLayout() {
        const user = window.currentUser || null;
        
        if (!user) {
            console.error('[ADMIN_INIT] No user logged in');
            return;
        }

        const role = user.rol || 'student';
        const layoutClass = role === 'super_admin' 
            ? 'admin-layout-super' 
            : 'admin-layout-school';

        // Set body class for role-based styling
        document.body.classList.add(layoutClass);

        // Show correct layout
        if (role === 'super_admin') {
            document.getElementById('superAdminLayout').style.display = '';
            document.getElementById('schoolAdminLayout').style.display = 'none';
            initSuperAdminLayout(user);
        } else if (role === 'admin') {
            document.getElementById('superAdminLayout').style.display = 'none';
            document.getElementById('schoolAdminLayout').style.display = '';
            initSchoolAdminLayout(user);
        }
    }

    function initSuperAdminLayout(user) {
        // Update header with user info
        document.getElementById('adminNameTop').textContent = user.nombre || 'Super Admin';
        
        // Update breadcrumb
        const dashboardLink = document.getElementById('navDashboard');
        if (dashboardLink) {
            dashboardLink.addEventListener('click', () => {
                document.getElementById('adminBreadcrumb').textContent = 'Dashboard';
            });
        }

        // Wire up nav items to update breadcrumb
        const navItems = {
            'navDashboard': 'Dashboard',
            'navInstitutions': 'Institutions',
            'navUsers': 'Global Users',
            'navGroups': 'Global Groups',
            'navEconomy': 'Economy',
            'navAiConfig': 'AI Configuration',
            'navPolicies': 'Policies',
            'navAdmins': 'Admin Management',
            'navAnalytics': 'Analytics'
        };

        Object.entries(navItems).forEach(([id, label]) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', () => {
                    // Update active state
                    document.querySelectorAll('.admin-nav-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    element.classList.add('active');
                    
                    // Update breadcrumb
                    document.getElementById('adminBreadcrumb').textContent = label;
                });
            }
        });

        // Logout handler
        const logoutBtn = document.getElementById('btnLogout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.handleLogout) {
                    window.handleLogout();
                }
            });
        }
    }

    function initSchoolAdminLayout(user) {
        // Update header with user and school info
        document.getElementById('adminNameTop2').textContent = user.nombre || 'Admin';
        
        // Set school name and avatar
        const schoolName = window.currentSchool?.nombre || user.nombre || 'School';
        document.getElementById('schoolNameDisplay').textContent = schoolName;
        
        // Set avatar to first letter
        const firstLetter = schoolName.charAt(0).toUpperCase();
        document.getElementById('schoolAvatarDisplay').textContent = firstLetter;

        // Wire up tab clicks to update active state
        const tabs = document.querySelectorAll('.admin-tab-item');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Remove active from all tabs
                tabs.forEach(t => t.classList.remove('active'));
                // Add active to clicked tab
                e.target.classList.add('active');
            });
        });

        // Logout handler
        const logoutBtn = document.getElementById('btnLogout2');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.handleLogout) {
                    window.handleLogout();
                }
            });
        }
    }

    /**
     * Override showAdminView to handle the new layout structure
     * Preserve existing behavior from app.js
     */
    const originalShowAdminView = window.showAdminView;
    window.showAdminView = function(viewName) {
        // Hide all views first
        document.querySelectorAll('.admin-view').forEach(view => {
            view.classList.remove('active');
        });

        // Show the requested view
        const viewElement = document.getElementById('view' + viewName.charAt(0).toUpperCase() + viewName.slice(1));
        if (viewElement) {
            viewElement.classList.add('active');
        }

        // Update tab/nav active state based on role
        const role = window.currentUser?.rol || 'student';
        if (role === 'super_admin') {
            updateSuperAdminNav(viewName);
        } else if (role === 'admin') {
            updateSchoolAdminTabs(viewName);
        }

        // Call original handler if it exists and we need to load data
        if (originalShowAdminView && typeof originalShowAdminView === 'function') {
            try {
                originalShowAdminView(viewName);
            } catch (e) {
                console.log('[ADMIN_INIT] Original showAdminView not available or errored');
            }
        }

        return false;
    };

    function updateSuperAdminNav(viewName) {
        const navMap = {
            'dashboard': 'navDashboard',
            'institutions': 'navInstitutions',
            'users': 'navUsers',
            'groups': 'navGroups',
            'economy': 'navEconomy',
            'aiConfig': 'navAiConfig',
            'policies': 'navPolicies',
            'admins': 'navAdmins',
            'analytics': 'navAnalytics'
        };

        const navId = navMap[viewName];
        if (navId) {
            document.querySelectorAll('.admin-nav-item').forEach(item => {
                item.classList.remove('active');
            });
            const navElement = document.getElementById(navId);
            if (navElement) {
                navElement.classList.add('active');
            }
        }
    }

    function updateSchoolAdminTabs(viewName) {
        const tabMap = {
            'adminDashboard': 'tabAdminDashboard',
            'teachers': 'tabTeachers',
            'groups': 'tabGroups',
            'users': 'tabUsers',
            'attendance': 'tabAttendance',
            'challenges': 'tabChallenges',
            'store': 'tabStore',
            'cobros': 'tabCobros',
            'announcements': 'tabAnnouncements',
            'feedback': 'tabFeedback'
        };

        const tabId = tabMap[viewName];
        if (tabId) {
            document.querySelectorAll('.admin-tab-item').forEach(item => {
                item.classList.remove('active');
            });
            const tabElement = document.getElementById(tabId);
            if (tabElement) {
                tabElement.classList.add('active');
            }
        }
    }

    // Initialize when document is ready and user is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAdminLayout);
    } else {
        // DOM already loaded, but wait a tick for window.currentUser to be set
        setTimeout(initializeAdminLayout, 100);
    }

    // Also listen for auth changes if using Supabase
    if (window.supabase) {
        window.supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user && window.currentUser) {
                // Reinitialize layout if user info changes
                setTimeout(initializeAdminLayout, 50);
            }
        });
    }
})();
