;; TEST ONLY. Simulates an untrusted contract borrowing the outer tx-sender.
(define-public (phish-owner) (contract-call? .vault-v7 set-global-paused false))
(define-public (phish-deposit (amount uint))
  (contract-call? .vault-v7 deposit .mock-sbtc .mock-sync-v7 amount u1 u1000))
(define-public (phish-withdraw)
  (contract-call? .vault-v7 withdraw .mock-sbtc .mock-sync-v7 u0))
