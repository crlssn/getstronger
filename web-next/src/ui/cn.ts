/**
 * Joins class names, dropping anything falsy.
 *
 * Components take a `className` so a caller can position them, and it has to
 * be appended to their own classes rather than replacing them.
 */
export const cn = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ')
