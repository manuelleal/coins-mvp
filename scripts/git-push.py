import subprocess
import sys
import os
import glob

def find_git_root():
    # Search known locations — no __file__ in this execution environment
    candidates = [
        '/vercel/share/v0-project',
        '/root',
        '/home/user',
        '/workspace',
        os.path.expanduser('~'),
    ]
    for candidate in candidates:
        if os.path.isdir(candidate) and os.path.exists(os.path.join(candidate, 'admin.html')):
            return candidate
    # Wider glob search
    for hit in glob.glob('/*/admin.html') + glob.glob('/home/*/admin.html'):
        return os.path.dirname(hit)
    return None

try:
    project_dir = find_git_root()
    if not project_dir:
        raise Exception("Could not locate project directory")

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
