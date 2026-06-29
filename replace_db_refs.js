const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walk(dirPath, callback);
        } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
            callback(dirPath);
        }
    });
}

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/\.from\('profiles'\)/g, ".from('staffs')");
    content = content.replace(/\.from\('leads'\)/g, ".from('users')");
    content = content.replace(/\.from\('lead_documents'\)/g, ".from('user_documents')");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated:', filePath);
    }
}

['app', 'components', 'utils'].forEach(dir => {
    walk(path.join(__dirname, dir), processFile);
});
