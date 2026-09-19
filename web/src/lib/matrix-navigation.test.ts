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
import { describe, expect, it, vi } from 'vitest'
import { isMatrixGateway, submitMatrixLogout } from './matrix-navigation'

describe('Matrix logout navigation', () => {
  it('leaves other installations unchanged', () => {
    expect(isMatrixGateway('https://example.com')).toBe(false)
    expect(submitMatrixLogout(document, 'https://example.com')).toBe(false)
    expect(document.querySelector('form')).toBeNull()
  })
  it('submits an explicit same-origin POST after confirmation', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    expect(submitMatrixLogout(document, 'https://admin-ai.178-105-174-93.sslip.io:8443')).toBe(true)
    const form = document.querySelector('form')
    if (!form) throw new Error('Logout form was not created')
    expect(form.method).toBe('post')
    expect(form.getAttribute('action')).toBe('/matrix/logout/finish')
    expect(form.hidden).toBe(true)
    expect(submit).toHaveBeenCalledOnce()
    form.remove()
    submit.mockRestore()
  })
})
