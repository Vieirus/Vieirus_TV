import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
const require = createRequire(import.meta.url);
const parser = createRequire(require.resolve('eslint'))('espree');
const base = 'dist/apps/tv';
const html = readFileSync(`${base}/index.html`, 'utf8');
assert.match(html, /<script defer src="\.\/assets\/[^"]+\.js"/);
assert.doesNotMatch(html, /type="module"|modulepreload|crossorigin/);
const scripts = readdirSync(`${base}/assets`).filter((file) =>
    file.endsWith('.js')
);
assert.equal(scripts.length, 1, 'TV must ship one classic JavaScript bundle');
const code = readFileSync(`${base}/assets/${scripts[0]}`, 'utf8');
// Chromium 53 (webOS 4.x) parses ES2016 only: no async/await, object spread,
// optional chaining or trailing commas in parameter lists.
parser.parse(code, { ecmaVersion: 2016 });
assert.doesNotMatch(
    code,
    /\bglobalThis\b|Object\.fromEntries|\.flatMap\(|\.replaceAll\(|Promise\.allSettled/
);
// Information seulement : regex que Chromium 53 ne sait pas lire. Celles
// construites avec new RegExp(...) sont reecrites au demarrage par
// polyfills.ts ; une regex litterale non convertie ferait echouer le script.
const regexRisks = [...code.matchAll(/\\p\{|\\P\{|\(\?<[=!]|\(\?<[A-Za-z_]/g)];
console.log(`Regex a risque pour Chromium 53 : ${regexRisks.length}`);
for (const m of regexRisks.slice(0, 8)) {
    console.log(
        '  ...' +
            code
                .slice(Math.max(0, m.index - 50), m.index + 70)
                .replace(/\s+/g, ' ') +
            '...'
    );
}
const app = JSON.parse(readFileSync(`${base}/appinfo.json`, 'utf8'));
assert.equal(app.disableBackHistoryAPI, true);
assert.equal(app.main, 'index.html');
console.log(
    `Verified classic deferred TV bundle, ES2016 syntax and unsupported-builtin scan (${Buffer.byteLength(code)} bytes). This is not a Chromium 68 or device runtime test.`
);
