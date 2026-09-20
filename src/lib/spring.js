// Resorte amortiguado con los dos parámetros de Apple (ver skill
// apple-design): `damping` (1 = sin rebote) y `response` (segundos; más
// bajo, más rápido). Es la única primitiva de movimiento guiado por un
// gesto de la app: la usan los sheets (este bloque) y, después, reordenar y
// pasar entre pestañas arrastrando.
//
// En el navegador se mueve con requestAnimationFrame; en un entorno sin
// rAF (los tests, en Node) cae a setTimeout, que los fake timers de vitest
// sí saben avanzar a mano.
const scheduleFrame =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16)
const cancelFrame =
  typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id)

const REST_DISTANCE = 0.5 // px
const REST_VELOCITY = 50 // px/s

export function spring({ from, to, velocity = 0, damping = 1, response = 0.3, onUpdate, onComplete }) {
  const angularFreq = (2 * Math.PI) / Math.max(response, 0.01)
  const stiffness = angularFreq * angularFreq
  const dampingCoef = 2 * damping * angularFreq

  let value = from
  let v = velocity
  let running = true
  let handle = null
  let last = null

  function tick(now) {
    if (!running) return
    if (last == null) last = now
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now

    const accel = -stiffness * (value - to) - dampingCoef * v
    v += accel * dt
    value += v * dt

    const atRest = Math.abs(value - to) < REST_DISTANCE && Math.abs(v) < REST_VELOCITY
    if (atRest) {
      value = to
      v = 0
      running = false
      onUpdate(value)
      onComplete?.()
      return
    }
    onUpdate(value)
    handle = scheduleFrame(tick)
  }
  handle = scheduleFrame(tick)

  return {
    stop() {
      running = false
      cancelFrame(handle)
    },
    get value() {
      return value
    },
    get velocity() {
      return v
    },
  }
}

// Proyección del impulso: hasta dónde sigue viajando algo soltado a esta
// velocidad (px/s) si se deja desacelerar solo. La misma fórmula que usa
// UIScrollView para decidir dónde frena un scroll largo.
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}
