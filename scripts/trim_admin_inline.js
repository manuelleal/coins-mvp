const fs = require('fs');
const path = 'c:/Users/User/Desktop/COINS/admin.html';
const content = fs.readFileSync(path, 'utf8');
const marker = "window.showAdminView('dashboard');";
const markerIndex = content.indexOf(marker);
if (markerIndex < 0) {
  throw new Error('marker not found');
}
const out = content.slice(0, markerIndex + marker.length) + '\n});\n    </script>\n</body>\n</html>\n';
fs.writeFileSync(path, out, 'utf8');
console.log('admin.html trimmed');
