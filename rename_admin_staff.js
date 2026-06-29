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

    content = content.replace(/add-user-dialog/g, "add-staff-dialog");
    content = content.replace(/AddUserDialog/g, "AddStaffDialog");
    content = content.replace(/User Management/g, "Staff Management");
    content = content.replace(/Add New User/g, "Add New Staff");
    content = content.replace(/Manage your internal users/g, "Manage your internal staff");
    
    // Careful with generic replacements
    content = content.replace(/users/g, "staffs");
    content = content.replace(/Users/g, "Staffs");

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated texts in:', filePath);
    }
}

walk(path.join(__dirname, 'app/admin/staffs'), processFile);
