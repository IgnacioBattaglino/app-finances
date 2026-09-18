import { describe, it, expect } from 'vitest'
import { isWriteRequest, persistOptions } from './queryClient.js'

describe('isWriteRequest', () => {
  it('un GET no escribe', () => {
    expect(isWriteRequest('GET', 'https://x.supabase.co/rest/v1/transactions')).toBe(false)
  })

  it('un POST a una tabla escribe', () => {
    expect(isWriteRequest('POST', 'https://x.supabase.co/rest/v1/transactions')).toBe(true)
  })

  it('un POST a una RPC que escribe (reconcile_liquid) escribe', () => {
    expect(isWriteRequest('POST', 'https://x.supabase.co/rest/v1/rpc/reconcile_liquid')).toBe(true)
  })

  it('un POST a una RPC que solo lee (get_liquid_by_account) no escribe', () => {
    expect(isWriteRequest('POST', 'https://x.supabase.co/rest/v1/rpc/get_liquid_by_account')).toBe(
      false,
    )
  })

  it('cualquier pedido a /auth/v1/ no escribe', () => {
    expect(isWriteRequest('POST', 'https://x.supabase.co/auth/v1/token')).toBe(false)
  })

  it('un DELETE escribe', () => {
    expect(isWriteRequest('DELETE', 'https://x.supabase.co/rest/v1/transactions?id=eq.1')).toBe(
      true,
    )
  })
})

describe('persistOptions.dehydrateOptions.shouldDehydrateQuery', () => {
  const shouldPersist = persistOptions.dehydrateOptions.shouldDehydrateQuery

  it('una consulta exitosa normal se persiste', () => {
    expect(shouldPersist({ state: { status: 'success' }, meta: undefined })).toBe(true)
  })

  it('una consulta con meta.persist === false no se persiste', () => {
    expect(shouldPersist({ state: { status: 'success' }, meta: { persist: false } })).toBe(false)
  })

  it('una consulta que todavía no resolvió no se persiste', () => {
    expect(shouldPersist({ state: { status: 'pending' }, meta: undefined })).toBe(false)
  })
})
