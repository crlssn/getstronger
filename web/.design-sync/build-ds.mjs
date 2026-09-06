// Builds the design system as a library for design-sync.
//
// Vite produces the JS and compiles the CSS Modules through the app's own
// PostCSS/Tailwind pipeline, so the class hashes in the JS match the emitted
// stylesheet. tsc produces the .d.ts the converter reads as the API contract.
// This script stitches the result into a package the converter can resolve:
// ds-dist/{package.json,index.js,index.d.ts,ds.css,tokens.css}.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = resolve(here, '..')
const dist = join(web, 'ds-dist')
const typesRoot = join(dist, 'types')

const run = (cmd, args) => {
  console.error(`$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(join(web, 'node_modules', '.bin', cmd), args, { cwd: web, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\u2717 ${cmd} failed (${r.status})`)
    process.exit(1)
  }
}

const tailwind = async () => {
  const { default: postcss } = await import(
    join(web, 'node_modules', 'postcss', 'lib', 'postcss.mjs')
  )
  const { default: plugin } = await import(
    join(web, 'node_modules', '@tailwindcss', 'postcss', 'dist', 'index.mjs')
  )
  return (css, from) => postcss([plugin()]).process(css, { from })
}

// ── 1. JS + component CSS.
run('vite', ['build', '--config', '.design-sync/vite.ds.config.ts'])

const process_ = await tailwind()
const moduleCssPath = join(dist, 'style.css')
let moduleCss = readFileSync(moduleCssPath, 'utf8')

