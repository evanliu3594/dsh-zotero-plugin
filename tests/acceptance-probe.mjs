/**
 * Acceptance probe for the export and projection fixes (live Zotero required).
 *
 * Loads src/ by default, the BUILT artifact with --artifact (or
 * ZOTERO_FORCE_ARTIFACT=1). No writes: zotero_add_item is never called.
 *
 *   node tests/acceptance-probe.mjs
 *   node tests/acceptance-probe.mjs --artifact
 */

const t0 = Date.now()
const forceArtifact = process.argv.includes('--artifact') || process.env.ZOTERO_FORCE_ARTIFACT === '1'
let mod
// --artifact pins this probe to the built lib/ (the packaged runtime's entry)
// even though Node can now load src/ directly.
if (forceArtifact) {
  mod = await import('../lib/index.js')
  console.log('mode: ARTIFACT (forced)')
} else {
  try {
    mod = await import('../src/index.ts')
    console.log('mode: SOURCE (node native type stripping)')
  } catch (error) {
    mod = await import('../lib/index.js')
    console.log(`mode: ARTIFACT (src import failed: ${String(error.message).slice(0, 60)})`)
    console.log(`WARNING: artifact is from ${new Date((await import('node:fs')).statSync('lib/index.js').mtimeMs).toISOString()}`)
  }
}

const config = mod.Config({})
const registered = []
mod.apply({ tools: { register: (d) => { registered.push(d); return () => {} } }, logger: { info() {} } }, config)
const exec = { signal: new AbortController().signal }
const run = (name, args = {}) => registered.find((t) => t.name === name).execute(args, exec)

let pass = 0
let fail = 0
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  ok ? pass++ : fail++
}

const recent = await run('zotero_recent_items', { limit: 4 })
const [k1, k2] = recent.items.map((i) => i.key)
console.log(`\nfixture keys: ${k1}, ${k2}\n`)

// AT1: csljson with 2 keys returns exactly 2 items, one per request.
// The CSL body carries no item key (id is the citation key), so the contract is
// count-and-structure, not id correlation.
const two = await run('zotero_get_bibtex', { itemKeys: [k1, k2], format: 'csljson' })
const twoParsed = JSON.parse(two.export)
const twoIds = twoParsed.map((e) => e.id)
check('AT1 csljson 2 keys -> count 2', two.count === 2 && twoParsed.length === 2, `count=${two.count} parsed=${twoParsed.length}`)
check('AT1 entries are distinct', new Set(twoIds).size === twoIds.length, `ids=${JSON.stringify(twoIds)}`)
check('AT1 requested field', two.requested === 2, `requested=${two.requested}`)
check('AT1 failedKeys empty', Array.isArray(two.failedKeys) && two.failedKeys.length === 0, `failedKeys=${JSON.stringify(two.failedKeys)}`)

// AT2: single key unchanged.
const one = await run('zotero_get_bibtex', { itemKeys: [k1], format: 'csljson' })
const oneParsed = JSON.parse(one.export)
check('AT2 csljson 1 key -> count 1', one.count === 1 && oneParsed.length === 1, `count=${one.count}`)
check('AT2 entry has CSL content', typeof oneParsed[0]?.id === 'string' && typeof oneParsed[0]?.type === 'string', `id=${oneParsed[0]?.id}`)

// AT3: mixed valid + bogus key.
const mixed = await run('zotero_get_bibtex', { itemKeys: [k1, 'ZZZZZZZZ'], format: 'csljson' })
const mixedParsed = JSON.parse(mixed.export)
check('AT3 mixed keeps the valid item', mixed.count === 1 && mixedParsed.length === 1, `count=${mixed.count}`)
check('AT3 reports the failed key', Array.isArray(mixed.failedKeys) && mixed.failedKeys.includes('ZZZZZZZZ'), `failedKeys=${JSON.stringify(mixed.failedKeys)}`)

// AT4: bibtex multi unchanged and correctly filtered.
const bib = await run('zotero_get_bibtex', { itemKeys: [k1, k2], format: 'bibtex' })
const bibKeys = bib.export.match(/^@\w+\{([^,]+),/gm) ?? []
check('AT4 bibtex 2 keys -> 2 entries', bib.count === 2 && bibKeys.length === 2, `count=${bib.count} entries=${bibKeys.length}`)

// AT5: duplicate keys are deduplicated.
const dup = await run('zotero_get_bibtex', { itemKeys: [k1, k1], format: 'csljson' })
check('AT5 duplicate keys deduped', dup.requested === 1 && dup.count === 1, `requested=${dup.requested} count=${dup.count}`)

// AT6: projections no longer emit null-valued fields, search still works.
const search = await run('zotero_search_items', { limit: 3 })
const first = search.items[0]
check('AT6 search returns items', search.items.length > 0, `items=${search.items.length}`)
check('AT6 no undefined-valued keys survive JSON', !JSON.stringify(first).includes('null'), Object.keys(first).length + ' fields')
check('AT6 core fields present', Boolean(first.key && first.title && first.itemType), `key=${first.key} type=${first.itemType}`)

// AT7: tags list still paginates and filters.
const tags = await run('zotero_list_tags', { prefix: 'a', limit: 5 })
check('AT7 tag prefix filter', tags.tags.length <= 5 && tags.tags.every((t) => t.toLowerCase().startsWith('a')), `${tags.matched} matched, ${tags.tags.length} returned`)

// AT8: collections path computation intact.
const colls = await run('zotero_list_collections', { limit: 100 })
check('AT8 collections have hierarchy paths', colls.collections.every((c) => typeof c.path === 'string' && c.path.length > 0), `${colls.total} collections`)

console.log(`\n${pass} passed, ${fail} failed  (${Date.now() - t0} ms)`)
process.exit(fail === 0 ? 0 : 1)
