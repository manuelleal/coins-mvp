const fs = require('fs');
const h = fs.readFileSync('admin.html', 'utf8');
const nav = h.match(/id="nav[A-Za-z]+"/g) || [];
console.log('nav_count', nav.length);
console.log('has_attendance_nav', /id="navAttendance"/.test(h));
console.log('has_cobros_nav', /id="navCobros"/.test(h));
console.log('has_guard_super_admin', /guardRole\('super_admin'/.test(h));
