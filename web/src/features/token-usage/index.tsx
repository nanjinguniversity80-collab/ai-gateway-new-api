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
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { formatQuotaWithCurrency } from '@/lib/currency'

type FormValues = { apiKey: string }

type TokenUsage = {
  name: string
  total_granted: number
  total_used: number
  total_available: number
  unlimited_quota: boolean
  expires_at: number
}

async function loadUsage(apiKey: string): Promise<TokenUsage> {
  const response = await fetch('/api/usage/token/', {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })
  const payload = await response.json()
  if (!response.ok || payload?.code !== true) {
    throw new Error(payload?.message || 'Unable to query API Key usage')
  }
  return payload.data
}

function formatExpiry(timestamp: number, neverLabel: string) {
  if (!timestamp) return neverLabel
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000))
}

export function TokenUsagePage() {
  const { t } = useTranslation()
  const [usage, setUsage] = useState<TokenUsage | null>(null)
  const [error, setError] = useState('')
  const formSchema = z.object({
    apiKey: z
      .string()
      .trim()
      .startsWith('sk-', t('API Key must start with sk-')),
  })
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { apiKey: '' },
  })

  async function submit(values: FormValues) {
    setError('')
    setUsage(null)
    try {
      setUsage(await loadUsage(values.apiKey))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t('Unable to query API Key usage')
      )
    }
  }

  return (
    <main className='bg-muted/30 flex min-h-screen items-start justify-center px-4 py-16'>
      <Card className='w-full max-w-2xl'>
        <CardHeader>
          <div className='bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-xl'>
            <KeyRound aria-hidden='true' className='size-5' />
          </div>
          <CardTitle>{t('API Key usage')}</CardTitle>
          <CardDescription>
            {t(
              'Paste your API Key to view its granted, used, and remaining quota. The key is not stored in the browser.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          <Form {...form}>
            <form
              className='flex items-end gap-3'
              onSubmit={form.handleSubmit(submit)}
            >
              <FormField
                control={form.control}
                name='apiKey'
                render={({ field }) => (
                  <FormItem className='flex-1'>
                    <FormLabel>{t('API Key')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        autoComplete='off'
                        placeholder='sk-…'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type='submit' disabled={form.formState.isSubmitting}>
                {t('Query usage')}
              </Button>
            </form>
          </Form>

          {error && <p className='text-destructive text-sm'>{error}</p>}
          {usage && (
            <section
              aria-label={t('Usage result')}
              className='grid gap-3 sm:grid-cols-2'
            >
              <UsageItem label={t('API Key name')} value={usage.name} />
              <UsageItem
                label={t('Expires at')}
                value={formatExpiry(usage.expires_at, t('Never expires'))}
              />
              <UsageItem
                label={t('Granted quota')}
                value={formatQuotaWithCurrency(usage.total_granted)}
              />
              <UsageItem
                label={t('Used quota')}
                value={formatQuotaWithCurrency(usage.total_used)}
              />
              <UsageItem
                label={t('Remaining quota')}
                value={
                  usage.unlimited_quota
                    ? t('Unlimited')
                    : formatQuotaWithCurrency(usage.total_available)
                }
              />
            </section>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function UsageItem(props: { label: string; value: string }) {
  return (
    <div className='bg-muted/50 rounded-xl p-4'>
      <div className='text-muted-foreground text-sm'>{props.label}</div>
      <div className='mt-1 text-lg font-semibold'>{props.value}</div>
    </div>
  )
}
