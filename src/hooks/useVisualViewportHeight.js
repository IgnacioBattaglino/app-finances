import { useEffect, useState } from 'react'

// Cuánto esperar después de foco/blur para releer el alto real del
// viewport: el teclado on-screen anima su entrada/salida, así que una
// lectura inmediata puede llegar antes de que termine. Dos lecturas cubren
// una animación más lenta de lo esperado.
const REFRESH_DELAYS_MS = [350, 700]

function isFormField(el) {
  return el?.tagName === 'INPUT' || el?.tagName === 'SELECT'
}

// Alto visible real del viewport, para acotar la altura de un bottom sheet
// al teclado on-screen de iOS.
//
// En Safari en pestaña, el teclado dispara el evento 'resize' de
// visualViewport de forma confiable. En una PWA standalone de iOS (agregada
// a pantalla de inicio) ese evento es conocido por no dispararse — bug de
// WebKit sin arreglar (crbug/webkit #259770 lo trackea; interactive-widget
// del viewport meta NO es una alternativa acá: Safari no lo soporta en
// ninguna versión, solo Chrome 108+ y Firefox 132+). Por eso este hook no
// depende solo de 'resize': ante foco o blur de cualquier input/select en
// el documento (sin necesitar una ref al sheet — solo hay un modal abierto
// por vez) relee window.visualViewport.height directamente unos cientos de
// ms después, con o sin el evento de por medio. Donde 'resize' sí dispara,
// esto solo refina la misma lectura; donde no dispara, es lo único que
// corrige el alto. null si el navegador no soporta la API.
export function useVisualViewportHeight() {
  const [height, setHeight] = useState(() => window.visualViewport?.height ?? null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function readHeight() {
      setHeight(vv.height)
    }
    readHeight()
    vv.addEventListener('resize', readHeight)

    const timers = []
    function clearTimers() {
      for (const t of timers) clearTimeout(t)
      timers.length = 0
    }

    // Foco en un campo: releer el alto (encoge el sheet al espacio real
    // sobre el teclado) y recién con ese alto ya aplicado, llevar el campo
    // a la vista.
    function handleFocusIn(event) {
      if (!isFormField(event.target)) return
      const target = event.target
      clearTimers()
      for (const delay of REFRESH_DELAYS_MS) {
        timers.push(
          setTimeout(() => {
            setHeight(vv.height)
            target.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }, delay),
        )
      }
    }

    // Blur sin que otro campo haya entrado en foco: el teclado se está
    // cerrando, volvemos a leer para restaurar el alto a pantalla completa.
    function handleFocusOut(event) {
      if (!isFormField(event.target)) return
      clearTimers()
      for (const delay of REFRESH_DELAYS_MS) {
        timers.push(
          setTimeout(() => {
            // El foco ya pasó a otro campo: su propio focusin se encarga.
            if (isFormField(document.activeElement)) return
            setHeight(vv.height)
          }, delay),
        )
      }
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      clearTimers()
      vv.removeEventListener('resize', readHeight)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  return height
}
