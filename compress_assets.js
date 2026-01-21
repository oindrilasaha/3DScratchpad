
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, 'assets');
const BACKUP_DIR = path.join(__dirname, 'assets_backup');

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.glb')) {
                arrayOfFiles.push(path.join(dirPath, file));
            }
        }
    });
    return arrayOfFiles;
}

const files = getAllFiles(ASSETS_DIR);
console.log(`Found ${files.length} GLB files to compress.`);

files.forEach((file, index) => {
    const relativePath = path.relative(ASSETS_DIR, file);
    const backupPath = path.join(BACKUP_DIR, relativePath);
    const backupFolder = path.dirname(backupPath);

    if (!fs.existsSync(backupFolder)) {
        fs.mkdirSync(backupFolder, { recursive: true });
    }

    // Copy to backup
    fs.copyFileSync(file, backupPath);

    const tempOut = file + '.temp.glb';
    
    console.log(`[${index + 1}/${files.length}] Compressing: ${relativePath} ...`);
    
    try {
        // Run gltf-pipeline with Draco compression
        execSync(`npx gltf-pipeline -i "${file}" -o "${tempOut}" -d`, { stdio: 'inherit' });
        
        // Replace original
        fs.renameSync(tempOut, file);
        
        const originalSize = fs.statSync(backupPath).size / 1024 / 1024;
        const newSize = fs.statSync(file).size / 1024 / 1024;
        console.log(`  -> Done. ${originalSize.toFixed(2)}MB -> ${newSize.toFixed(2)}MB`);
        
    } catch (e) {
        console.error(`  -> Failed to compress ${file}`, e);
        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
        // Restore from backup if needed (though we strictly operated on temp file until rename)
    }
});
