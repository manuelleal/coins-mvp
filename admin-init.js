/**
 * Admin Layout Initialization
 * Handles role-based UI switching between Super Admin and School Admin layouts.
 * Reads user from localStorage on DOMContentLoaded so the correct layout is
 * applied BEFORE any async auth resolves — eliminates flash of wrong content.
 */

(function() {
    'use strict';

    /**
     * Read user synchronously from localStorage.
     * Falls back to window.currentUser if localStorage is unavailable.
     */
    function getUserFromStorage() {
        try {
            var raw = localStorage.getItem('lingoCoins_user');
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return window.currentUser || null;
    }

    function applyAdminLayout(user) {
        if (!user) return;

        const role = user.rol || '';

        // Remove bg-dashboard fantasy background and overlay
        document.body.classList.remove('bg-dashboard');

        if (role === 'super_admin') {
            document.body.classList.add('admin-layout-super');
            document.body.classList.remove('admin-layout-school');
            document.getElementById('superAdminLayout').style.display = '';
            document.getElementById('schoolAdminLayout').style.display = 'none';
            initSuperAdminLayout(user);
        } else if (role === 'admin') {
            document.body.classList.add('admin-layout-school');
            document.body.classList.remove('admin-layout-super');
            document.getElementById('superAdminLayout').style.display = 'none';
            document.getElementById('schoolAdminLayout').style.display = '';
            initSchoolAdminLayout(user);
        }
    }

    function initializeAdminLayout() {
        // Try localStorage first for immediate render, then window.currentUser as fallback
        const user = getUserFromStorage();
        if (user && user.rol) {
            applyAdminLayout(user);
        } else {
            // Retry once app.js has had time to set window.currentUser
            setTimeout(function() {
                applyAdminLayout(window.currentUser || getUserFromStorage());
            }, 200);
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

    // Run immediately on DOMContentLoaded — reads localStorage synchronously
    // so the correct layout is applied before any images/scripts finish loading.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAdminLayout);
    } else {
        initializeAdminLayout();
    }
})();
