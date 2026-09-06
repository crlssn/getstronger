import { AppDurationInput } from 'getstronger-ds'

export const Default = () => <AppDurationInput value={90} onChange={() => undefined} />

export const Empty = () => <AppDurationInput value={undefined} onChange={() => undefined} />

export const LongerThanAnHour = () => <AppDurationInput value={3720} onChange={() => undefined} />
