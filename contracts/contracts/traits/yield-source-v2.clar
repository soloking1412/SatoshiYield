;; yield-source-v2 trait.
;; Same as yield-source, but `withdraw` takes the sBTC token as a SIP-010
;; trait, so adapters move funds through a network-agnostic token reference
;; (mock-sbtc on testnet, real sbtc-token on mainnet) with no source change.

(use-trait sip-010 .sip-010-trait.sip-010-trait)

(define-trait yield-source-v2-trait
  (
    ;; Record a deposit of `amount` satoshis for `user`.
    ;; Returns the internal share units allocated.
    (deposit (uint principal) (response uint uint))

    ;; Record a withdrawal for `user` of `amount` satoshis worth of shares,
    ;; transferring that sBTC back to the vault via the supplied token contract.
    (withdraw (uint principal <sip-010>) (response uint uint))

    ;; Current yield rate in basis points (10000 = 100.00 %).
    ;; Value is pushed by an authorized oracle; never computed on-chain.
    (get-apy () (response uint uint))

    ;; Total satoshis tracked by this adapter.
    (get-total-deposited () (response uint uint))

    ;; Whether new deposits are blocked. Withdrawals are never blocked.
    (is-paused () (response bool uint))
  )
)
