#!/bin/bash

cd /vercel/share/v0-project

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "Redesign admin dashboard with role-based personalities

- Super Admin: Linear.app style left sidebar layout
- School Admin: Duolingo for Schools top tabs layout
- Add comprehensive CSS design system with admin variables
- Remove fantasy game elements and banners
- Add admin-init.js for role detection and layout switching
- Maintain backward compatibility with existing JavaScript"

# Push to current branch
git push origin HEAD
