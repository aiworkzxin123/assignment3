'use strict';

// Inlines src/rules.js into hosted/index.html between the BEGIN/END markers,
// so the hosted page runs exactly the server's pricing and booking rules.
//
//   node scripts/build-hosted.js           rewrite hosted/index.html
//   node scripts/build-hosted.js --check   exit 1 if it is out of date (CI)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RULES = path.join(ROOT, 'src', 'rules.js');
const HOSTED = path.join(ROOT, 'hosted', 'index.html');
const BEGIN = '// BEGIN src/rules.js\n';
const END = '// END src/rules.js\n';

// Git may check files out with CRLF on Windows; compare and build with LF.
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// Returns the hosted page with the current rules inlined.
function build(html = read(HOSTED), rules = read(RULES)) {
  const a = html.indexOf(BEGIN);
  const b = html.indexOf(END);
  if (a < 0 || b < a || html.indexOf(BEGIN, a + 1) >= 0) {
    throw new Error(`hosted/index.html needs exactly one "${BEGIN.trim()}" … "${END.trim()}" block.`);
  }
  return html.slice(0, a + BEGIN.length) + rules.replace(/\n*$/, '\n') + html.slice(b);
}

function main(args) {
  const current = read(HOSTED);
  const next = build(current);
  if (args.includes('--check')) {
    if (next !== current) {
      console.error(
        'hosted/index.html is out of date with src/rules.js. Run `npm run build:hosted` and commit the result.',
      );
      process.exitCode = 1;
    } else {
      console.log('hosted/index.html is up to date with src/rules.js.');
    }
    return;
  }
  const crlf = fs.readFileSync(HOSTED, 'utf8').includes('\r\n');
  fs.writeFileSync(HOSTED, crlf ? next.replace(/\n/g, '\r\n') : next);
  console.log(
    next === current ? 'hosted/index.html already up to date.' : 'Updated hosted/index.html from src/rules.js.',
  );
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { build, read, HOSTED, RULES };
