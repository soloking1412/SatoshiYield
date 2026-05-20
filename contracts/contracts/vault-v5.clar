;; vault-v5 - SatoshiYields vault.
;; Changes vs vault-v4:
;;   - the sBTC token is passed as a SIP-010 trait and validated against a
;;     one-shot sbtc-token var, so the SAME contract runs on testnet
;;     (.mock-sbtc) and mainnet (real sbtc-token) - no source edit
;;   - rebalance rejects a destination adapter with a stale oracle
;;   - rebalance re-checks the TVL cap
;;   - collect-fee returns a dedicated error when there is nothing to collect

(use-trait yield-source-trait .yield-source-v2.yield-source-v2-trait)
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

(define-constant CONTRACT-OWNER   tx-sender)
(define-constant TIMELOCK-BLOCKS  u144)
(define-constant MIN-DEPOSIT      u1000)
(define-constant MAX-FEE-BPS      u1000)

(define-constant err-not-owner          (err u100))
(define-constant err-global-paused      (err u101))
(define-constant err-adapter-paused     (err u102))
(define-constant err-cap-exceeded       (err u103))
(define-constant err-below-min          (err u104))
(define-constant err-no-position        (err u105))
(define-constant err-fee-overflow       (err u106))
(define-constant err-not-approved       (err u107))
(define-constant err-wrong-adapter      (err u108))
(define-constant err-already-active     (err u109))
(define-constant err-timelock           (err u110))
(define-constant err-no-pending         (err u111))
(define-constant err-stale-oracle       (err u112))
(define-constant err-nothing-to-collect (err u113))
(define-constant err-sbtc-not-set       (err u114))
(define-constant err-bad-token          (err u115))
(define-constant err-sbtc-already-set   (err u116))
(define-constant err-same-adapter       (err u117))

(define-data-var tvl-cap          uint u150000000)
(define-data-var total-deposited  uint u0)
(define-data-var fee-basis-points uint u500)
(define-data-var global-paused    bool false)
(define-data-var fee-collector    principal CONTRACT-OWNER)
(define-data-var fee-balance      uint u0)
(define-data-var sbtc-token       (optional principal) none)

(define-map pending-fee-bps       uint uint)
(define-map pending-fee-collector uint principal)
(define-map approved-adapters     principal bool)
(define-map adapter-paused-state  principal bool)

(define-map user-position principal
  { adapter:          principal
  , principal-amount: uint
  , deposited-at:     uint })

(define-private (assert-owner)
  (if (is-eq tx-sender CONTRACT-OWNER) (ok true) err-not-owner))

;; The caller hands the token in as a trait; this confirms it is the one
;; canonical sBTC contract registered at init.
(define-private (assert-sbtc (token-principal principal))
  (match (var-get sbtc-token)
    t (if (is-eq token-principal t) (ok true) err-bad-token)
    err-sbtc-not-set))

(define-private (assert-deposit-open (adapter-principal principal) (amount uint))
  (if (var-get global-paused)
    err-global-paused
    (if (< amount MIN-DEPOSIT)
      err-below-min
      (if (not (default-to false (map-get? approved-adapters adapter-principal)))
        err-not-approved
        (if (default-to false (map-get? adapter-paused-state adapter-principal))
          err-adapter-paused
          (if (> (+ (var-get total-deposited) amount) (var-get tvl-cap))
            err-cap-exceeded
            (ok true)))))))

(define-private (assert-rebalance-open (adapter-principal principal))
  (if (var-get global-paused)
    err-global-paused
    (if (not (default-to false (map-get? approved-adapters adapter-principal)))
      err-not-approved
      (if (default-to false (map-get? adapter-paused-state adapter-principal))
        err-adapter-paused
        (ok true)))))

(define-private (compute-fee (yield-amount uint) (bps uint))
  (if (is-eq yield-amount u0)
    (ok u0)
    (begin
      (asserts! (<= yield-amount u340282366920938463463374607431768211) err-fee-overflow)
      (ok (/ (* yield-amount bps) u10000)))))

