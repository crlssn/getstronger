export const isNumber = (value: number | string | undefined): boolean => {
  return typeof value === 'number' && !Number.isNaN(value)
}
