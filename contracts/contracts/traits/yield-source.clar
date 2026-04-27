(define-trait yield-source-trait
  (
    ;; Record a deposit of `amount` satoshis for `user`.
    ;; Returns the internal share units allocated.
    (deposit (uint principal) (response uint uint))

    ;; Record a withdrawal for `user` of `amount` satoshis worth of shares.
    ;; Returns the satoshi amount the caller should send back to the user.
    (withdraw (uint principal) (response uint uint))

    ;; Current yield rate in basis points (10000 = 100.00 %).
    ;; Value is pushed by an authorized oracle; never computed on-chain.
    (get-apy () (response uint uint))

    ;; Total satoshis tracked by this adapter.
    (get-total-deposited () (response uint uint))

    ;; Whether new deposits are blocked. Withdrawals are never blocked.
    (is-paused () (response bool uint))
  )
)
