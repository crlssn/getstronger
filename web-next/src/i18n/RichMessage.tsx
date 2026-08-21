import type { ReactNode } from 'react'

import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

// A private-use code point: no catalogue value contains one, so wrapping a
// placeholder name in it makes the placeholder findable again once i18next has
// substituted it.
const marker = '\uE000'
const markerPattern = /\uE000([^\uE000]+)\uE000/

interface Props {
  i18nKey: string
  /** Placeholders whose value is an element rather than a string. */
  nodes: Record<string, ReactNode>
  /** Ordinary string placeholders in the same message. */
  values?: Record<string, string | number | undefined>
}

/**
 * Renders a message whose placeholders are elements, not strings.
 *
 * `<Trans>` only interpolates elements for placeholders written as tags in the
 * catalogue, and this catalogue is shared verbatim with the Vue app — so the
 * substitution is done here instead: each element becomes a marker, and the
 * translated string is split back apart around them. Word order therefore
 * stays the translator's, which is the whole point of interpolating rather
 * than concatenating.
 */
export const RichMessage = ({ i18nKey, nodes, values }: Props) => {
  const { t } = useTranslation()

  const markers = Object.fromEntries(
    Object.keys(nodes).map((name) => [name, `${marker}${name}${marker}`]),
  )
  const parts = t(i18nKey, { ...values, ...markers }).split(markerPattern)

  return (
    <>
      {parts.map((part, index) => (
        // Split with one capturing group alternates literal text and captures,
        // so an odd index is always a placeholder name.
        <Fragment key={index}>{index % 2 ? nodes[part] : part}</Fragment>
      ))}
    </>
  )
}
