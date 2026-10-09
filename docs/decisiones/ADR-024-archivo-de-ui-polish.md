# ADR-024: la rama `feat/ui-polish` se archiva en una etiqueta

Estado: Aceptada
Fecha: fines de septiembre 2026, aproximada (la dio Nacho de memoria). La etiqueta `archivo/ui-polish` apunta al commit 6c47870, del 2026-09-25.

Redactada a partir de: `docs/traspaso-2026-10.md` §3.1 («La rama `feat/ui-polish` se archivó con la etiqueta `archivo/ui-polish`, después de rescatar lo útil»), `git`, y el motivo que dio Nacho en septiembre de 2026.

## Contexto
Lo único registrado: existió una rama de pulido de la web (`feat/ui-polish`). Verificado con git el 2026-10-08: 28 commits sobre `main`, de los cuales 25 tienen un parche que `main` no tiene (`git cherry`), con trabajo de navegación, caché persistida, formulario que se agarra, Inicio en una pantalla, etc. Motivo, según Nacho: fue el segundo intento de pulir la web, y tampoco lo convenció; «en el celular se siente tosco». Decidió dejar de pelear contra los límites de una web en el teléfono y pasar a apps nativas (ver ADR-023).

## Decisión
La rama se archivó con la etiqueta `archivo/ui-polish` (local y en origin), «después de rescatar lo útil». Qué se rescató exactamente: **pendiente de verificar** (el traspaso no lo detalla).

## Consecuencias
- El código de ese trabajo no está en `main`. Lo que describen `docs/archivo/ux-ui-polish/` (el plan de 13 bloques, la auditoría y la propuesta del frontend), `src/lib/queryClient.js` y `READONLY_RPCS` solo existe ahí.
- Esos documentos se archivaron en `docs/archivo/ux-ui-polish/` con una nota que remite a la etiqueta.
- Borrar la etiqueta perdería ese trabajo: `docs/ESTADO.md` la lista.

## Alternativas
No registradas en las fuentes. Pendiente de verificar.

## Documentos afectados
`docs/archivo/ux-ui-polish/*`, `docs/informe-reglas-de-plata.md` (nota sobre `queryClient.js`), `docs/mudanza-reglas.md`, `docs/ESTADO.md`.
