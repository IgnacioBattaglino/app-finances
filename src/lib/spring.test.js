import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { project, spring } from './spring.js'

// No hay requestAnimationFrame en Node: spring.js cae a setTimeout, que acá
// se avanza a mano con fake timers.
function runFor(ms, step = 16) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) vi.advanceTimersByTime(step)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('spring', () => {
  test('con amortiguación 1 llega al destino sin pasarse', () => {
    const values = []
    let done = false
    spring({ from: 0, to: 100, damping: 1, response: 0.3, onUpdate: (v) => values.push(v), onComplete: () => (done = true) })
    runFor(2000)
    expect(done).toBe(true)
    expect(Math.max(...values)).toBeLessThanOrEqual(100.001)
  })

  test('con velocidad inicial hacia el destino llega antes que sin ella', () => {
    let ticksWithout = 0
    let doneWithout = false
    spring({
      from: 0,
      to: 100,
      velocity: 0,
      damping: 1,
      response: 0.3,
      onUpdate: () => ticksWithout++,
      onComplete: () => (doneWithout = true),
    })
    runFor(2000)
    expect(doneWithout).toBe(true)

    let ticksWith = 0
    let doneWith = false
    spring({
      from: 0,
      to: 100,
      velocity: 800,
      damping: 1,
      response: 0.3,
      onUpdate: () => ticksWith++,
      onComplete: () => (doneWith = true),
    })
    runFor(2000)
    expect(doneWith).toBe(true)

    expect(ticksWith).toBeLessThan(ticksWithout)
  })

  test('detenerlo a mitad de camino da un valor entre origen y destino', () => {
    let last = 0
    const handle = spring({ from: 0, to: 100, damping: 1, response: 0.6, onUpdate: (v) => (last = v) })
    runFor(80)
    handle.stop()
    expect(last).toBeGreaterThan(0)
    expect(last).toBeLessThan(100)
    expect(handle.value).toBe(last)
  })
})

describe('project', () => {
  test('project(0) === 0', () => {
    expect(project(0)).toBe(0)
  })

  test('crece con la velocidad', () => {
    expect(project(1000)).toBeGreaterThan(project(500))
    expect(project(500)).toBeGreaterThan(0)
  })
})
