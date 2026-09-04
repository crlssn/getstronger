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
 *
 * The other direction is the same drift read backwards, and costs nothing to
 * check once the two sides are collected: a name a component applies that no
 * module defines compiles to `undefined`, so the element silently wears no
 * class at all. That is how a finished workout's set table lost its wrapper
 * and its horizontal scroller.
 */
const src = dirname(fileURLToPath(import.meta.url))

/** Blanked rather than cut, so the line a class is reported on still holds. */
const blank = (span: string) => span.replace(/[^\n]/g, ' ')

/**
 * Comments gone, and the at-statements with them.
 *
 * `@reference '...';` opens every module and ends in a semicolon rather than a
 * block, so the selector run that follows it starts with an `@` and the first
 * class in the file was read as part of an at-rule prelude and skipped.
 */
const withoutComments = (css: string) =>
  css.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/@[\w-]+[^;{}]*;/g, blank)

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
  // Prose, not code: the module this file documents is imaginary, and every
  // doc comment that says `styles.x` would otherwise name a class.
  source = source.replace(/\/\*[\s\S]*?\*\//g, blank)

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

/** Which module each script imports, so a name can be looked up in all of them. */
const imported = new Map<string, string[]>()
for (const [module, scripts] of importers) {
  for (const script of scripts) imported.set(script, [...(imported.get(script) ?? []), module])
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

const undeclared = [...imported].flatMap(([script, used]) => {
  const names = new Set(used.flatMap((module) => [...defined(readSource(module)).keys()]))
  const source = readSource(script).replace(/\/\*[\s\S]*?\*\//g, blank)

  // Only the names read straight off the import. A file that indexes
  // dynamically donates every string literal it holds to the other direction,
  // and a literal is not a claim that a class exists.
  return [
    ...source.matchAll(/\bstyles\.(\w+)/g),
    ...source.matchAll(/\bstyles\[\s*'([^']+)'\s*\]/g),
  ]
    .filter((use) => !names.has(use[1] ?? ''))
    .map((use) => {
      const line = source.slice(0, use.index ?? 0).split('\n').length
      return `${relative(src, script)}:${line} .${use[1]}`
    })
})

describe('CSS modules', () => {
  it('defines no class a component never applies', () => {
    expect(unapplied.sort(), 'delete the rule, or apply it').toEqual([])
  })

  it('applies no class a module never defines', () => {
    expect(undeclared.sort(), 'write the rule, or stop applying it').toEqual([])
  })
})
