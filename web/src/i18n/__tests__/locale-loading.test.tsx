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
import { act, cleanup, render, screen } from '@testing-library/react'
import { createInstance, type ReadCallback } from 'i18next'
import {
  I18nextProvider,
  initReactI18next,
  useTranslation,
} from 'react-i18next'
import { afterEach, expect, test, vi } from 'vitest'

import { convertDetectedLanguage } from '../languages'
import { LocaleBoundary } from '../locale-boundary'

afterEach(cleanup)

test('cached Traditional Chinese selection survives language detection on reload', () => {
  expect(convertDetectedLanguage('zhTW')).toBe('zhTW')
})

// Simulate an unrelated language chunk failing to download.
vi.mock('../locales/ru.json', () => {
  throw new Error('Russian locale download unavailable')
})

test.each([false, true])(
  'pending locale shows loading and settles on download failure=%s',
  async (failure) => {
    const instance = createInstance()
    let finish: ReadCallback | undefined
    const ready = instance
      .use(initReactI18next)
      .use({
        type: 'backend' as const,
        init: () => undefined,
        read: (
          _language: string,
          _namespace: string,
          callback: ReadCallback
        ) => {
          finish = callback
        },
      })
      .init({
        lng: 'fr',
        fallbackLng: 'en',
        partialBundledLanguages: true,
        resources: { en: { translation: { greeting: 'Welcome' } } },
      })
    function Greeting() {
      const { t } = useTranslation()
      return <p>{t('greeting')}</p>
    }
    render(
      <I18nextProvider i18n={instance}>
        <LocaleBoundary>
          <Greeting />
        </LocaleBoundary>
      </I18nextProvider>
    )
    expect(screen.getByRole('status')).toBeVisible()
    await act(async () => {
      if (!finish) throw new Error('Locale request was not started')
      if (failure) finish(new Error('Download failed'), false)
      else finish(null, { greeting: 'Bienvenue' })
      await ready
    })
    expect(
      await screen.findByText(failure ? 'Welcome' : 'Bienvenue')
    ).toBeVisible()
    expect(screen.queryByRole('status')).toBeNull()
  }
)

test('unused locale failure does not block startup, switching or English fallback', async () => {
  localStorage.setItem('i18nextLng', 'en')
  try {
    const { default: i18n, i18nReady } = await import('../config')
    await i18nReady
    expect(i18n.t('Return to Metis management')).toBe(
      'Return to Metis management'
    )
    expect(i18n.hasResourceBundle('fr', 'translation')).toBe(false)
    expect(i18n.hasResourceBundle('zhCN', 'translation')).toBe(false)

    for (const language of ['zhCN', 'fr', 'ja', 'vi', 'zhTW']) {
      await i18n.changeLanguage(language)
      expect(i18n.hasResourceBundle(language, 'translation')).toBe(true)
      expect(i18n.resolvedLanguage).toBe(language)
      if (language.startsWith('zh')) {
        expect(i18n.t('Return to Metis management')).toBe('返回管理后台')
      }
    }
    await i18n.changeLanguage('unsupported')
    expect(i18n.t('Return to Metis management')).toBe(
      'Return to Metis management'
    )
    await i18n.changeLanguage('ru')
    expect(i18n.t('Return to Metis management')).toBe(
      'Return to Metis management'
    )
    expect(i18n.hasResourceBundle('ru', 'translation')).toBe(false)
  } finally {
    localStorage.removeItem('i18nextLng')
  }
})
