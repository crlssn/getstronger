<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { XMarkIcon } from '@heroicons/vue/20/solid'

const { t } = useI18n()

const maxTags = 10
const maxTagLength = 64

const props = withDefaults(
  defineProps<{
    modelValue?: string[]
    suggestions?: string[]
  }>(),
  { modelValue: () => [], suggestions: () => [] },
)
const emit = defineEmits<{ 'update:modelValue': [tags: string[]] }>()

const draft = ref('')
const error = ref('')
const focused = ref(false)
const highlightedIndex = ref(-1)

const matchingSuggestions = computed(() => {
  const query = draft.value.trim().toLowerCase()
  if (!query || props.modelValue.length >= maxTags) return []

  const selected = new Set(props.modelValue.map((tag) => tag.toLowerCase()))
  return props.suggestions
    .filter((tag) => !selected.has(tag.toLowerCase()) && tag.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftStartsWithQuery = left.toLowerCase().startsWith(query)
      const rightStartsWithQuery = right.toLowerCase().startsWith(query)
      if (leftStartsWithQuery !== rightStartsWithQuery) return leftStartsWithQuery ? -1 : 1
      return left.localeCompare(right)
    })
    .slice(0, 8)
})

const appendTags = (candidates: string[]) => {
  error.value = ''
  const next = [...props.modelValue]
  const seen = new Set(next.map((tag) => tag.toLowerCase()))

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    const existingSuggestion = props.suggestions.find(
      (suggestion) => suggestion.toLowerCase() === trimmed.toLowerCase(),
    )
    const tag = existingSuggestion ?? trimmed

    if (!tag) continue
    if (tag.length > maxTagLength) {
      error.value = `Tags can be up to ${maxTagLength} characters.`
      continue
    }
    if (seen.has(tag.toLowerCase())) {
      error.value = `“${tag}” is already added.`
      continue
    }
    if (next.length >= maxTags) {
      error.value = `You can add up to ${maxTags} tags.`
      break
    }
    seen.add(tag.toLowerCase())
    next.push(tag)
  }

  emit('update:modelValue', next)
  highlightedIndex.value = -1
}

const addTags = () => {
  const candidates = draft.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  if (!candidates.length) {
    draft.value = ''
    return
  }

  appendTags(candidates)
  draft.value = ''
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown' && matchingSuggestions.value.length) {
    event.preventDefault()
    highlightedIndex.value = (highlightedIndex.value + 1) % matchingSuggestions.value.length
    return
  }
  if (event.key === 'ArrowUp' && matchingSuggestions.value.length) {
    event.preventDefault()
    highlightedIndex.value =
      (highlightedIndex.value - 1 + matchingSuggestions.value.length) %
      matchingSuggestions.value.length
    return
  }
  if (event.key !== 'Enter' && event.key !== ',') return

  event.preventDefault()
  if (event.key === 'Enter' && highlightedIndex.value >= 0) {
    selectSuggestion(matchingSuggestions.value[highlightedIndex.value])
    return
  }
  addTags()
}

const selectSuggestion = (tag: string) => {
  appendTags([tag])
  draft.value = ''
}

const onBlur = () => {
  focused.value = false
  addTags()
}

const removeTag = (index: number) => {
  error.value = ''
  emit(
    'update:modelValue',
    props.modelValue.filter((_, tagIndex) => tagIndex !== index),
  )
}
</script>

<template>
  <div class="tag-input" :class="{ full: modelValue.length >= maxTags }">
    <div v-if="modelValue.length" class="tag-list" :aria-label="t('exercise.tagInput.listAria')">
      <span v-for="(tag, index) in modelValue" :key="tag">
        {{ tag }}
        <button
          type="button"
          :aria-label="t('exercise.tagInput.remove', { name: tag })"
          @click="removeTag(index)"
        >
          <XMarkIcon />
        </button>
      </span>
    </div>
    <input
      v-if="modelValue.length < maxTags"
      v-model="draft"
      type="text"
      :maxlength="maxTagLength"
      :placeholder="t('exercise.addTag')"
      :aria-label="t('exercise.tagInput.addAria')"
      aria-autocomplete="list"
      :aria-expanded="focused && matchingSuggestions.length > 0"
      @keydown="onKeydown"
      @input="highlightedIndex = -1"
      @focus="focused = true"
      @blur="onBlur"
    />
    <div
      v-if="focused && matchingSuggestions.length"
      class="tag-suggestions"
      role="listbox"
      :aria-label="t('exercise.tagInput.suggestionsAria')"
    >
      <button
        v-for="(suggestion, index) in matchingSuggestions"
        :key="suggestion"
        type="button"
        role="option"
        :aria-selected="index === highlightedIndex"
        :class="{ highlighted: index === highlightedIndex }"
        @mousedown.prevent="selectSuggestion(suggestion)"
      >
        {{ suggestion }}
        <small>{{ t('exercise.tagInput.existingTag') }}</small>
      </button>
    </div>
    <div class="tag-help">
      <small :class="{ error }">{{ error || t('exercise.tagHelp') }}</small>
      <small>{{ modelValue.length }}/{{ maxTags }}</small>
    </div>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.tag-input {
  @apply card space-y-3 p-4 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100;
}
.tag-list {
  @apply flex flex-wrap gap-2;
}
.tag-list > span {
  @apply inline-flex min-h-8 items-center gap-1.5 rounded-full bg-indigo-50 py-1 pl-3 pr-1.5 text-sm font-medium text-indigo-700;
}
.tag-list button {
  @apply grid size-6 place-items-center rounded-full text-indigo-500 transition hover:bg-indigo-100 hover:text-indigo-800;
}
.tag-list svg {
  @apply size-4;
}
/* The wrapper is already the field; a ringed input inside it double-boxes. */
.tag-input input {
  @apply block min-h-(--size-control-sm) w-full border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-0;
}
.tag-suggestions {
  @apply -mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg;
}
.tag-suggestions button {
  @apply flex min-h-11 w-full items-center justify-between gap-3 border-t border-slate-100 px-3 text-left text-sm font-medium text-slate-700 first:border-t-0 hover:bg-indigo-50 hover:text-indigo-800;
}
.tag-suggestions button.highlighted {
  @apply bg-indigo-50 text-indigo-800;
}
.tag-suggestions small {
  @apply shrink-0 text-xs font-normal text-slate-400;
}
.tag-help {
  @apply flex items-center justify-between gap-3 text-slate-400;
}
.tag-help .error {
  @apply text-red-600;
}
.full {
  @apply border-indigo-200;
}
</style>
