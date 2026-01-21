import os
import json
import re

ASSETS_DIR = 'assets'
MANIFEST_FILE = 'assets_manifest.json'

manifest = {}

# Regex to match interesting GLB files: obj_mesh_placed_agent{agent}_{index}.glb
# User code was: `assets/${folderIndex}/obj_mesh_placed_agent${agentStr}_${i}.glb`
pattern = re.compile(r'obj_mesh_placed_agent(\d+)_(\d+)\.glb')

if os.path.exists(ASSETS_DIR):
    for folder_name in os.listdir(ASSETS_DIR):
        folder_path = os.path.join(ASSETS_DIR, folder_name)
        if os.path.isdir(folder_path):
            files = []
            if folder_name not in manifest:
                manifest[folder_name] = {}
            
            for fname in os.listdir(folder_path):
                match = pattern.match(fname)
                if match:
                    agent = match.group(1)
                    idx = int(match.group(2))
                    
                    if agent not in manifest[folder_name]:
                        manifest[folder_name][agent] = []
                    
                    manifest[folder_name][agent].append(fname)
            
            # Sort for consistency
            for agent in manifest[folder_name]:
                # Sort by index
                manifest[folder_name][agent].sort(key=lambda x: int(pattern.match(x).group(2)))

with open(MANIFEST_FILE, 'w') as f:
    json.dump(manifest, f, indent=2)

print(f"Generated {MANIFEST_FILE} with {len(manifest)} folders.")
