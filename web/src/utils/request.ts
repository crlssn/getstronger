import { type Ref } from 'vue'

export function resetRequest<T extends { $typeName: string }>(refObj: Ref<T>) {
  const obj = refObj.value

  for (const key in obj) {
    if (key !== '$typeName' && typeof obj[key] === 'string') {
      obj[key] = '' as T[typeof key]
    }
  }

  refObj.value = { ...obj }
}
