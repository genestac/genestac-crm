const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'components', 'sales', 'user-management-sheet.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// Replace indigo with primary
content = content.replace(/indigo-600/g, 'primary');
content = content.replace(/indigo-700/g, 'primary');
content = content.replace(/indigo-500/g, 'primary');
content = content.replace(/indigo-800/g, 'primary/90');
content = content.replace(/bg-indigo-100/g, 'bg-primary/10');
content = content.replace(/text-indigo-100/g, 'text-primary-foreground');

// Replace standard gray backgrounds to utilize the new variables
// The main button "Save Changes"
content = content.replace(/bg-gray-900 hover:bg-gray-800 text-white/g, 'bg-primary hover:bg-[var(--color-brand-ocean)] text-primary-foreground');

// Update input focus rings
content = content.replace(/focus-visible:ring-indigo-500/g, 'focus-visible:ring-ring focus-visible:border-ring');

fs.writeFileSync(targetFile, content);
console.log('Updated user-management-sheet.tsx styling');
