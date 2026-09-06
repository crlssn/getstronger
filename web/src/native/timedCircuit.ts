import { registerPlugin } from '@capacitor/core'
import type { Phase, Recording } from '@/utils/timedCircuit'

interface TimedCircuitPlugin {
  start(options: { key: string; phases: Phase[]; locale: string }): Promise<void>
  read(options: { key: string }): Promise<{ recording?: Recording }>
  pause(options: { key: string }): Promise<void>
  resume(options: { key: string }): Promise<void>
  finish(options: { key: string }): Promise<void>
  clear(options: { key: string }): Promise<void>
}

export const timedCircuit = registerPlugin<TimedCircuitPlugin>('TimedCircuit')
