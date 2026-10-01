#!/usr/bin/env node
/**
 * Link this plugin's runtime dependencies to a local deepseek-harness checkout.
 *
 * The @deepseek-ai framework packages are not on the public npm registry yet,
 * so a plugin resolves them from a harness checkout. This script creates the
 * node_modules links Node needs — real symlinks (junctions on Windows), no
 * copying, so the plugin always tracks your checkout.
 *
 * Usage:
 *   node scripts/link-harness.mjs [path-to-deepseek-harness]
 *
 * Without an argument it looks for a checkout at ./deepseek-harness or
 * ../deepseek-harness relative to this repository.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scopedDir = join(repoRoot, 'node_modules', '@deepseek-ai')

const LINKS = [
  ['dsh-tools', 'packages/core/tools'],
  ['schemastery', 'vendor/schemastery'],
  ['cordis', 'vendor/cordis'],
  ['dsh-system-prompt', 'packages/core/system-prompt'],
]

function findHarness() {
  const arg = process.argv[2]
  if (arg) return resolve(arg)
  for (const candidate of [join(repoRoot, 'deepseek-harness'), join(repoRoot, '..', 'deepseek-harness')]) {
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

const harness = findHarness()
if (!harness || !existsSync(harness)) {
  console.error(`error: deepseek-harness checkout not found.
Clone it first, then pass its path:

  git clone https://github.com/deepseek-ai/deepseek-harness
  node scripts/link-harness.mjs /path/to/deepseek-harness`)
  process.exit(1)
}

// Validate every linked package exists in the checkout.
const missing = LINKS.filter(([, rel]) => !existsSync(join(harness, rel, 'package.json'))).map(([, rel]) => rel)
if (missing.length > 0) {
  console.error(`error: ${harness} is not a usable deepseek-harness checkout (missing: ${missing.join(', ')})`)
  process.exit(1)
}

// Warn when linked packages have no built lib/ output — the plugin resolves
// compiled JS, so a fresh checkout must be built first (pnpm run build:lib).
const unbuilt = []
for (const [name, rel] of LINKS) {
  const pkgRoot = join(harness, rel)
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
  const entry = typeof pkg.main === 'string' ? pkg.main : undefined
  if (entry && entry.includes('lib') && !existsSync(join(pkgRoot, entry))) {
    unbuilt.push(name)
  }
}
if (unbuilt.length > 0) {
  console.warn(`warning: these packages have no built lib/ output yet: ${unbuilt.join(', ')}
  build the checkout once from the harness root:  pnpm run build:lib`)
}

mkdirSync(scopedDir, { recursive: true })
const kind = process.platform === 'win32' ? 'junction' : 'dir'
for (const [name, rel] of LINKS) {
  const linkPath = join(scopedDir, name)
  rmSync(linkPath, { force: true })
  symlinkSync(join(harness, rel), linkPath, kind)
  console.log(`linked node_modules/@deepseek-ai/${name} -> ${join(harness, rel)}`)
}

console.log(`
done. verify with:

  node scripts/probe-runtime-resolution.mjs`)
