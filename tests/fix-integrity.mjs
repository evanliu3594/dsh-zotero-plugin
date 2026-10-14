/**
 * Fix-integrity check: does the SHIPPED bundle still carry every fix?
 *
 * The other gates prove behavior. This one guards against a fix silently
 * disappearing — a stale lib/, a bad merge, or a rebuild from older source — by
 * asserting the markers each fix left in the built entry.
 *
 *   node tests/fix-integrity.mjs
 */
import { readFileSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const artifact = 'lib/index.js'
const source = readFileSync(artifact, 'utf8')

/** Marker + the defect it prevents. */
const markers = [
  ['/^[A-Za-z0-9]{8}$/', 'rejects a malformed item key instead of exporting the whole library'],
  ['failedKeys', 'reports keys Zotero did not export'],
  ['requested', 'reports how many keys the export was asked for'],
  ['cslJsonArray', 'normalizes a CSL-JSON export body'],
  ['Number.isInteger', 'rejects a malformed Total-Results header (integer, non-negative, not -0)'],
  ['readBackFailed', 'reports a save whose key could not be read back'],
  ['localeCompare', 'matches the saved item when Zotero rewrites its title case'],
  ['sameTitle', 'shares the tolerant title comparison'],
]

const absentLanguage = !/language:\s*\{/.test(source)
const absentFiniteOnly = !/Number\.isFinite/.test(source)

let pass = 0
let fail = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

check(`${artifact} exists and is non-empty`, source.length > 10_000, `${source.length} bytes`)

// Freshness: the bundle must be newer than every source file it was built from.
const newestSource = readdirSync('src')
  .filter((name) => name.endsWith('.ts'))
  .map((name) => ({ name, mtime: statSync(join('src', name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0]
const bundleTime = statSync(artifact).mtimeMs
check(
  'bundle is newer than the newest src file',
  bundleTime >= newestSource.mtime,
  `${newestSource.name} @ ${new Date(newestSource.mtime).toISOString()} vs bundle @ ${new Date(bundleTime).toISOString()}`,
)

for (const [marker, why] of markers) {
  check(`carries ${JSON.stringify(marker)} (${why})`, source.includes(marker))
}

check('no longer exposes the removed language parameter', absentLanguage)
check('no longer relies on Number.isFinite alone', absentFiniteOnly)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
