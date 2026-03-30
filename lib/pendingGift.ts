let _giftPending = false

export function setPendingGift() { _giftPending = true }
export function consumePendingGift(): boolean {
  if (_giftPending) { _giftPending = false; return true }
  return false
}
