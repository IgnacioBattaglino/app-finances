import { useEffect, useState } from 'react'

// Alto visible real del viewport. En iOS Safari, el teclado on-screen achica
// el visual viewport sin mover el layout viewport: un sheet position:fixed
// (100% de alto de layout) queda tapado por el teclado aunque el contenido
// "quepa" según el CSS. null si el navegador no soporta la API (fallback:
// no acotar la altura).
export function useVisualViewportHeight() {
  const [height, setHeight] = useState(() => window.visualViewport?.height ?? null)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function update() {
      setHeight(vv.height)
    }
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [])

  return height
}
