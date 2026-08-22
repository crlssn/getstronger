import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

import { collectFiles, findLiteralText, findStaticAttributes, readSource } from './sourceScan'

// The guard behind issue #953: user-visible copy lives in the i18n catalogue,
// never in the markup. A literal text node or a static user-facing attribute
// is English that Swedish users will see, and this test names the exact lines.
//
// The detection is exercised against fixtures as well as the source tree, so
// it keeps working while there are few components to catch anything.

describe('findLiteralText', () => {
  it.each([
    ['a bare text node', '<p>Save changes</p>'],
    ['text beside an expression', '<p>Logged {count} sets</p>'],
    ['text in a nested element', '<div><span>Rest timer</span></div>'],
  ])('flags %s', (_label, source) => {
    expect(findLiteralText(source)).toHaveLength(1)
  })

  it.each([
    ['a translated node', "<p>{t('workout.save')}</p>"],
    ['an interpolated value', '<p>{total}</p>'],
    ['a mapped list', '<ul>{items.map((i) => <li>{i.name}</li>)}</ul>'],
    ['a self-closing element', '<AppSkeleton />'],
    ['punctuation only', '<span>·</span>'],
    ['an arrow function', 'const done = () => finish()'],
    ['a comparison', 'if (sets > total) return null'],
    ['a comment mentioning markup', '// renders <p>Save</p> when idle'],
    ['a block comment', '/* <p>Save</p> */'],
    ['a string containing markup', "const html = '<p>Save</p>'"],
    ['a generic type parameter', 'interface Props<T> {\n  value: T\n}\n\ninterface Other {'],
  ])('leaves %s alone', (_label, source) => {
    expect(findLiteralText(source)).toEqual([])
  })

  it('reports the line the copy is on', () => {
    const source = ['<div>', '  <p>{t("a")}</p>', '  <p>Hard coded</p>', '</div>'].join('\n')

    expect(findLiteralText(source)).toEqual([{ line: 3, text: 'Hard coded' }])
  })
})

describe('findStaticAttributes', () => {
  it.each([
    ['aria-label', '<button aria-label="Close" />'],
    ['placeholder', '<input placeholder="Search exercises" />'],
    ['alt', '<img alt="The logo" />'],
    ['title', '<abbr title="Repetitions" />'],
    ['label', '<Field label="Weight" />'],
  ])('flags a static %s', (_label, source) => {
    expect(findStaticAttributes(source)).toHaveLength(1)
  })

  it.each([
    ['a translated attribute', '<button aria-label={t("common.close")} />'],
    ['a decorative image', '<img alt="" />'],
    ['an allowed format hint', '<DurationInput placeholder="m:ss" />'],
    ['a bound prop of another name', '<Chart datasetLabel="Volume" />'],
    ['a commented-out attribute', '// <button aria-label="Close" />'],
  ])('leaves %s alone', (_label, source) => {
    expect(findStaticAttributes(source)).toEqual([])
  })
})

describe('component copy', () => {
  const files = collectFiles(join(__dirname, '..', 'src'), ['.tsx'])

  it('renders no literal text nodes — every visible string comes from the catalogue', () => {
    const offenders = files.flatMap((file) =>
      findLiteralText(readSource(file)).map(({ line, text }) => `${file}:${line} — ${text}`),
    )

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('binds every user-facing attribute — no static aria-labels, placeholders, or alt text', () => {
    const offenders = files.flatMap((file) =>
      findStaticAttributes(readSource(file)).map(({ line, text }) => `${file}:${line} — ${text}`),
    )

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
