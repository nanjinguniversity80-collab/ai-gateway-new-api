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
export type GatewayPolicy = {
  model: string
  reasoning_effort: string
  speed: string
}

export type GatewayToken = {
  name: string
  enabled: boolean
  group: string
  policy: GatewayPolicy | null
}

export type GatewayPolicyOptions = {
  tokens: GatewayToken[]
  models: string[]
  reasoning_efforts: string[]
  speeds: string[]
}

export type GatewayPolicyInput = {
  token_name: string
  model: string
  reasoning_effort: string
  speed: string
}

export type GatewayPolicyApplyResponse = {
  ok: boolean
  policy: GatewayPolicyInput & { group: string }
}
