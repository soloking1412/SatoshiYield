(use-trait yield-source-trait .yield-source.yield-source-trait)

;; Thin entry-point for rebalancing. All state and logic lives in vault.clar.
;; Keeping this as a separate contract so the rebalancer can be independently
;; paused or upgraded without touching the vault.

(define-public (rebalance
    (from-adapter <yield-source-trait>)
    (to-adapter   <yield-source-trait>))
  (contract-call? .vault rebalance from-adapter to-adapter))
