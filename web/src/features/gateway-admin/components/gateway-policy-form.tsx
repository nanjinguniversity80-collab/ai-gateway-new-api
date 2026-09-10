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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { applyGatewayPolicy } from '../api'
import {
  gatewayPolicySchema,
  type GatewayPolicyFormValues,
} from '../lib/policy-form'
import type { GatewayPolicyOptions } from '../types'

type GatewayPolicyFormProps = {
  options: GatewayPolicyOptions
}

function fieldDefaults(
  options: GatewayPolicyOptions,
  tokenName: string
): GatewayPolicyFormValues {
  const token = options.tokens.find((item) => item.name === tokenName)
  return {
    token_name: tokenName,
    model: token?.policy?.model || options.models[0] || '',
    reasoning_effort: token?.policy?.reasoning_effort || 'medium',
    speed: token?.policy?.speed || 'standard',
  }
}

export function GatewayPolicyForm(props: GatewayPolicyFormProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const firstToken = props.options.tokens[0]?.name || ''
  const form = useForm<GatewayPolicyFormValues>({
    resolver: zodResolver(gatewayPolicySchema),
    defaultValues: fieldDefaults(props.options, firstToken),
  })
  const [pending, setPending] = useState<GatewayPolicyFormValues | null>(null)

  useEffect(() => {
    form.reset(
      fieldDefaults(props.options, form.getValues('token_name') || firstToken)
    )
  }, [firstToken, form, props.options])

  const mutation = useMutation({
    mutationFn: applyGatewayPolicy,
    onSuccess: async () => {
      setPending(null)
      await queryClient.invalidateQueries({ queryKey: ['gateway-policies'] })
      toast.success(t('Gateway policy saved'))
    },
  })

  function selectToken(tokenName: string | null) {
    if (!tokenName) return
    form.reset(fieldDefaults(props.options, tokenName))
  }

  function submit(values: GatewayPolicyFormValues) {
    setPending(values)
  }

  return (
    <>
      <Form {...form}>
        <form
          className='grid gap-5 md:grid-cols-2'
          onSubmit={form.handleSubmit(submit)}
        >
          <FormField
            control={form.control}
            name='token_name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('API Key')}</FormLabel>
                <Select value={field.value} onValueChange={selectToken}>
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder={t('Select an API key')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.options.tokens.map((token) => (
                      <SelectItem key={token.name} value={token.name}>
                        {token.name}
                        {token.enabled ? '' : ` (${t('Disabled')})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='model'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Forced model')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder={t('Select a model')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.options.models.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='reasoning_effort'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Reasoning effort')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder={t('Select reasoning effort')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.options.reasoning_efforts.map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {effort}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='speed'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Response speed')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder={t('Select speed')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {props.options.speeds.map((speed) => (
                      <SelectItem key={speed} value={speed}>
                        {t(speed)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='md:col-span-2'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Client model, reasoning, and speed settings will be ignored after this policy is saved.'
              )}
            </p>
          </div>
          <div className='md:col-span-2'>
            <Button type='submit' disabled={props.options.tokens.length === 0}>
              {t('Save gateway policy')}
            </Button>
          </div>
        </form>
      </Form>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t('Confirm gateway policy')}
        desc={t(
          'This change takes effect immediately for the selected API key and overrides client settings.'
        )}
        confirmText={t('Save policy')}
        isLoading={mutation.isPending}
        handleConfirm={() => pending && mutation.mutate(pending)}
      />
    </>
  )
}
