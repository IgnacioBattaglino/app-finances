import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TransactionFormModal from './TransactionFormModal.jsx'
import { categoriesQueryKey } from '../hooks/useCategories.js'

// Mismo patrón que Movements.test.jsx: renderToStaticMarkup alcanza para fijar
// el título. Se envuelve en un QueryClientProvider con las categorías ya en
// caché (useCategories vive ahora DENTRO del modal, no por prop) para que el
// primer render ya las tenga, sin depender de un fetch real a Supabase.
function renderModal(props) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(categoriesQueryKey, [])
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(TransactionFormModal, {
        open: true,
        onClose: () => {},
        onSaved: () => {},
        ...props,
      }),
    ),
  )
  queryClient.clear()
  return html
}

describe('TransactionFormModal', () => {
  it('título "Nuevo gasto" al crear con defaultKind expense', () => {
    expect(renderModal({ defaultKind: 'expense' })).toContain('Nuevo gasto')
  })

  it('título "Nuevo ingreso" al crear con defaultKind income', () => {
    expect(renderModal({ defaultKind: 'income' })).toContain('Nuevo ingreso')
  })
})
