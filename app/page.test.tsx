// app/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/navigation
const mockRedirect = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// Mock supabase server client
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

describe('Landing page', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRedirect.mockClear()
    mockGetUser.mockClear()
  })

  it('redirects authenticated users to /invoices', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
    })

    const { default: Home } = await import('./page')
    await Home()

    expect(mockRedirect).toHaveBeenCalledWith('/invoices')
  })

  it('does not redirect unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    })

    const { default: Home } = await import('./page')
    const result = await Home()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result).toBeDefined()
  })
})
