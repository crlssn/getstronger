import type { ReactNode } from 'react'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { usePrefersReducedMotion } from '@/utils/usePrefersReducedMotion'
import styles from './AppCarousel.module.css'

export interface CarouselSlide {
  /** Tells the panel from its siblings across a reorder. */
  key: string
  /** Names the panel — it becomes the name of the dot that scrolls to it. */
  label: string
  content: ReactNode
}

interface Props {
  /** Names the row. Required — a list of unlabelled panels says nothing. */
  label: string
  slides: readonly CarouselSlide[]
  className?: string
}

/** Which panel's start edge is nearest to where the row has come to rest. */
const nearestSlide = (track: HTMLElement) => {
  const offset = Math.abs(track.scrollLeft)

  let nearest = 0
  let shortest = Number.POSITIVE_INFINITY
  Array.from(track.children).forEach((slide, index) => {
    const distance = Math.abs((slide as HTMLElement).offsetLeft - track.offsetLeft - offset)
    if (distance < shortest) {
      shortest = distance
      nearest = index
    }
  })

  return nearest
}

/**
 * Panels swiped one at a time, with dots saying where in the row you are.
 *
 * The row bleeds past the screen's gutters so the next panel peeks in from the
 * edge: a row that ends flush at its container reads as a card, and nobody
 * swipes a card. Snapping is what makes the peek a promise — a drag lands on a
 * panel rather than wherever the finger left off.
 *
 * The dots are buttons rather than the decoration they look like, because the
 * peek is only an invitation on a touch screen; a pointer and a keyboard need
 * somewhere to click. Each says where in the row it goes as well as what is
 * there — two panels can carry the same name, and two dots may not.
 */
export const AppCarousel = ({ label, slides, className }: Props) => {
  const { t } = useTranslation()
  const track = useRef<HTMLUListElement>(null)
  const [current, setCurrent] = useState(0)
  const reducedMotion = usePrefersReducedMotion()

  const read = useCallback(() => {
    const element = track.current
    if (!element) return
    setCurrent((previous) => {
      const nearest = nearestSlide(element)
      return previous === nearest ? previous : nearest
    })
  }, [])

  useEffect(() => {
    const element = track.current
    if (!element) return

    read()
    element.addEventListener('scroll', read, { passive: true })

    // The panel under the row's start edge also changes when the window
    // resizes, which fires no scroll event.
    const observer = new ResizeObserver(read)
    observer.observe(element)

    return () => {
      element.removeEventListener('scroll', read)
      observer.disconnect()
    }
  }, [read])

  const show = (index: number) => {
    const element = track.current
    const slide = element?.children[index]
    if (!element || !slide) return

    element.scrollTo({
      left: (slide as HTMLElement).offsetLeft - element.offsetLeft,
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <div className={cn(styles.carousel, className)}>
      <ul ref={track} aria-label={label} className={styles.track}>
        {slides.map((slide) => (
          <li key={slide.key} className={styles.slide}>
            {slide.content}
          </li>
        ))}
      </ul>

      {slides.length > 1 && (
        <div className={styles.dots}>
          {slides.map((slide, index) => (
            <button
              key={slide.key}
              type="button"
              aria-current={index === current}
              aria-label={t('common.carouselPanel', {
                label: slide.label,
                position: index + 1,
                total: slides.length,
              })}
              className={cn(index === current && styles.currentDot)}
              onClick={() => show(index)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
