import { api } from '@/lib/api'

// ─── API helpers ──────────────────────────────────────────────────────────────

export const subscriptionsApi = {
  list: () =>
    api.get('/api/mobile/subscriptions'),

  cancel: (id: string) =>
    api.patch(`/api/mobile/subscriptions/${id}`),

  subscribe: (packageId: string) =>
    api.post('/api/mobile/subscribe', { packageId }),

  joinClub: () =>
    api.post('/api/mobile/join-club'),

  confirmJoinClub: (paymentIntentId: string) =>
    api.post('/api/mobile/join-club/confirm', { paymentIntentId }),
}

// ─── Grandfathered check ─────────────────────────────────────────────────────
// A student is grandfathered if they registered before the membership gate
// was first enabled. Grandfathered students never see the club membership banner.

export function isGrandfathered(
  userCreatedAt: string | undefined,
  membershipRequiredSince: string | null | undefined,
): boolean {
  if (!membershipRequiredSince) return true  // flag was never enabled
  if (!userCreatedAt) return false
  return new Date(userCreatedAt) < new Date(membershipRequiredSince)
}

// ─── Polling helper ───────────────────────────────────────────────────────────
// After presenting the Stripe payment sheet for a subscription, we poll until
// the webhook has fired and the first UserCredit is created.

export async function pollForSubscriptionCredit(
  subscriptionId: string,
  maxAttempts = 10,
  delayMs = 1000,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    try {
      const { data } = await subscriptionsApi.list()
      const sub = data.subscriptions?.find((s: any) => s.id === subscriptionId)
      if (sub?.credits?.length > 0) return true
    } catch {
      // ignore transient errors while polling
    }
  }
  return false
}