;; Registers the canonical sBTC token. One-shot, owner-only.
(define-public (set-sbtc-token (token principal))
  (begin
    (try! (assert-owner))
    (asserts! (is-none (var-get sbtc-token)) err-sbtc-already-set)
    (var-set sbtc-token (some token))
    (ok token)))

(define-public (deposit
    (sbtc             <sip-010-trait>)
    (adapter-contract <yield-source-trait>)
    (amount           uint))
  (let
    ((caller            tx-sender)
     (adapter-principal (contract-of adapter-contract)))
    (try! (assert-sbtc (contract-of sbtc)))
    (try! (assert-deposit-open adapter-principal amount))
    (asserts! (is-none (map-get? user-position caller)) err-already-active)
    (try! (contract-call? adapter-contract get-apy))
    (try! (contract-call? sbtc transfer amount caller adapter-principal none))
    (try! (contract-call? adapter-contract deposit amount caller))
    (map-set user-position caller
      { adapter:          adapter-principal
      , principal-amount: amount
      , deposited-at:     stacks-block-height })
    (var-set total-deposited (+ (var-get total-deposited) amount))
    (print { event: "deposit", user: caller, amount: amount
           , adapter: adapter-principal, block: stacks-block-height })
    (ok amount)))

(define-public (withdraw
    (sbtc             <sip-010-trait>)
    (adapter-contract <yield-source-trait>))
  (let
    ((caller            tx-sender)
     (position          (unwrap! (map-get? user-position caller) err-no-position))
     (adapter-principal (contract-of adapter-contract)))
    (try! (assert-sbtc (contract-of sbtc)))
    (asserts! (is-eq (get adapter position) adapter-principal) err-wrong-adapter)
    (let
      ((principal-amount (get principal-amount position))
       (gross            (try! (contract-call? adapter-contract withdraw principal-amount caller sbtc))))
      (let
        ((yield-amount (if (> gross principal-amount) (- gross principal-amount) u0))
         (fee-amount   (try! (compute-fee yield-amount (var-get fee-basis-points)))))
        (asserts! (<= fee-amount yield-amount) err-fee-overflow)
        (let ((payout (- gross fee-amount)))
          (map-delete user-position caller)
          (var-set total-deposited
            (if (>= (var-get total-deposited) principal-amount)
              (- (var-get total-deposited) principal-amount)
              u0))
          (if (> fee-amount u0)
            (var-set fee-balance (+ (var-get fee-balance) fee-amount))
            true)
          (try! (as-contract
            (contract-call? sbtc transfer payout tx-sender caller none)))
          (print { event: "withdraw", user: caller, payout: payout
                 , yield: yield-amount, fee: fee-amount, block: stacks-block-height })
          (ok payout))))))

(define-public (rebalance
    (sbtc         <sip-010-trait>)
    (from-adapter <yield-source-trait>)
    (to-adapter   <yield-source-trait>))
  (let
    ((caller         tx-sender)
     (position       (unwrap! (map-get? user-position caller) err-no-position))
     (from-principal (contract-of from-adapter))
     (to-principal   (contract-of to-adapter)))
    (try! (assert-sbtc (contract-of sbtc)))
    (asserts! (is-eq (get adapter position) from-principal) err-wrong-adapter)
    (asserts! (not (is-eq from-principal to-principal)) err-same-adapter)
    (try! (assert-rebalance-open to-principal))
    ;; Reject moving funds into an adapter whose oracle APY is stale -
    ;; the same guard deposit enforces.
    (try! (contract-call? to-adapter get-apy))
    (let ((amount (get principal-amount position)))
      (let ((gross (try! (contract-call? from-adapter withdraw amount caller sbtc))))
        (let ((new-total (+ (if (>= (var-get total-deposited) amount)
                              (- (var-get total-deposited) amount)
                              u0)
                            gross)))
          (asserts! (<= new-total (var-get tvl-cap)) err-cap-exceeded)
          (try! (as-contract
            (contract-call? sbtc transfer gross tx-sender to-principal none)))
          (try! (contract-call? to-adapter deposit gross caller))
          (map-set user-position caller
            (merge position
              { adapter:          to-principal
              , principal-amount: gross
              , deposited-at:     stacks-block-height }))
          (var-set total-deposited new-total)
          (print { event: "rebalance", user: caller, gross: gross
                 , from: from-principal, to: to-principal, block: stacks-block-height })
          (ok gross))))))

