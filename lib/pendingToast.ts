let _walletAdded = false

export function setPendingWalletToast() { _walletAdded = true }
export function consumePendingWalletToast(): boolean {
  if (_walletAdded) { _walletAdded = false; return true }
  return false
}
