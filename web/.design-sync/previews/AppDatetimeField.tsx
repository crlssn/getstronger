import { AppDatetimeField } from 'getstronger-ds'

export const Default = () => (
  <AppDatetimeField label="Started at" model="2026-08-28T20:42" onUpdate={() => undefined} />
)

export const Required = () => (
  <AppDatetimeField
    label="Finished at"
    model="2026-08-28T21:33"
    required
    onUpdate={() => undefined}
  />
)
