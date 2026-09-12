// Qué le podemos mostrar al usuario cuando algo falla.
//
// LA REGLA: el texto de la base NUNCA llega a la pantalla. Un mensaje como
// «update or delete on table "transactions" violates foreign key constraint
// "liquid_reconciliations_adjustment_transaction_id_fkey"» no le dice nada a
// nadie: está en inglés, nombra tablas y restricciones que el usuario no sabe
// que existen, y encima aparece justo cuando algo salió mal, que es el peor
// momento para leer algo así.
//
// Hasta acá cada pantalla pasaba `e.message` como detalle del FormError, así
// que cualquier error de Postgres se filtraba entero a la interfaz. La regla
// vive ahora en un solo lugar --este archivo, que usa FormError-- y no en cada
// llamada: los formularios pasan el ERROR, no un texto, y acá se decide qué
// parte de eso puede leer una persona.
//
// QUÉ SÍ SE MUESTRA
//   · Lo que escribimos nosotros para el usuario (UserError, abajo).
//   · Lo que avisan nuestras funciones de Postgres con `raise exception`, que
//     está escrito en castellano a propósito ("Cuenta inexistente o de otro
//     usuario"). PostgREST las devuelve con el código P0001.
//   · Una explicación nuestra para los errores de base que sabemos leer (una
//     FK que rechaza, un duplicado, un CHECK).
//   · Para todo lo demás, el código a secas: sirve para contarlo, y no afirma
//     nada que el usuario no pueda verificar.

// Un error escrito PARA el usuario: su mensaje se muestra tal cual. Lo tiran
// las funciones de lib/ que validan algo antes de llamar a la base ("Ya existe
// la categoría X"), y es lo que las distingue de un error que vino de afuera.
export class UserError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UserError'
  }
}

// Los errores de Postgres que sabemos traducir. Son códigos SQLSTATE, no
// textos: el código es estable, el mensaje cambia entre versiones y está en
// inglés.
const POSTGRES = {
  // 23503: una FK rechazó el borrado o la escritura. En esta app siempre
  // significa lo mismo: hay otra fila que depende de esta. Las FK no llevan
  // `on delete cascade` a propósito (nada se borra si tiene historia).
  23503: 'Hay otra información guardada que depende de esto, así que no se puede eliminar.',
  23505: 'Ya existe algo cargado con esos mismos datos.',
  23514: 'Alguno de los datos quedó fuera de lo que la app permite (por ejemplo, un monto en cero o negativo).',
  23502: 'Falta completar un dato obligatorio.',
  22003: 'El monto es demasiado grande para guardarlo.',
  22007: 'La fecha no tiene un formato que la app pueda leer.',
  '22P02': 'Alguno de los datos tiene un formato que la app no pudo leer.',
  42501: 'No tenés permiso para hacer esto.',
  // PGRST116: PostgREST no encontró la fila que se esperaba (un .single()
  // sin resultado). Casi siempre es algo que se borró desde otro lado.
  PGRST116: 'No se encontró lo que se buscaba. Puede que ya no exista: probá recargar la pantalla.',
}

// Los de Supabase Auth, que no son de Postgres: vienen con su propio código.
const AUTH = {
  invalid_credentials: 'Email o contraseña incorrectos.',
  same_password: 'La contraseña nueva tiene que ser distinta de la anterior.',
  weak_password: 'La contraseña es muy corta: usá al menos 6 caracteres.',
  over_request_rate_limit: 'Probaste muchas veces seguidas. Esperá un momento y volvé a intentar.',
  email_not_confirmed: 'Todavía no confirmaste este email.',
}

// Quedarse sin internet es el error más común de todos y no es un error de la
// app: se reconoce por el texto porque `fetch` no tiene códigos.
const OFFLINE = /failed to fetch|networkerror|network request failed|load failed/i

// El detalle que se puede mostrar, o null si no hay nada que valga la pena
// decir (en cuyo caso el mensaje de la pantalla ya explica qué falló).
//
// Recibe el ERROR, no un texto. Un string se trata como lo que sería en la
// práctica --el mensaje crudo de algo que no controlamos-- y solo pasa si lo
// reconocemos.
export function describeError(error) {
  if (!error) return null

  const message = typeof error === 'string' ? error : (error.message ?? '')
  if (OFFLINE.test(message)) {
    return 'No se pudo conectar con el servidor. Revisá tu conexión a internet.'
  }
  if (typeof error === 'string') return null

  if (error instanceof UserError) return error.message

  const code = error.code ?? null
  // Nuestras propias funciones de Postgres avisan en castellano. P0001 es el
  // código que le pone Postgres a un `raise exception` sin SQLSTATE propio,
  // así que es exactamente "esto lo escribimos nosotros".
  if (code === 'P0001') return error.message
  if (code != null && POSTGRES[code]) return POSTGRES[code]
  if (code != null && AUTH[code]) return AUTH[code]
  if (error.status === 429) return AUTH.over_request_rate_limit

  return code ? `Error inesperado (código ${code}).` : null
}
