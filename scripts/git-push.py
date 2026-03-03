import subprocess
import sys
import os
import glob

def find_git_root():
    # Walk up from the script location looking for .git
    current = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        if os.path.exists(os.path.join(current, '.git')):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    # Fallback: search known locations
    for candidate in ['/root', '/home/user', '/workspace', '/vercel/share/v0-project', os.path.expanduser('~')]:
        if os.path.isdir(candidate) and os.path.exists(os.path.join(candidate, '.git')):
            return candidate
    return None

try:
    project_dir = find_git_root()
    if not project_dir:
        # Last resort: use wherever admin.html lives
        matches = glob.glob('/*/admin.html') + glob.glob('/home/*/admin.html')
        if matches:
            project_dir = os.path.dirname(matches[0])
    
    if not project_dir:
        raise Exception("Could not locate git repository")

    print(f"[v0] Git root: {project_dir}")
    os.chdir(project_dir)

    subprocess.run(['git', 'config', 'user.email', 'v0@vercel.dev'], check=True)
    subprocess.run(['git', 'config', 'user.name', 'v0 Admin Redesign'], check=True)
    subprocess.run(['git', 'add', '-A'], check=True)
    print("[v0] Staged all changes")

    result = subprocess.run(
        ['git', 'commit', '-m',
         'feat: admin redesign — role-based layouts, no fantasy banners\n\n'
         '- super_admin: fixed left sidebar (Linear.app style)\n'
         '- admin: top tabs (Duolingo for Schools style)\n'
         '- Remove bg-dashboard fantasy background from admin.html\n'
         '- Remove decor-overlay particle image from admin.html\n'
         '- admin-init.js reads localStorage on DOMContentLoaded for instant layout\n'
         '- CSS admin-layout-super/school override background-image to none'],
        capture_output=True, text=True
    )
    print(result.stdout)
    if result.returncode != 0 and 'nothing to commit' in result.stdout + result.stderr:
        print("[v0] Nothing new to commit — already up to date")
    else:
        result.check_returncode()
        subprocess.run(['git', 'push', 'origin', 'HEAD'], check=True)
        print("[v0] Pushed to remote successfully")

except subprocess.CalledProcessError as e:
    print(f"[v0] Git error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"[v0] Error: {e}")
    sys.exit(1)
