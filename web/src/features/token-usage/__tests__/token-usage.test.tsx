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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { TokenUsagePage } from '../index'

afterEach(() => {
  vi.restoreAllMocks()
})

it('queries usage with the API key only in the authorization header', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        code: true,
        data: {
          name: 'friend',
          total_granted: 5_000_000,
          total_used: 1_000_000,
          total_available: 4_000_000,
          unlimited_quota: false,
          expires_at: 0,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  )
  const user = userEvent.setup()
  render(<TokenUsagePage />)

  await user.type(screen.getByLabelText('API Key'), 'sk-friend-secret')
  await user.click(screen.getByRole('button', { name: 'Query usage' }))

  await waitFor(() => expect(screen.getByText('friend')).toBeInTheDocument())
  expect(fetchMock).toHaveBeenCalledWith('/api/usage/token/', {
    headers: { Authorization: 'Bearer sk-friend-secret' },
    cache: 'no-store',
  })
})
