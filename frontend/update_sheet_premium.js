const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'components', 'sales', 'user-management-sheet.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// Sheet Header Polish
content = content.replace(
  /className="px-8 pt-8 pb-6 bg-gray-50 border-b"/g,
  'className="px-8 pt-10 pb-8 bg-card border-b relative overflow-hidden"'
);
// Add a subtle gradient orb behind the header
content = content.replace(
  /<div className="flex items-center justify-between mb-4">/g,
  `<div className="absolute top-[-50%] right-[-10%] w-64 h-64 bg-gradient-to-br from-[var(--color-brand-green)] to-[var(--color-brand-ocean)] rounded-full blur-[80px] opacity-20 pointer-events-none"></div>
          <div className="flex items-center justify-between mb-4 relative z-10">`
);

// Status Badge Polish
content = content.replace(
  /className="px-2 py-1 text-\[10px\] font-bold uppercase tracking-wider bg-primary\/10 text-primary-foreground rounded"/g,
  'className="px-3 py-1 text-[11px] font-bold uppercase tracking-widest bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] text-white rounded-full shadow-sm"'
);

// Sheet Title Polish
content = content.replace(
  /className="text-3xl font-light text-gray-900 tracking-tight"/g,
  'className="text-4xl font-extrabold text-foreground tracking-tight relative z-10"'
);

// Tabs Polish
content = content.replace(
  /<div className="flex border-b px-8 bg-gray-50">/g,
  '<div className="flex border-b px-8 bg-muted/30 pt-2 gap-2">'
);
content = content.replace(
  /className=\{`px-4 py-3 text-sm font-medium border-b-2 transition-colors \$\{/g,
  'className={`px-5 py-2.5 text-sm font-semibold rounded-t-xl transition-all duration-300 ${'
);
content = content.replace(
  /activeTab === tab.id \n                  \? 'border-indigo-600 text-indigo-600' \n                  : 'border-transparent text-gray-500 hover:text-gray-900'/g,
  `activeTab === tab.id 
                  ? 'bg-card text-primary shadow-[0_-4px_10px_-5px_rgba(0,0,0,0.1)] border-t border-l border-r border-border/50' 
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'`
);

// Input Polish
content = content.replace(
  /bg-gray-50\/50/g,
  'bg-muted/50 rounded-xl border-border/50 transition-all hover:bg-muted focus:bg-card shadow-inner'
);

// Add animated save button
content = content.replace(
  /className="bg-primary hover:bg-\[var\(--color-brand-ocean\)\] text-primary-foreground shadow-none px-6 rounded-full"/g,
  'className="bg-gradient-to-r from-[var(--color-brand-teal)] to-[var(--color-brand-ocean)] hover:opacity-90 transition-opacity text-white shadow-lg shadow-primary/25 px-8 rounded-full font-bold tracking-wide transform hover:scale-105 duration-300"'
);

// Timeline border polish
content = content.replace(
  /className="relative border-l border-gray-100 ml-3 space-y-6"/g,
  'className="relative border-l-2 border-primary/20 ml-3 space-y-8"'
);
content = content.replace(
  /className="absolute -left-1\.5 top-1\.5 w-3 h-3 bg-gray-200 rounded-full border-2 border-white ring-1 ring-gray-100"/g,
  'className="absolute -left-[9px] top-1.5 w-4 h-4 bg-gradient-to-r from-[var(--color-brand-green)] to-[var(--color-brand-teal)] rounded-full border-4 border-card shadow-sm"'
);
content = content.replace(
  /className="bg-gray-50\/50 border border-gray-100 rounded-lg p-4"/g,
  'className="bg-muted/30 border border-border/50 rounded-xl p-5 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md duration-300"'
);

fs.writeFileSync(targetFile, content);
console.log('Premium polish applied to UserManagementSheet');
