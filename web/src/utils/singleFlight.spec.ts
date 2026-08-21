import { describe, expect, test, vi } from 'vitest'

import { singleFlight } from './singleFlight'

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('singleFlight', () => {
  test('runs the task once for concurrent callers', async () => {
    const gate = deferred<string>()
    const task = vi.fn(() => gate.promise)
    const run = singleFlight(task)

    const callers = [run(), run(), run()]
    gate.resolve('done')

    await expect(Promise.all(callers)).resolves.toEqual(['done', 'done', 'done'])
    expect(task).toHaveBeenCalledOnce()
  })

  test('starts a fresh run once the previous one has settled', async () => {
    const task = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second')
    const run = singleFlight(task)

    await expect(run()).resolves.toBe('first')
    await expect(run()).resolves.toBe('second')
    expect(task).toHaveBeenCalledTimes(2)
  })

  // Holding a rejected promise would make one failure permanent.
  test('releases the run when the task fails', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce('recovered')
    const run = singleFlight(task)

    await expect(run()).rejects.toThrow('network down')
    await expect(run()).resolves.toBe('recovered')
  })

  test('gives every concurrent caller the same failure', async () => {
    const gate = deferred<never>()
    const run = singleFlight(() => gate.promise)

    const callers = [run(), run()]
    gate.reject(new Error('network down'))

    await expect(Promise.allSettled(callers)).resolves.toEqual([
      { status: 'rejected', reason: expect.objectContaining({ message: 'network down' }) },
      { status: 'rejected', reason: expect.objectContaining({ message: 'network down' }) },
    ])
  })
})
