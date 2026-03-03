import os
import subprocess

print(f"[v0] Current working directory: {os.getcwd()}")
print(f"[v0] Directory exists: {os.path.exists('/vercel/share/v0-project')}")
print(f"[v0] Listing /vercel/share: {os.listdir('/vercel/share') if os.path.exists('/vercel/share') else 'N/A'}")
print(f"[v0] Listing current dir: {os.listdir('.')}")