(define-public (collect-fee (sbtc <sip-010-trait>))
  (let ((amount (var-get fee-balance)))
    (try! (assert-owner))
    (try! (assert-sbtc (contract-of sbtc)))
    (asserts! (> amount u0) err-nothing-to-collect)
    (var-set fee-balance u0)
    (try! (as-contract
      (contract-call? sbtc transfer amount tx-sender (var-get fee-collector) none)))
    (print { event: "fee-collected", amount: amount, block: stacks-block-height })
    (ok amount)))

(define-public (set-tvl-cap (new-cap uint))
  (begin
    (try! (assert-owner))
    (asserts! (>= new-cap (var-get total-deposited)) err-cap-exceeded)
    (asserts! (> new-cap u0) err-below-min)
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

(define-public (schedule-fee-basis-points (bps uint))
  (let ((effective-at (+ stacks-block-height TIMELOCK-BLOCKS)))
    (try! (assert-owner))
    (asserts! (<= bps MAX-FEE-BPS) err-fee-overflow)
    (map-set pending-fee-bps effective-at bps)
    (print { event: "fee-bps-scheduled", bps: bps, effective-at: effective-at })
    (ok effective-at)))

(define-public (apply-fee-basis-points (scheduled-at uint))
  (begin
    (asserts! (>= stacks-block-height scheduled-at) err-timelock)
    (let ((bps (unwrap! (map-get? pending-fee-bps scheduled-at) err-no-pending)))
      (map-delete pending-fee-bps scheduled-at)
      (var-set fee-basis-points bps)
      (print { event: "fee-bps-applied", bps: bps, block: stacks-block-height })
      (ok bps))))

(define-public (schedule-fee-collector (new-collector principal))
  (let ((effective-at (+ stacks-block-height TIMELOCK-BLOCKS)))
    (try! (assert-owner))
    (map-set pending-fee-collector effective-at new-collector)
    (print { event: "fee-collector-scheduled"
           , collector: new-collector, effective-at: effective-at })
    (ok effective-at)))

(define-public (apply-fee-collector (scheduled-at uint))
  (begin
    (asserts! (>= stacks-block-height scheduled-at) err-timelock)
    (let ((collector (unwrap! (map-get? pending-fee-collector scheduled-at) err-no-pending)))
      (map-delete pending-fee-collector scheduled-at)
      (var-set fee-collector collector)
      (print { event: "fee-collector-applied"
             , collector: collector, block: stacks-block-height })
      (ok collector))))

(define-read-only (get-position (user principal))
  (map-get? user-position user))

(define-read-only (get-sbtc-token)        (var-get sbtc-token))
(define-read-only (get-tvl-cap)           (var-get tvl-cap))
(define-read-only (get-total-deposited)   (var-get total-deposited))
(define-read-only (get-fee-balance)       (var-get fee-balance))
(define-read-only (get-fee-basis-points)  (var-get fee-basis-points))
(define-read-only (get-owner)             CONTRACT-OWNER)
(define-read-only (get-min-deposit)       MIN-DEPOSIT)
(define-read-only (get-timelock-blocks)   TIMELOCK-BLOCKS)

(define-read-only (is-adapter-approved (adapter principal))
  (default-to false (map-get? approved-adapters adapter)))

(define-read-only (is-adapter-paused (adapter principal))
  (default-to false (map-get? adapter-paused-state adapter)))

(define-read-only (get-pending-fee-bps (scheduled-at uint))
  (map-get? pending-fee-bps scheduled-at))

(define-read-only (get-pending-fee-collector (scheduled-at uint))
  (map-get? pending-fee-collector scheduled-at))
