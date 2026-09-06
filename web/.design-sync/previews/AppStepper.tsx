import { AppStepper } from 'getstronger-ds'

const rounds = (count: number) => `${count} ${count === 1 ? 'round' : 'rounds'}`

export const Rounds = () => (
  <AppStepper
    label="Rounds"
    value={3}
    min={1}
    max={10}
    format={rounds}
    decreaseLabel="One round fewer"
    increaseLabel="One round more"
    onChange={() => undefined}
  />
)

export const AtItsMinimum = () => (
  <AppStepper
    label="Rounds"
    value={1}
    min={1}
    max={10}
    format={rounds}
    decreaseLabel="One round fewer"
    increaseLabel="One round more"
    onChange={() => undefined}
  />
)

export const InLargerSteps = () => (
  <AppStepper
    label="Target reps"
    value={12}
    step={2}
    min={0}
    max={30}
    format={(reps) => `${reps} reps`}
    decreaseLabel="Two reps fewer"
    increaseLabel="Two reps more"
    onChange={() => undefined}
  />
)
