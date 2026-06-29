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

    content = content.replace(/add-lead-dialog/g, "add-user-dialog");
    content = content.replace(/lead-management-sheet/g, "user-management-sheet");
    content = content.replace(/lead-status-updater/g, "user-status-updater");
    
    // Also rename LeadManagementSheet to UserManagementSheet, AddLeadDialog to AddUserDialog, etc.
    content = content.replace(/LeadManagementSheet/g, "UserManagementSheet");
    content = content.replace(/AddLeadDialog/g, "AddUserDialog");
    content = content.replace(/LeadStatusUpdater/g, "UserStatusUpdater");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated imports in:', filePath);
    }
}

['app/sales', 'components/sales'].forEach(dir => {
    walk(path.join(__dirname, dir), processFile);
});
