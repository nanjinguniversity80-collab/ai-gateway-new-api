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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { MATRIX_ADMIN_URL, isMatrixGateway } from '@/lib/matrix-navigation'

/** Cross-application navigation; the existing profile menu remains unchanged. */
export function MatrixNavigation() {
  const { t } = useTranslation()
  if (!isMatrixGateway(window.location.origin)) return null

  return (
    <nav
      aria-label={t('Metis account')}
      className='flex shrink-0 flex-wrap items-center justify-end gap-2 px-3 py-1'
    >
      <Button variant='ghost' size='sm' render={<a href={MATRIX_ADMIN_URL} />}>
        {t('Return to Metis management')}
      </Button>
      <Button variant='outline' size='sm' render={<a href='/matrix/logout' />}>
        {t('Sign out')}
      </Button>
    </nav>
  )
}
