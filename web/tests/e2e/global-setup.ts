import { ownsSeedData, seedDatabase } from './seed'

// One seed for the whole run, whatever it is sharded into. Spec files put the
// rows back between files from the copy this leaves behind.
export default () => {
  if (!ownsSeedData) return

  seedDatabase()
}
