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
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { getGatewayPolicyOptions } from './api'
import { GatewayPolicyForm } from './components/gateway-policy-form'

export function GatewayAdmin() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['gateway-policies'],
    queryFn: getGatewayPolicyOptions,
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Gateway management')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' render={<a href='/audit/' />}>
          {t('Open conversation audit')}
          <ExternalLink aria-hidden='true' />
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <Card>
          <CardHeader>
            <CardTitle>{t('API Key execution policy')}</CardTitle>
            <CardDescription>
              {t(
                'Lock the actual upstream model, reasoning effort, and response speed for each API key.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {query.isPending && <LoadingState />}
            {query.isError && (
              <ErrorState
                description={t('Unable to load gateway policies')}
                onRetry={() => void query.refetch()}
              />
            )}
            {query.data && <GatewayPolicyForm options={query.data} />}
          </CardContent>
        </Card>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