// Tailwind's PostCSS plugin expands a CSS Module's `@apply` rules only the
// first time it sees the file in a build. AppIconButton.module.css is imported
// by two components, so one copy comes through raw — in the app that copy is a
// harmless duplicate of an already-expanded rule, but a single-file library
// build has nowhere for the expanded one to come from. Re-running Tailwind over
// the compiled sheet expands whatever is left; `@reference` only loads context,
// so already-expanded CSS passes through untouched.
if (/@apply\b/.test(moduleCss)) {
  // The per-module `@reference` lines are no longer at the top of a file once
  // the modules are concatenated, so they are replaced by a single one.
  const body = moduleCss.replace(/@reference\s+(['"])[^'"]*\1\s*;/g, '')
  const out = await process_(
    `@reference '../../assets/base.css';\n${body}`,
    // A path inside the component dir, so that @reference resolves the same
    // way it does from the modules themselves.
    join(web, 'src', 'ui', 'components', '_ds-sync-concat.css'),
  )
  const left = (out.css.match(/@apply\b/g) ?? []).length
  if (left) {
    console.error(`\u2717 ${left} @apply rules still unexpanded`)
    process.exit(1)
  }
  moduleCss = out.css
  console.error('  expanded leftover @apply rules')
}

// ── 2. The app's global stylesheet: the token layer, the base rules and the
// utility classes. The component CSS references tokens but never defines them
// (under `@reference` Tailwind emits `var(--x, fallback)` and no `:root`
// block), so without this every design would run on the fallbacks alone.
// Vite resolves a bare `@import 'base.css'` as a sibling; plain PostCSS wants
// it spelled relatively.
// Tailwind only emits a utility that something in `content` actually uses, and
// this app styles through CSS Modules and `@apply` — so the app's own build
// emits about eighty utility classes and nothing else. A design built with this
// system needs layout and colour utilities to exist, and an engineer copying
// that design into the app gets them generated on demand by the same config.
// `@source inline()` forces a curated set from the app's own theme, so the
// class names a design uses are the ones the app would compile.
const SPACE = '{0,0.5,1,1.5,2,2.5,3,4,5,6,8,10,12,16}'
const TEXT = '{eyebrow,meta,body,body-lg,title,display,stat,sm,base,lg,5xl}'
const FG =
  '{text,text-muted,text-subtle,text-inverse,text-inverse-muted,ink,ink-strong,ink-muted,danger,danger-strong,success,success-strong,record,record-strong,info}'
const BG =
  '{canvas,surface,surface-sunken,surface-inverse,surface-track,ink,ink-strong,ink-surface,ink-tint,danger-surface,success-surface,record-surface,info-surface}'
const BORDER = '{border,border-strong,ink-border,ink,danger,record-border,transparent}'
const forcedUtilities = [
  '@source inline("{block,inline-block,inline,flex,inline-flex,grid,inline-grid,contents,hidden,table}");',
  '@source inline("{flex-row,flex-col,flex-wrap,flex-nowrap,flex-1,flex-auto,flex-none,grow,grow-0,shrink,shrink-0}");',
  '@source inline("items-{start,center,end,baseline,stretch}");',
  '@source inline("justify-{start,center,end,between,around,evenly}");',
  '@source inline("{self-start,self-center,self-end,text-left,text-center,text-right}");',
  `@source inline("gap-${SPACE}");`,
  `@source inline("gap-{x,y}-${SPACE}");`,
  `@source inline("{p,px,py,pt,pr,pb,pl}-${SPACE}");`,
  `@source inline("{m,mx,my,mt,mr,mb,ml}-${SPACE}");`,
  `@source inline("space-{x,y}-${SPACE}");`,
  '@source inline("grid-cols-{1,2,3,4,5,6,12}");',
  '@source inline("col-span-{1,2,3,4,5,6,full}");',
  '@source inline("{w,h}-{full,auto,max,min,screen,fit}");',
  '@source inline("{min-h,max-h}-{full,screen,0}");',
  '@source inline("max-w-{xs,sm,md,lg,xl,2xl,full,none}");',
  `@source inline("{size,w,h}-${SPACE}");`,
  `@source inline("text-${TEXT}");`,
  '@source inline("font-{normal,medium,semibold,bold}");',
  '@source inline("{uppercase,lowercase,capitalize,normal-case,italic,underline,no-underline,truncate,text-balance,text-pretty,tabular-nums,antialiased}");',
  '@source inline("leading-{none,tight,snug,normal,relaxed}");',
  '@source inline("tracking-{tight,normal,wide}");',
  `@source inline("text-${FG}");`,
  `@source inline("bg-${BG}");`,
  `@source inline("border-${BORDER}");`,
  '@source inline("border{,-t,-r,-b,-l}{,-0,-2}");',
  '@source inline("rounded{,-none,-full,-card,-control,-pill,-avatar,-sheet}");',
  '@source inline("shadow-{card,raised,overlay,none}");',
  '@source inline("{relative,absolute,fixed,sticky,static,inset-0,top-0,right-0,bottom-0,left-0}");',
  '@source inline("z-{0,10,20,30,40,50}");',
  '@source inline("overflow-{hidden,auto,visible}");',
  '@source inline("overflow-{x,y}-{hidden,auto,scroll}");',
  '@source inline("{sr-only,not-sr-only,cursor-pointer,cursor-not-allowed,select-none,pointer-events-none}");',
  '@source inline("opacity-{0,40,50,60,70,80,100}");',
  '@source inline("{hover:,focus:,}{bg,text}-{ink,ink-strong,ink-surface,text,text-muted,surface}");',
].join('\n')

const mainCss =
  readFileSync(join(web, 'src/assets/main.css'), 'utf8').replace(
    /@import\s+(['"])(?!\.|\/|[a-z]+:)([^'"]+\.css)\1/g,
    '@import $1./$2$1',
  ) +
  '\n' +
  forcedUtilities +
  '\n'
const globalCss = (await process_(mainCss, join(web, 'src/assets/main.css'))).css

// The preview harness paints `body` white, while the app's own stylesheet puts
// the canvas on `html` — so a card renders white content on a canvas remainder.
// The app's real background is the canvas, and a white card hides the edge of
// every surface that sits on one. Scoped to `#g`, the harness's grid container,
// so designs built with the system are unaffected.
const previewBackdrop = `
body:has(#g, .ds-single) { background-color: var(--color-canvas); }

/* A card is a still of the settled state. AppSheet and the dropdown menu stage
   their own entrance (the sheet translates in from 100% over 250ms), so a
   screenshot taken while that runs catches the panel mid-slide and off the
   card. Collapsing the durations inside the harness lands every card on the
   state the component rests in. */
/* The harness's single-story container carries \`transform: translateZ(0)\`,
   which makes it the containing block for any \`position: fixed\` descendant.
   A component that fixes itself to the viewport — AppSheet's backdrop,
   AppFormFooter's bar — then resolves \`inset: 0\` against a box with no height
   of its own and collapses above the card. Giving the container the viewport's
   height restores the geometry those components were written for. */
body:has(.ds-single) { padding: 0 !important; }
body:has(.ds-single) .ds-single { min-height: 100vh; }

body:has(#g, .ds-single) *,
body:has(#g, .ds-single) *::before,
body:has(#g, .ds-single) *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`

writeFileSync(join(dist, 'ds.css'), `${globalCss}\n${moduleCss}\n${previewBackdrop}`)

// ── 2b. The tokens on their own. ds.css is the compiled bundle, so a scanner
// reading it for custom properties finds Tailwind's internals — 109 `--tw-*`
// declared under utility selectors, plus `--animate-*`, `--default-transition-*`
// and the `--container-*` sizes — and none of those is a token anybody designs
// with. The real ones are the two blocks in theme.css, emitted here as plain
// CSS so the list needs no filtering.
const themeCss = readFileSync(join(web, 'src/assets/theme.css'), 'utf8')
const block = (header) => {
  const at = themeCss.indexOf(header)
  if (at === -1) {
    console.error(`\u2717 no ${header} block in theme.css`)
    process.exit(1)
  }
  const open = themeCss.indexOf('{', at)
  return themeCss.slice(open + 1, themeCss.indexOf('\n}', open)).replace(/\s+$/, '')
}

writeFileSync(
  join(dist, 'tokens.css'),
  [
    "/* The design system's tokens, and nothing else: the light palette and the",
    ' * values the dark one replaces. Generated from src/assets/theme.css by',
    ' * .design-sync/build-ds.mjs — edit the theme, not this file. */',
    ':root {',
    block('@theme static'),
    '}',
    '',
    ":root[data-theme='dark'] {",
    block("root[data-theme='dark']"),
    '}',
    '',
  ].join('\n'),
)

// ── 3. Types. The emitted declarations still carry the app's `@/…` alias,
// which the converter's ts-morph project has no paths config for — rewriting
// them to relative specifiers is what makes prop extraction resolve.
run('tsc', ['-p', '.design-sync/tsconfig.ds.json'])

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.d.ts') ? [join(d, e.name)] : [],
  )

let rewritten = 0
for (const file of walk(typesRoot)) {
  const before = readFileSync(file, 'utf8')
  const after = before.replace(/(['"])@\/([^'"]+)\1/g, (_m, q, spec) => {
    let rel = relative(dirname(file), join(typesRoot, 'src', spec))
      .split('\\')
      .join('/')
    if (!rel.startsWith('.')) rel = `./${rel}`
    return `${q}${rel}${q}`
  })
  if (after !== before) {
    writeFileSync(file, after)
    rewritten += 1
  }
}

const entryDts = join(typesRoot, '.design-sync', 'entry.d.ts')
if (!existsSync(entryDts)) {
  console.error(`\u2717 no declarations at ${entryDts}`)
  process.exit(1)
}
writeFileSync(join(dist, 'index.d.ts'), `export * from './types/.design-sync/entry';\n`)
writeFileSync(
  join(dist, 'package.json'),
  JSON.stringify(
    {
      name: 'getstronger-ds',
      version: '0.0.0',
      private: true,
      type: 'module',
      main: './index.js',
      module: './index.js',
      types: './index.d.ts',
      exports: { '.': { types: './index.d.ts', import: './index.js' } },
    },
    null,
    2,
  ) + '\n',
)

const kb = (p) => (existsSync(p) ? `${(readFileSync(p).length / 1024).toFixed(0)} KB` : 'MISSING')
console.error(
  `\u2713 ds-dist: index.js ${kb(join(dist, 'index.js'))}, ds.css ${kb(join(dist, 'ds.css'))}, tokens.css ${kb(join(dist, 'tokens.css'))}, ${rewritten} d.ts alias-rewritten`,
)
