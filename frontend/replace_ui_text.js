const fs = require('fs');
const path = require('path');

function replaceTextInFile(filePath, searchRegex, replacement) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    content = content.replace(searchRegex, replacement);
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated text in:', filePath);
    }
}

// Update AddLeadDialog text
replaceTextInFile(
    path.join(__dirname, 'components/sales/add-lead-dialog.tsx'),
    /Add New Lead/g,
    'Add New User'
);
replaceTextInFile(
    path.join(__dirname, 'components/sales/add-lead-dialog.tsx'),
    /Create Lead/g,
    'Create User'
);
replaceTextInFile(
    path.join(__dirname, 'components/sales/add-lead-dialog.tsx'),
    /Save Lead/g,
    'Save User'
);
replaceTextInFile(
    path.join(__dirname, 'components/sales/add-lead-dialog.tsx'),
    /Manually enter a new lead/g,
    'Manually enter a new user'
);
replaceTextInFile(
    path.join(__dirname, 'components/sales/add-lead-dialog.tsx'),
    /Lead Source/g,
    'User Source'
);

// Update LeadManagementSheet text
replaceTextInFile(
    path.join(__dirname, 'components/sales/lead-management-sheet.tsx'),
    /Manage Lead/g,
    'Manage User'
);
replaceTextInFile(
    path.join(__dirname, 'components/sales/lead-management-sheet.tsx'),
    /Lead Status/g,
    'User Status'
);
replaceTextInFile(
    path.join(__dirname, 'components/sales/lead-management-sheet.tsx'),
    /Open Lead/g,
    'Open User'
);

// Update Sales Dashboard text
replaceTextInFile(
    path.join(__dirname, 'app/sales/page.tsx'),
    /Untouched Leads/g,
    'Untouched Users'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/page.tsx'),
    /New leads requiring/g,
    'New users requiring'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/page.tsx'),
    /Leads actively/g,
    'Users actively'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/page.tsx'),
    /Total leads converted/g,
    'Total users converted'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/page.tsx'),
    /Open Lead/g,
    'Open User'
);

// Update My Leads Page text
replaceTextInFile(
    path.join(__dirname, 'app/sales/leads/page.tsx'),
    /My Leads/g,
    'My Users'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/leads/page.tsx'),
    /New leads that require/g,
    'New users that require'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/leads/page.tsx'),
    /early-stage leads/g,
    'early-stage users'
);

// Update Contacted Page text
replaceTextInFile(
    path.join(__dirname, 'app/sales/contacted/page.tsx'),
    /Contacted Leads/g,
    'Contacted Users'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/contacted/page.tsx'),
    /contacted leads/g,
    'contacted users'
);
replaceTextInFile(
    path.join(__dirname, 'app/sales/contacted/page.tsx'),
    /Leads you have successfully/g,
    'Users you have successfully'
);
