import type { TagRejection } from '@/utils/exerciseTags'

import { XMarkIcon } from '@heroicons/react/20/solid'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import {
  appendTags,
  matchingSuggestions,
  maxTagLength,
  maxTags,
  splitCandidates,
} from '@/utils/exerciseTags'
import styles from './ExerciseTagsInput.module.css'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}

/** The tag field: chips for what is chosen, with autocomplete for the rest. */
export const ExerciseTagsInput = ({ value, onChange, suggestions = [] }: Props) => {
  const { t } = useTranslation()

  const [draft, setDraft] = useState('')
  const [rejection, setRejection] = useState<TagRejection>()
  const [focused, setFocused] = useState(false)
  const suggestionsId = useId()
  const [highlighted, setHighlighted] = useState(-1)

  const matches = matchingSuggestions(suggestions, value, draft)
  const suggestionsOpen = focused && matches.length > 0

  const rejectionMessage = (reason: TagRejection) => {
    if (reason.reason === 'tooLong') {
      return t('exercise.tagInput.tooLong', { count: maxTagLength })
    }
    if (reason.reason === 'duplicate') {
      return t('exercise.tagInput.duplicate', { name: reason.tag })
    }
    return t('exercise.tagInput.tooMany', { count: maxTags })
  }

  const add = (candidates: string[]) => {
    const { tags, rejection: rejected } = appendTags(value, candidates, suggestions)
    setRejection(rejected)
    setHighlighted(-1)
    setDraft('')
    onChange(tags)
  }

  const commitDraft = () => {
    const candidates = splitCandidates(draft)
    if (!candidates.length) {
      setDraft('')
      return
    }
    add(candidates)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (matches.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setHighlighted((current) => {
        // Nothing highlighted sits before the first option, so up from there is
        // the last one rather than the second.
        const from = current < 0 && step < 0 ? matches.length : current
        return (from + step + matches.length) % matches.length
      })
      return
    }

    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()

    const choice = event.key === 'Enter' && highlighted >= 0 ? matches[highlighted] : undefined
    if (choice) add([choice])
    else commitDraft()
  }

  const removeTag = (index: number) => {
    setRejection(undefined)
    onChange(value.filter((_, tagIndex) => tagIndex !== index))
  }

  return (
    <div className={cn(styles.tagInput, value.length >= maxTags && styles.full)}>
      {value.length > 0 && (
        <div className={styles.tagList} aria-label={t('exercise.tagInput.listAria')}>
          {value.map((tag, index) => (
            <span key={tag}>
              {tag}
              <button
                type="button"
                aria-label={t('exercise.tagInput.remove', { name: tag })}
                onClick={() => removeTag(index)}
              >
                <XMarkIcon aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {value.length < maxTags && (
        <input
          type="text"
          maxLength={maxTagLength}
          placeholder={t('exercise.addTag')}
          aria-label={t('exercise.tagInput.addAria')}
          // A plain textbox may not carry aria-expanded, which is what axe
          // rejected here: the field has to say it owns the list first.
          role="combobox"
          aria-autocomplete="list"
          aria-controls={suggestionsId}
          aria-expanded={suggestionsOpen}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            setHighlighted(-1)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            commitDraft()
          }}
        />
      )}

      {suggestionsOpen && (
        <div
          id={suggestionsId}
          className={styles.tagSuggestions}
          role="listbox"
          aria-label={t('exercise.tagInput.suggestionsAria')}
        >
          {matches.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              aria-selected={index === highlighted}
              className={cn(index === highlighted && styles.highlighted)}
              // On mousedown, before the field's blur can commit the draft and
              // close the list out from under the pointer.
              onMouseDown={(event) => {
                event.preventDefault()
                add([suggestion])
              }}
            >
              {suggestion}
              <small>{t('exercise.tagInput.existingTag')}</small>
            </button>
          ))}
        </div>
      )}

      <div className={styles.tagHelp}>
        <small className={cn(rejection && styles.error)}>
          {rejection ? rejectionMessage(rejection) : t('exercise.tagHelp')}
        </small>
        <small>
          {value.length}/{maxTags}
        </small>
      </div>
    </div>
  )
}
