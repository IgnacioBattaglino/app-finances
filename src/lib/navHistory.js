// El pathname anterior, para la única excepción de useGoBack: si la entrada
// de la que se "volvería" es /login, se trata como si no hubiera anterior (no
// tiene sentido devolver al usuario a una pantalla de login de la que ya salió).
// Estado de módulo y no React: se lee una sola vez, al tocar volver, así que no
// hace falta re-renderizar nada cuando cambia. Lo actualiza App.jsx (Root) en
// cada cambio de ruta, para TODAS las rutas (incluidas /login y /registro, que
// viven fuera de Layout).
let previous = null
let current = null

export function recordPathname(pathname) {
  if (pathname === current) return
  previous = current
  current = pathname
}

export function previousPathname() {
  return previous
}
