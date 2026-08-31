import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { collectFiles, readSource } from '../tests/sourceScan'

/**
 * A class a module defines but nobody applies is invisible drift.
 *
 * Module locals are hashed, so a rule only ever takes effect through the
 * `styles.x` that names it. Nothing else can reach one: not a sibling
 * component, not the end-to-end suite, not a stylesheet next door. That makes
 * "defined here, named there" a complete account of whether a rule is live,
 * and a rule that fails it is dead in a way reading the file cannot show —
 * four `.eyebrow` rules outlived the header component that used to apply them
 * and read as live styling for months.
 *
 * It also catches the rule that was never live: `.routineOptions >
 * button.selected` never matched, because the button wore AppOptionRow's
 * `.selected` and hashed names from two modules never collide.
 */
const src = dirname(fileURLToPath(import.meta.url))

/** Blanked rather than cut, so the line a class is reported on still holds. */
const withoutComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (span) => span.replace(/[^\n]/g, ' '))

/**
 * Every class a module defines, with the line it first appears on.
 *
 * Selector text is whatever precedes a `{` — a run that cannot span a brace,
 * so declarations never reach it. At-rules are skipped for their prelude and
 * read for the rules nested inside them; `:global` is somebody else's name.
 *
 * A class that only ever qualifies another one still has to be applied:
 * `.nextCard .eyebrow` needs both in the DOM to match.
 */
const defined = (css: string): Map<string, number> => {
  const clean = withoutComments(css)
  const classes = new Map<string, number>()

  for (const rule of clean.matchAll(/([^{}]*)\{/g)) {
    const selector = rule[1] ?? ''
    if (selector.trim().startsWith('@')) continue

    for (const name of selector.replace(/:global\s*\([^)]*\)/g, ' ').matchAll(/\.(-?[\w-]+)/g)) {
      const at = (rule.index ?? 0) + selector.indexOf(name[0])
      if (!classes.has(name[1] ?? '')) {
        classes.set(name[1] ?? '', clean.slice(0, at).split('\n').length)
      }
    }
  }

  return classes
}

/**
 * The names a source file applies out of the module it imports.
 *
 * `styles[tone]` cannot be resolved without the type behind `tone`, so a file
 * that indexes dynamically donates every bare string literal it contains
 * instead — which is where the union that feeds the index is written.
 */
const applied = (source: string): { names: Set<string>; dynamic: boolean } => {
  const names = new Set<string>()
  for (const use of source.matchAll(/\bstyles\.(\w+)/g)) names.add(use[1] ?? '')
  for (const use of source.matchAll(/\bstyles\[\s*'([^']+)'\s*\]/g)) names.add(use[1] ?? '')

  const dynamic = /\bstyles\[\s*[^'\]]/.test(source)
  if (dynamic) for (const key of source.matchAll(/'([A-Za-z_][\w-]*)'/g)) names.add(key[1] ?? '')

  return { names, dynamic }
}

const modules = collectFiles(src, ['.module.css'])
const scripts = collectFiles(src, ['.tsx', '.ts'])

const importers = new Map(modules.map((module) => [module, [] as string[]]))
for (const script of scripts) {
  for (const line of readSource(script).matchAll(/from\s+'([^']*\.module\.css)'/g)) {
    importers.get(resolve(dirname(script), line[1] ?? ''))?.push(script)
  }
}

/** `composes: x from './Other.module.css'` applies Other's class from here. */
const borrowed = new Map<string, Set<string>>()
for (const module of modules) {
  const css = withoutComments(readSource(module))
  for (const use of css.matchAll(/composes:\s*([^;]+?)\s+from\s+'([^']+)'/g)) {
    const target = resolve(dirname(module), use[2] ?? '')
    const names = borrowed.get(target) ?? new Set<string>()
    for (const name of (use[1] ?? '').trim().split(/\s+/)) names.add(name)
    borrowed.set(target, names)
  }
}

const unapplied = modules.flatMap((module) => {
  const names = new Set(borrowed.get(module) ?? [])
  for (const script of importers.get(module) ?? []) {
    for (const name of applied(readSource(script)).names) names.add(name)
  }

  return [...defined(readSource(module))]
    .filter(([name]) => !names.has(name))
    .map(([name, line]) => `${relative(src, module)}:${line} .${name}`)
})

describe('CSS modules', () => {
  it('defines no class a component never applies', () => {
    expect(unapplied.sort(), 'delete the rule, or apply it').toEqual([])
  })
})
