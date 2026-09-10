/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { GatewayAdmin } from '../index'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderGatewayAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <GatewayAdmin />
    </QueryClientProvider>
  )
}

describe('gateway admin', () => {
  it('links to conversation audit and saves the displayed locked policy', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        tokens: [
          {
            name: 'cat-zhou',
            enabled: true,
            group: 'lock_existing',
            policy: {
              model: 'gpt-5.6-sol',
              reasoning_effort: 'medium',
              speed: 'standard',
            },
          },
        ],
        models: ['gpt-5.6-sol', 'gpt-5.6-terra'],
        reasoning_efforts: ['low', 'medium', 'high'],
        speeds: ['standard', 'fast'],
      },
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        ok: true,
        policy: {
          token_name: 'cat-zhou',
          model: 'gpt-5.6-sol',
          reasoning_effort: 'medium',
          speed: 'standard',
          group: 'lock_saved',
        },
      },
    })

    renderGatewayAdmin()

    const auditLink = await screen.findByRole('button', {
      name: /Open conversation audit/,
    })
    expect(auditLink).toHaveAttribute('href', '/audit/')
    expect(await screen.findByText('gpt-5.6-sol')).toBeVisible()
    expect(screen.getByText('medium')).toBeVisible()
    expect(screen.getByText('standard')).toBeVisible()

    await userEvent.click(
      screen.getByRole('button', { name: 'Save gateway policy' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save policy' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/audit/api/policies/apply',
        {
          token_name: 'cat-zhou',
          model: 'gpt-5.6-sol',
          reasoning_effort: 'medium',
          speed: 'standard',
        },
        { headers: { 'X-Gateway-Admin-Action': 'apply-policy' } }
      )
    })
  })
})
