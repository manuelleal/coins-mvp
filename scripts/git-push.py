import subprocess
import sys

try:
    # Configure git
    subprocess.run(['git', 'config', 'user.email', 'v0@vercel.dev'], cwd='/vercel/share/v0-project', check=True)
    subprocess.run(['git', 'config', 'user.name', 'v0 Admin Redesign'], cwd='/vercel/share/v0-project', check=True)
    
    # Add all changes
    subprocess.run(['git', 'add', '-A'], cwd='/vercel/share/v0-project', check=True)
    
    # Commit changes
    result = subprocess.run(['git', 'commit', '-m', 'feat: admin dashboard redesign with role-based personalities\n\n- Super Admin: Linear.app-style left sidebar layout\n- School Admin: Duolingo for Schools top tabs layout\n- Add comprehensive CSS design system with admin color tokens\n- Remove fantasy game elements and decorative overlays\n- Auto-detect user role and display appropriate interface\n- admin.html: New dual-layout structure\n- styles.css: 600+ lines of role-based styling\n- admin-init.js: Role detection and layout switching'], cwd='/vercel/share/v0-project', check=True)
    
    # Push to remote
    subprocess.run(['git', 'push', 'origin', 'HEAD'], cwd='/vercel/share/v0-project', check=True)
    
    print("[v0] Git push completed successfully!")
    
except subprocess.CalledProcessError as e:
    print(f"[v0] Git error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"[v0] Error: {e}")
    sys.exit(1)
