(use-trait yield-source-trait .yield-source.yield-source-trait)

(define-constant CONTRACT-OWNER tx-sender)

(define-constant err-not-owner      (err u100))
(define-constant err-global-paused  (err u101))
(define-constant err-adapter-paused (err u102))
(define-constant err-cap-exceeded   (err u103))
(define-constant err-zero-amount    (err u104))
(define-constant err-no-position    (err u105))
(define-constant err-fee-overflow   (err u106))
(define-constant err-not-approved   (err u107))
(define-constant err-wrong-adapter  (err u108))
(define-constant err-already-active (err u109))

(define-data-var tvl-cap          uint u150000000)
(define-data-var total-deposited  uint u0)
(define-data-var fee-basis-points uint u500)
(define-data-var global-paused    bool false)
(define-data-var fee-collector    principal CONTRACT-OWNER)
(define-data-var fee-balance      uint u0)

(define-map approved-adapters    principal bool)
(define-map adapter-paused-state principal bool)

(define-map user-position principal
  { adapter:          principal
  , principal-amount: uint
  , deposited-at:     uint })

(define-private (assert-owner)
  (if (is-eq tx-sender CONTRACT-OWNER)
    (ok true)
    err-not-owner))

(define-private (assert-deposit-open (adapter-principal principal) (amount uint))
  (if (var-get global-paused)
    err-global-paused
    (if (<= amount u0)
      err-zero-amount
      (if (not (default-to false (map-get? approved-adapters adapter-principal)))
        err-not-approved
        (if (default-to false (map-get? adapter-paused-state adapter-principal))
          err-adapter-paused
          (if (> (+ (var-get total-deposited) amount) (var-get tvl-cap))
            err-cap-exceeded
            (ok true)))))))

;; Lighter check for rebalance: destination adapter must be approved and unpaused.
;; Skips TVL-cap because total-deposited does not change during a rebalance.
(define-private (assert-rebalance-open (adapter-principal principal))
  (if (var-get global-paused)
    err-global-paused
    (if (not (default-to false (map-get? approved-adapters adapter-principal)))
      err-not-approved
      (if (default-to false (map-get? adapter-paused-state adapter-principal))
        err-adapter-paused
        (ok true)))))

;; Deposit `amount` satoshis into the chosen adapter.
;; Devnet/testnet token: .mock-sbtc
;; Mainnet token: 'SM3KNVZS30WM7F89SXKVVFY4SN9RMPZZ9FX929CCA.sbtc-token
(define-public (deposit (adapter-contract <yield-source-trait>) (amount uint))
  (let
    ((caller            tx-sender)
     (adapter-principal (contract-of adapter-contract)))
    (try! (assert-deposit-open adapter-principal amount))
    (asserts! (is-none (map-get? user-position caller)) err-already-active)
    (try! (contract-call? .mock-sbtc transfer amount caller (as-contract tx-sender) none))
    (try! (contract-call? adapter-contract deposit amount caller))
    (map-set user-position caller
      { adapter:          adapter-principal
      , principal-amount: amount
      , deposited-at:     stacks-block-height })
    (var-set total-deposited (+ (var-get total-deposited) amount))
    (print { event: "deposit", user: caller, amount: amount
           , adapter: adapter-principal, block: stacks-block-height })
    (ok amount)))

