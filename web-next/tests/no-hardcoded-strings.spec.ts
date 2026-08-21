import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

// The guard behind issue #953, ported for JSX. JSX embeds in ordinary TS
// syntax — generics, comparisons and template literals reuse the same
// `<`/`>`/`{`/`}` characters a text-pattern scan over Vue's isolated
// `<template>` blocks relied on — so this walks the real AST instead of
// pattern-matching the source, and asks it directly which nodes are JSX text.

const allowedAttributeValues = new Set(['m:ss'])
const checkedAttributes = new Set(['aria-label', 'placeholder', 'alt', 'title', 'label'])

const collectFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      return entry === 'proto' ? [] : collectFiles(path)
    }
    return path.endsWith('.tsx') && !path.endsWith('.spec.tsx') ? [path] : []
  })

const parse = (path: string) =>
  ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

const lineOf = (source: ts.SourceFile, pos: number) =>
  source.getLineAndCharacterOfPosition(pos).line + 1

const walk = (node: ts.Node, visit: (node: ts.Node) => void) => {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

describe('component copy', () => {
  const files = collectFiles(join(__dirname, '..', 'src'))

  it('renders no literal text nodes — every visible string comes from the catalogue', () => {
    const offenders: string[] = []

    for (const path of files) {
      const source = parse(path)
      walk(source, (node) => {
        if (!ts.isJsxText(node)) return
        const text = node.getText(source)
        if (!/[A-Za-z]{2,}/.test(text)) return
        offenders.push(
          `${path}:${lineOf(source, node.getStart(source))} — ${text.trim().slice(0, 60)}`,
        )
      })
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('binds every user-facing attribute — no static aria-labels, placeholders, or alt text', () => {
    const offenders: string[] = []

    for (const path of files) {
      const source = parse(path)
      walk(source, (node) => {
        if (!ts.isJsxAttribute(node) || !node.initializer || !ts.isStringLiteral(node.initializer))
          return
        const name = node.name.getText(source)
        if (!checkedAttributes.has(name)) return
        const value = node.initializer.text
        if (!/[A-Za-z]{2,}/.test(value) || allowedAttributeValues.has(value)) return
        offenders.push(`${path}:${lineOf(source, node.getStart(source))} — ${name}="${value}"`)
      })
    }

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
