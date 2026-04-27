;; Records deposit, withdrawal, and rebalance events for off-chain indexing.
;; This contract is write-gated by an authorized vault address set on initialization.

(define-constant err-not-vault         (err u100))
(define-constant err-no-record         (err u101))
(define-constant err-already-init      (err u102))
(define-constant err-not-owner         (err u103))

(define-constant CONTRACT-OWNER tx-sender)

(define-data-var vault-principal (optional principal) none)

(define-map position-record principal
  { principal-sats: uint
  , accrued-yield:  uint
  , adapter:        principal
  , last-updated:   uint
  , deposit-count:  uint })

(define-map event-log
  { user: principal, seq: uint }
  { kind:   (string-ascii 12)
  , amount: uint
  , block:  uint
  , adapter: principal })

(define-map event-seq principal uint)

;; Called once by the deployer after both vault and yield-tracker are deployed.
(define-public (initialize (vault principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) err-not-owner)
    (asserts! (is-none (var-get vault-principal)) err-already-init)
    (var-set vault-principal (some vault))
    (ok vault)))

(define-private (assert-vault)
  (match (var-get vault-principal)
    authorized (if (is-eq contract-caller authorized) (ok true) err-not-vault)
    err-not-vault))

(define-private (next-seq (user principal))
  (let ((seq (default-to u0 (map-get? event-seq user))))
    (map-set event-seq user (+ seq u1))
    seq))

(define-public (record-deposit (user principal) (amount uint) (adapter principal))
  (begin
    (try! (assert-vault))
    (let ((seq (next-seq user)))
      (map-set event-log { user: user, seq: seq }
        { kind: "deposit", amount: amount, block: stacks-block-height, adapter: adapter })
      (map-set position-record user
        { principal-sats: amount
        , accrued-yield:  u0
        , adapter:        adapter
        , last-updated:   stacks-block-height
        , deposit-count:
            (+ (default-to u0
                 (get deposit-count (map-get? position-record user)))
               u1) })
      (ok seq))))

(define-public (record-withdraw (user principal) (gross-returned uint))
  (begin
    (try! (assert-vault))
    (let
      ((record (unwrap! (map-get? position-record user) err-no-record))
       (seq    (next-seq user))
       (yield  (if (> gross-returned (get principal-sats record))
                 (- gross-returned (get principal-sats record))
                 u0)))
      (map-set event-log { user: user, seq: seq }
        { kind: "withdraw", amount: gross-returned, block: stacks-block-height
        , adapter: (get adapter record) })
      (map-set position-record user
        (merge record { accrued-yield: (+ (get accrued-yield record) yield)
                      , last-updated: stacks-block-height }))
      (ok yield))))

(define-public (record-rebalance
    (user         principal)
    (amount       uint)
    (from-adapter principal)
    (to-adapter   principal))
  (begin
    (try! (assert-vault))
    (let
      ((record (unwrap! (map-get? position-record user) err-no-record))
       (seq    (next-seq user)))
      (map-set event-log { user: user, seq: seq }
        { kind: "rebalance", amount: amount, block: stacks-block-height, adapter: to-adapter })
      (map-set position-record user
        (merge record { adapter: to-adapter, last-updated: stacks-block-height }))
      (ok seq))))

(define-read-only (get-position-record (user principal))
  (map-get? position-record user))

(define-read-only (get-event (user principal) (seq uint))
  (map-get? event-log { user: user, seq: seq }))

(define-read-only (get-event-count (user principal))
  (default-to u0 (map-get? event-seq user)))
