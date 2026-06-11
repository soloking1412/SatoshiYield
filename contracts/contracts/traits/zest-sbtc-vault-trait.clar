;; zest-sbtc-vault-trait
;;
;; Interface the real Zest Earn sBTC vault must satisfy for zest-earn-adapter
;; to route funds into it. Modeled on Zest's ERC-4626-style Earn vault
;; (vault-sbtc): deposit sBTC -> receive shares (zsBTC); redeem shares ->
;; receive sBTC (principal + accrued yield).
;;
;; REAL ZEST INTERFACE (confirmed from Zest V2 docs/architecture):
;;   deposit(amount, min-shares, recipient) - shares minted to recipient
;;   redeem(shares, min-amount, recipient)  - sBTC proceeds sent to recipient
;;
;; Before mainnet:
;;   1. Confirm the live principal on-chain with the Zest team.
;;   2. Verify deposit/redeem signatures match this trait exactly.
;;   3. In zest-earn-adapter.clar: replace every .mock-zest-vault reference
;;      with 'SP<deployer>.vault-sbtc (the real Zest Earn sBTC vault).

(define-trait zest-sbtc-vault-trait
  (
    ;; Supply `amount` sats of sBTC from tx-sender; mint at least `min-shares`
    ;; vault shares to `recipient`. Reverts on slippage. Returns shares minted.
    (deposit (uint uint principal) (response uint uint))

    ;; Burn `shares` from tx-sender; return at least `min-amount` sats of sBTC
    ;; to `recipient`. Reverts on slippage. Returns the sBTC amount returned.
    (redeem (uint uint principal) (response uint uint))

    ;; Read-only: sBTC sats that `shares` currently redeem for.
    (convert-to-assets (uint) (response uint uint))

    ;; Read-only: shares that `amount` sBTC sats currently mints.
    (convert-to-shares (uint) (response uint uint))
  )
)
