const fs = require('fs');
let code = fs.readFileSync('react-game/src/vertical/lib/game.js', 'utf8');

code = code.replace(/document\.getElementById\('btn-pause'\)\.disabled\s*=\s*(true|false);/g, "if (document.getElementById('btn-pause')) document.getElementById('btn-pause').disabled = $1;");
code = code.replace(/document\.getElementById\('btn-pause'\)\.textContent\s*=\s*'([^']+)';/g, "if (document.getElementById('btn-pause')) document.getElementById('btn-pause').textContent = '$1';");

code = code.replace(/document\.getElementById\('btn-start'\)\.disabled\s*=\s*(true|false);/g, "if (document.getElementById('btn-start')) document.getElementById('btn-start').disabled = $1;");
code = code.replace(/document\.getElementById\('btn-start'\)\.textContent\s*=\s*'([^']+)';/g, "if (document.getElementById('btn-start')) document.getElementById('btn-start').textContent = '$1';");

fs.writeFileSync('react-game/src/vertical/lib/game.js', code);
console.log("Patched game.js");
