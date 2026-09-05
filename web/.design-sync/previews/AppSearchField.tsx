import { AppSearchField } from 'getstronger-ds'

export const Default = () => (
  <AppSearchField label="Search exercises" value="" onChange={() => undefined} />
)

export const WithAValue = () => (
  <AppSearchField label="Search exercises" value="bench" onChange={() => undefined} />
)

export const Large = () => (
  <AppSearchField label="Search exercises" size="lg" value="" onChange={() => undefined} />
)
