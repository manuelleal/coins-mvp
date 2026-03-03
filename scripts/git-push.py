import subprocess
import sys
import os

try:
    project_dir = "/vercel/share/v0-project"
    
    # Change to project directory
    os.chdir(project_dir)
    print(f"[v0] Changed to: {os.getcwd()}")
    
    # Configure git
    subprocess.run(['git', 'config', 'user.email', 'v0@vercel.dev'], check=True)
    subprocess.run(['git', 'config', 'user.name', 'v0 Admin Redesign'], check=True)
    
    # Add all changes
    subprocess.run(['git', 'add', '-A'], check=True)
    print("[v0] Files added to git")
    
    # Commit changes
    subprocess.run(['git', 'commit', '-m', 'feat: admin dashboard redesign with role-based personalities\n\n- Super Admin: Linear.app-style left sidebar layout\n- School Admin: Duolingo for Schools top tabs layout\n- Add comprehensive CSS design system with admin color tokens\n- Remove fantasy game elements and decorative overlays\n- Auto-detect user role and display appropriate interface'], check=True)
    print("[v0] Changes committed")
    
    # Push to remote
    subprocess.run(['git', 'push', 'origin', 'HEAD'], check=True)
    print("[v0] Git push completed successfully!")
    
except subprocess.CalledProcessError as e:
    print(f"[v0] Git command error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"[v0] Error: {e}")
    sys.exit(1)
