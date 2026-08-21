import { useState } from 'react'
import type { ChangeEvent } from 'react'

// Capitalises each word as it is typed — the same live transform the Vue
// version ran on every keyup.
const capitaliseWords = (value: string) =>
  value.toLowerCase().replace(/(^\w|(?<=([ /]))\w)/g, (char) => char.toUpperCase())

export default function AppListItemInput({
  capitalise,
  model,
  onUpdate,
  placeholder,
  required,
  type,
}: {
  capitalise?: boolean
  model: string
  onUpdate: (value: string) => void
  placeholder?: string
  required?: boolean
  type: string
}) {
  const [value, setValue] = useState(model)

  // Mirrors the Vue version's watcher: an external change to `model` (e.g. the
  // parent resetting the form) replaces whatever is being typed locally. This
  // is React's documented pattern for adjusting state from a prop change —
  // setState here during render is intentional and deduped, not an effect.
  const [prevModel, setPrevModel] = useState(model)
  if (model !== prevModel) {
    setPrevModel(model)
    setValue(model)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(capitalise ? capitaliseWords(event.target.value) : event.target.value)
  }

  // The Vue version only notifies its parent on the native `change` event
  // (blur/commit), not on every keystroke — `onBlur` is the React equivalent
  // for a text input, since React's onChange fires like `input` instead.
  const handleBlur = () => onUpdate(value)

  return (
    <li>
      <input
        className="mb-1 block w-full rounded-control border-0 bg-white px-4 py-5 font-medium text-text placeholder:text-text-subtle focus:ring-0"
        onBlur={handleBlur}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </li>
  )
}
