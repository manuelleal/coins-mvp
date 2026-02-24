const fs = require('fs');
const html = fs.readFileSync('c:/Users/User/Desktop/COINS/admin.html', 'utf8');
const blocks = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
let hasError = false;
blocks.forEach((block, i) => {
  const code = block.replace(/<script[^>]*>/i, '').replace(/<\/script>$/i, '');
  try {
    // eslint-disable-next-line no-new-func
    new Function(code);
    console.log('OK script block', i);
  } catch (e) {
    hasError = true;
    console.error('ERR script block', i, '-', e.message);
  }
});
if (hasError) process.exit(1);
