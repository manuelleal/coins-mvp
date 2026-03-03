import subprocess
import json
import os

def find_project_root():
    """Find project root by looking for admin.html"""
    candidates = [
        '/vercel/share/v0-project',
        '/root',
        os.path.expanduser('~'),
    ]
    for cand in candidates:
        if os.path.isdir(cand) and os.path.exists(os.path.join(cand, 'admin.html')):
            return cand
    return None

def merge_to_main():
    try:
        project_dir = find_project_root()
        if not project_dir:
            raise Exception("Could not find project root")
        
        os.chdir(project_dir)
        print(f"[v0] Project root: {project_dir}")
        
        # Configure git
        subprocess.run(['git', 'config', 'user.email', 'v0@vercel.dev'], check=True)
        subprocess.run(['git', 'config', 'user.name', 'v0 Merge'], check=True)
        
        # Fetch latest from remote
        subprocess.run(['git', 'fetch', 'origin'], check=True)
        print("[v0] Fetched latest from remote")
        
        # Checkout main branch
        subprocess.run(['git', 'checkout', 'main'], check=True)
        print("[v0] Switched to main branch")
        
        # Merge the feature branch
        result = subprocess.run(
            ['git', 'merge', 'origin/v0/ddiddimmo-4985-db65374e', '--no-ff', '-m', 
             'Merge admin redesign: role-based layouts (Super Admin + School Admin)\n\n' +
             '- Super Admin: Left sidebar (Linear.app style)\n' +
             '- School Admin: Top tabs (Duolingo style)\n' +
             '- Removed fantasy backgrounds and decorative overlays\n' +
             '- Supabase integration fully compatible\n' +
             '- Data loads with real user credentials'],
            check=True
        )
        print("[v0] Merged feature branch into main")
        
        # Push to remote
        subprocess.run(['git', 'push', 'origin', 'main'], check=True)
        print("[v0] Pushed main to remote")
        
        # Get current commit hash for reference
        current_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        
        # Save merge info
        merge_info = {
            'status': 'SUCCESS',
            'branch': 'v0/ddiddimmo-4985-db65374e',
            'target': 'main',
            'commit_hash': current_commit,
            'timestamp': subprocess.check_output(['date'], text=True).strip(),
            'revert_command': f'git revert {current_commit} --no-edit'
        }
        
        with open('.merge_info.json', 'w') as f:
            json.dump(merge_info, f, indent=2)
        
        print("\n[v0] ✅ Merge complete!")
        print(f"[v0] Commit hash: {current_commit}")
        print(f"[v0] GitHub Pages will update shortly with the new admin design")
        
    except subprocess.CalledProcessError as e:
        print(f"[v0] Git error: {e}")
        return False
    except Exception as e:
        print(f"[v0] Error: {e}")
        return False
    
    return True

if __name__ == '__main__':
    success = merge_to_main()
    exit(0 if success else 1)
