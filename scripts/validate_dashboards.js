const fs = require('fs');
const pages = ['admin.html', 'school.html', 'teacher.html'];
let failed = false;

for (const page of pages) {
  const html = fs.readFileSync(`c:/Users/User/Desktop/COINS/${page}`, 'utf8');
  const blocks = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  let bad = 0;
  blocks.forEach((block, i) => {
    const code = block.replace(/<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch (e) {
      bad += 1;
      failed = true;
      console.error(`${page} ERR block ${i} - ${e.message}`);
    }
  });
  if (!bad) console.log(`${page} OK (${blocks.length} script blocks)`);
}

if (failed) process.exit(1);
