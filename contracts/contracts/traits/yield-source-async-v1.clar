;; yield-source-async-v1 trait.
;; For yield sources whose REDEMPTION is asynchronous (e.g. Hermetica hBTC:
;; request-redeem -> protocol funds the claim after a cooldown -> redeem).
;;
;; Deposit is synchronous (atomic). Withdrawal is two-phase:
;;   request-withdraw -> (off-chain: protocol funds the claim) -> claim-withdraw
;; with cancel-withdraw as an escape hatch while the claim is unfunded, so user
;; funds are never lost (worst case the user stays in the yield position).
;;
;; The adapter tracks the per-user claim id internally; the vault only needs the
;; user principal and the position's principal-amount.

(use-trait sip-010 .sip-010-trait.sip-010-trait)

(define-trait yield-source-async-v1-trait
  (
    ;; Record a synchronous deposit of `amount` sats for `user`.
    ;; Returns the internal share units allocated.
    (deposit (uint principal) (response uint uint))

    ;; Begin an asynchronous withdrawal of `user`'s full position.
    ;; Escrows the user's shares with the yield source and returns an opaque
    ;; claim id (for events / UI). Moves no sBTC.
    (request-withdraw (uint principal) (response uint uint))

    ;; Complete a previously-requested withdrawal: redeem the funded claim to
    ;; sBTC and transfer the gross proceeds to the vault. Returns gross sats.
    (claim-withdraw (uint principal <sip-010>) (response uint uint))

    ;; Cancel a pending (unfunded) withdrawal; restores the user's shares so the
    ;; position is active again. Moves no sBTC.
    (cancel-withdraw (uint principal) (response bool uint))

    ;; Current yield rate in basis points (10000 = 100.00 %). Oracle-pushed.
    (get-apy () (response uint uint))

    ;; Total sats currently held for all users (principal + accrued yield).
    (get-total-deposited () (response uint uint))

    ;; Whether new deposits are blocked. Withdrawals are never blocked.
    (is-paused () (response bool uint))
  )
)
