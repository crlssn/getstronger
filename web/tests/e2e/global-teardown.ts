import { dropSeedSnapshot, ownsSeedData } from './seed'

export default () => {
  if (!ownsSeedData) return

  dropSeedSnapshot()
}
