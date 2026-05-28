import { api } from '@/lib/api'

export type CashPaymentType = 'MEMBERSHIP' | 'SUBSCRIPTION' | 'ONE_TIME_CLASS'

export type CashPaymentRequest = {
  id: string
  type: CashPaymentType
  packageId: string | null
  amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedAt: string
  processedAt: string | null
  package: { name: string } | null
}

export const cashPaymentApi = {
  request: (type: CashPaymentType, packageId?: string) =>
    api.post('/api/mobile/cash-payment/request', { type, packageId }),

  status: () =>
    api.get('/api/mobile/cash-payment/status'),
}
