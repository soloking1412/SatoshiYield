;; ADVERSARIAL TEST ONLY: actively attempts a second vault call from a strategy.
(impl-trait .yield-source-v2.yield-source-v2-trait)
(use-trait token .sip-010-trait.sip-010-trait)
(define-public (deposit (amount uint) (user principal))
  (as-contract (contract-call? .vault-v7 deposit .mock-sbtc .mock-sync-v7 u1000 u1 u500)))
(define-public (withdraw (amount uint) (user principal) (asset <token>)) (ok u0))
(define-read-only (get-apy) (ok u400))
(define-read-only (get-total-deposited) (ok u0))
(define-read-only (is-paused) (ok false))