;; Withdraw the caller's full position.
;; Withdrawals are never blocked by pause flags.
(define-public (withdraw (adapter-contract <yield-source-trait>))
  (let
    ((caller            tx-sender)
     (position          (unwrap! (map-get? user-position caller) err-no-position))
     (adapter-principal (contract-of adapter-contract)))
    (asserts! (is-eq (get adapter position) adapter-principal) err-wrong-adapter)
    (let
      ((principal-amount (get principal-amount position))
       (gross            (try! (contract-call? adapter-contract withdraw principal-amount caller))))
      (let
        ((yield-amount (if (> gross principal-amount) (- gross principal-amount) u0))
         ;; Ceiling division so small yields still pay a fee (rounds up, not down)
         (fee-amount   (/ (+ (* yield-amount (var-get fee-basis-points)) u9999) u10000)))
        (asserts! (<= fee-amount yield-amount) err-fee-overflow)
        (let ((payout (- gross fee-amount)))
          (try! (as-contract
            (contract-call? .mock-sbtc transfer payout tx-sender caller none)))
          (if (> fee-amount u0)
            (var-set fee-balance (+ (var-get fee-balance) fee-amount))
            true)
          (map-delete user-position caller)
          (var-set total-deposited
            (if (>= (var-get total-deposited) principal-amount)
              (- (var-get total-deposited) principal-amount)
              u0))
          (print { event: "withdraw", user: caller, payout: payout
                 , yield: yield-amount, fee: fee-amount, block: stacks-block-height })
          (ok payout))))))

;; Move position from one adapter to another.
;; All steps use try! so the entire transaction reverts if any step fails.
(define-public (rebalance
    (from-adapter <yield-source-trait>)
    (to-adapter   <yield-source-trait>))
  (let
    ((caller          tx-sender)
     (position        (unwrap! (map-get? user-position caller) err-no-position))
     (from-principal  (contract-of from-adapter))
     (to-principal    (contract-of to-adapter)))
    (asserts! (is-eq (get adapter position) from-principal) err-wrong-adapter)
    (let ((amount (get principal-amount position)))
      (try! (assert-rebalance-open to-principal))
      (try! (contract-call? from-adapter withdraw amount caller))
      (try! (contract-call? to-adapter deposit amount caller))
      (map-set user-position caller
        (merge position { adapter: to-principal, deposited-at: stacks-block-height }))
      (print { event: "rebalance", user: caller, amount: amount
             , from: from-principal, to: to-principal, block: stacks-block-height })
      (ok amount))))

(define-public (collect-fee)
  (let ((amount (var-get fee-balance)))
    (try! (assert-owner))
    (asserts! (> amount u0) err-zero-amount)
    (var-set fee-balance u0)
    (try! (as-contract
      (contract-call? .mock-sbtc transfer amount tx-sender (var-get fee-collector) none)))
    (ok amount)))

(define-public (set-tvl-cap (new-cap uint))
  (begin
    (try! (assert-owner))
    (asserts! (> new-cap u0) err-zero-amount)
    (var-set tvl-cap new-cap)
    (ok new-cap)))

(define-public (set-global-paused (val bool))
  (begin
    (try! (assert-owner))
    (var-set global-paused val)
    (ok val)))

(define-public (set-adapter-paused (adapter principal) (val bool))
  (begin
    (try! (assert-owner))
    (map-set adapter-paused-state adapter val)
    (ok val)))

(define-public (approve-adapter (adapter principal))
  (begin
    (try! (assert-owner))
    (map-set approved-adapters adapter true)
    (ok adapter)))

(define-public (revoke-adapter (adapter principal))
  (begin
    (try! (assert-owner))
    (map-set approved-adapters adapter false)
    (ok adapter)))

(define-public (set-fee-collector (new-collector principal))
  (begin
    (try! (assert-owner))
    (var-set fee-collector new-collector)
    (ok new-collector)))

(define-public (set-fee-basis-points (bps uint))
  (begin
    (try! (assert-owner))
    (asserts! (<= bps u1000) err-fee-overflow)
    (var-set fee-basis-points bps)
    (ok bps)))

(define-read-only (get-position (user principal))
  (map-get? user-position user))

(define-read-only (get-tvl-cap)           (var-get tvl-cap))
(define-read-only (get-total-deposited)   (var-get total-deposited))
(define-read-only (get-fee-balance)       (var-get fee-balance))
(define-read-only (get-owner)             CONTRACT-OWNER)

(define-read-only (is-adapter-approved (adapter principal))
  (default-to false (map-get? approved-adapters adapter)))

(define-read-only (is-adapter-paused (adapter principal))
  (default-to false (map-get? adapter-paused-state adapter)))
