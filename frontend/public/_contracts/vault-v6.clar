;; vault-v6 - SatoshiYields vault.
;; Changes vs vault-v5:
;;   - supports TWO adapter kinds:
;;       * SYNC  (yield-source-v2)        - atomic deposit + withdraw   (Zest Earn)
;;       * ASYNC (yield-source-async-v1)  - deposit + two-phase withdraw (Hermetica hBTC:
;;         request-withdraw -> protocol funds claim -> claim-withdraw, with
;;         cancel-withdraw as an escape hatch)
;;   - per-position `is-async` + `status` (active|pending) + `claim-id`
;;   - rebalance removed (a clean two-tile launch; switch tiles by withdraw + redeposit)
;;   - admin-exit: owner-only forced exit that ALWAYS returns funds to the position
;;     owner (never an owner-chosen address) -- enables bulk migration to an upgraded
;;     vault without ever letting the owner redirect or seize funds.
;; All vault-v5 safety guards are retained: reentrancy lock, TVL cap, one-position
;; per user, owner allowlist, timelocked fee/collector, one-shot sBTC, stale-oracle
;; deposit guard, overflow-guarded fee math. Withdrawals are NEVER blocked by a
;; stale oracle.

(use-trait yield-source-trait       .yield-source-v2.yield-source-v2-trait)
(use-trait yield-source-async-trait .yield-source-async-v1.yield-source-async-v1-trait)
(use-trait sip-010-trait            .sip-010-trait.sip-010-trait)

(define-constant CONTRACT-OWNER   tx-sender)
(define-constant TIMELOCK-BLOCKS  u144)
(define-constant MIN-DEPOSIT      u1000)
(define-constant MAX-FEE-BPS      u1000)

(define-constant STATUS-ACTIVE  u0)
(define-constant STATUS-PENDING u1)

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
(define-constant err-reentrancy         (err u118))
(define-constant err-wrong-kind         (err u119))
(define-constant err-not-active         (err u120))
(define-constant err-not-pending        (err u121))

;; Launch TVL cap ~0.5 sBTC. Owner-adjustable via set-tvl-cap.
(define-data-var tvl-cap          uint u50000000)
(define-data-var total-deposited  uint u0)
(define-data-var fee-basis-points uint u500)
(define-data-var global-paused    bool false)
(define-data-var fee-collector    principal CONTRACT-OWNER)
(define-data-var fee-balance      uint u0)
(define-data-var sbtc-token       (optional principal) none)
(define-data-var reentrancy-lock  bool false)

(define-map pending-fee-bps       uint uint)
(define-map pending-fee-collector uint principal)
(define-map approved-adapters     principal bool)
(define-map async-adapters        principal bool)   ;; approved adapter -> is-async
(define-map adapter-paused-state  principal bool)

(define-map user-position principal
  { adapter:          principal
  , principal-amount: uint
  , deposited-at:     uint
  , is-async:         bool
  , status:           uint
  , claim-id:         uint })

(define-private (assert-owner)
  (if (is-eq tx-sender CONTRACT-OWNER) (ok true) err-not-owner))

(define-private (acquire-lock)
  (begin
    (asserts! (not (var-get reentrancy-lock)) err-reentrancy)
    (var-set reentrancy-lock true)
    (ok true)))

(define-private (release-lock)
  (begin (var-set reentrancy-lock false) true))

(define-private (assert-sbtc (token-principal principal))
  (match (var-get sbtc-token)
    t (if (is-eq token-principal t) (ok true) err-bad-token)
    err-sbtc-not-set))

(define-private (is-async-adapter (adapter principal))
  (default-to false (map-get? async-adapters adapter)))

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

(define-private (compute-fee (yield-amount uint) (bps uint))
  (if (is-eq yield-amount u0)
    (ok u0)
    (begin
      (asserts! (<= yield-amount u340282366920938463463374607431768211) err-fee-overflow)
      (ok (/ (* yield-amount bps) u10000)))))

;; Settle a completed withdrawal (sync or async-claim): given the gross sBTC the
;; adapter forwarded to this vault and the user's original principal, book the
;; performance fee on yield and pay the user. Caller holds the reentrancy lock.
(define-private (settle-withdraw (caller principal) (sbtc <sip-010-trait>)
                                 (principal-amount uint) (gross uint))
  (let ((yield-amount (if (> gross principal-amount) (- gross principal-amount) u0)))
    (let ((fee-amount (try! (compute-fee yield-amount (var-get fee-basis-points)))))
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
        (try! (as-contract (contract-call? sbtc transfer payout tx-sender caller none)))
        (ok { payout: payout, yield: yield-amount, fee: fee-amount })))))

;; Registers the canonical sBTC token. One-shot, owner-only.
(define-public (set-sbtc-token (token principal))
  (begin
    (try! (assert-owner))
    (asserts! (is-none (var-get sbtc-token)) err-sbtc-already-set)
    (var-set sbtc-token (some token))
    (ok token)))

;; ---- SYNC adapter flow (Zest Earn) -----------------------------------------

(define-public (deposit
    (sbtc             <sip-010-trait>)
    (adapter-contract <yield-source-trait>)
    (amount           uint))
  (let
    ((caller            tx-sender)
     (adapter-principal (contract-of adapter-contract)))
    (try! (acquire-lock))
    (try! (assert-sbtc (contract-of sbtc)))
    (try! (assert-deposit-open adapter-principal amount))
    (asserts! (not (is-async-adapter adapter-principal)) err-wrong-kind)
    (asserts! (is-none (map-get? user-position caller)) err-already-active)
    (try! (contract-call? adapter-contract get-apy))
    (try! (contract-call? sbtc transfer amount caller adapter-principal none))
    (try! (contract-call? adapter-contract deposit amount caller))
    (map-set user-position caller
      { adapter:          adapter-principal
      , principal-amount: amount
      , deposited-at:     stacks-block-height
      , is-async:         false
      , status:           STATUS-ACTIVE
      , claim-id:         u0 })
    (var-set total-deposited (+ (var-get total-deposited) amount))
    (release-lock)
    (print { event: "deposit", user: caller, amount: amount
           , adapter: adapter-principal, async: false, block: stacks-block-height })
    (ok amount)))

(define-public (withdraw
    (sbtc             <sip-010-trait>)
    (adapter-contract <yield-source-trait>))
  (let
    ((caller            tx-sender)
     (position          (unwrap! (map-get? user-position caller) err-no-position))
     (adapter-principal (contract-of adapter-contract)))
    (try! (acquire-lock))
    (try! (assert-sbtc (contract-of sbtc)))
    (asserts! (not (get is-async position)) err-wrong-kind)
    (asserts! (is-eq (get adapter position) adapter-principal) err-wrong-adapter)
    (let
      ((principal-amount (get principal-amount position))
       (gross            (try! (contract-call? adapter-contract withdraw
                                 (get principal-amount position) caller sbtc))))
      (let ((result (try! (settle-withdraw caller sbtc principal-amount gross))))
        (release-lock)
        (print { event: "withdraw", user: caller, payout: (get payout result)
               , yield: (get yield result), fee: (get fee result), block: stacks-block-height })
        (ok (get payout result))))))

;; ---- ASYNC adapter flow (Hermetica hBTC) -----------------------------------

(define-public (deposit-async
    (sbtc             <sip-010-trait>)
    (adapter-contract <yield-source-async-trait>)
    (amount           uint))
  (let
    ((caller            tx-sender)
     (adapter-principal (contract-of adapter-contract)))
    (try! (acquire-lock))
    (try! (assert-sbtc (contract-of sbtc)))
    (try! (assert-deposit-open adapter-principal amount))
    (asserts! (is-async-adapter adapter-principal) err-wrong-kind)
    (asserts! (is-none (map-get? user-position caller)) err-already-active)
    (try! (contract-call? adapter-contract get-apy))
    (try! (contract-call? sbtc transfer amount caller adapter-principal none))
    (try! (contract-call? adapter-contract deposit amount caller))
    (map-set user-position caller
      { adapter:          adapter-principal
      , principal-amount: amount
      , deposited-at:     stacks-block-height
      , is-async:         true
      , status:           STATUS-ACTIVE
      , claim-id:         u0 })
    (var-set total-deposited (+ (var-get total-deposited) amount))
    (release-lock)
    (print { event: "deposit", user: caller, amount: amount
           , adapter: adapter-principal, async: true, block: stacks-block-height })
    (ok amount)))

;; Phase 1: begin redemption. Escrows the user's shares with the yield source.
;; No sBTC moves yet. Position becomes pending until claimed or cancelled.
(define-public (request-withdraw
    (adapter-contract <yield-source-async-trait>))
  (let
    ((caller            tx-sender)
     (position          (unwrap! (map-get? user-position caller) err-no-position))
     (adapter-principal (contract-of adapter-contract)))
    (try! (acquire-lock))
    (asserts! (get is-async position) err-wrong-kind)
    (asserts! (is-eq (get adapter position) adapter-principal) err-wrong-adapter)
    (asserts! (is-eq (get status position) STATUS-ACTIVE) err-not-active)
    (let ((claim-id (try! (contract-call? adapter-contract request-withdraw
                            (get principal-amount position) caller))))
      (map-set user-position caller (merge position { status: STATUS-PENDING, claim-id: claim-id }))
      (release-lock)
      (print { event: "withdraw-requested", user: caller, claim-id: claim-id
             , adapter: adapter-principal, block: stacks-block-height })
      (ok claim-id))))

;; Phase 2: complete redemption once the claim is funded + cooled down. The
;; adapter redeems to sBTC and forwards the gross to this vault; we book the fee
;; on yield and pay the user.
(define-public (claim-withdraw
    (sbtc             <sip-010-trait>)
    (adapter-contract <yield-source-async-trait>))
  (let
    ((caller            tx-sender)
     (position          (unwrap! (map-get? user-position caller) err-no-position))
     (adapter-principal (contract-of adapter-contract)))
    (try! (acquire-lock))
    (try! (assert-sbtc (contract-of sbtc)))
    (asserts! (get is-async position) err-wrong-kind)
    (asserts! (is-eq (get adapter position) adapter-principal) err-wrong-adapter)
    (asserts! (is-eq (get status position) STATUS-PENDING) err-not-pending)
    (let
      ((principal-amount (get principal-amount position))
       (gross            (try! (contract-call? adapter-contract claim-withdraw
                                 (get principal-amount position) caller sbtc))))
      (let ((result (try! (settle-withdraw caller sbtc principal-amount gross))))
        (release-lock)
        (print { event: "withdraw-claimed", user: caller, payout: (get payout result)
               , yield: (get yield result), fee: (get fee result), block: stacks-block-height })
        (ok (get payout result))))))

;; Escape hatch: cancel an unfunded pending withdrawal; position returns active.
(define-public (cancel-withdraw
    (adapter-contract <yield-source-async-trait>))
  (let
    ((caller            tx-sender)
     (position          (unwrap! (map-get? user-position caller) err-no-position))
     (adapter-principal (contract-of adapter-contract)))
    (try! (acquire-lock))
    (asserts! (get is-async position) err-wrong-kind)
    (asserts! (is-eq (get adapter position) adapter-principal) err-wrong-adapter)
    (asserts! (is-eq (get status position) STATUS-PENDING) err-not-pending)
    (try! (contract-call? adapter-contract cancel-withdraw (get principal-amount position) caller))
    (map-set user-position caller (merge position { status: STATUS-ACTIVE, claim-id: u0 }))
    (release-lock)
    (print { event: "withdraw-cancelled", user: caller
           , adapter: adapter-principal, block: stacks-block-height })
    (ok true)))

;; ---- Admin-driven migration (forced exit to the position OWNER) -------------
;; Lets the owner evacuate a user's position on demand -- e.g. to migrate every
;; user off this vault onto an upgraded one after a fix. The proceeds are ALWAYS
;; sent to `user` (the position owner), NEVER to an owner-chosen address: the
;; owner controls only WHEN funds exit, never WHERE they go. So even a fully
;; compromised owner key can only return funds to their rightful owner -- it can
;; never redirect or seize them. This keeps the non-custodial guarantee intact
;; while making bulk migration a pure admin operation (no user action, no UI).
;;
;; Sync positions only. An async position is mid-redemption with the external
;; protocol (shares already escrowed against a claim), so it must be finished by
;; the user via claim-withdraw / cancel-withdraw -- the vault cannot safely
;; force it. (Pause new async deposits, let pending claims settle, then exit the
;; now-active ones.)
(define-public (admin-exit
    (user             principal)
    (adapter-contract <yield-source-trait>)
    (sbtc             <sip-010-trait>))
  (let
    ((position          (unwrap! (map-get? user-position user) err-no-position))
     (adapter-principal (contract-of adapter-contract)))
    (try! (assert-owner))
    (try! (acquire-lock))
    (try! (assert-sbtc (contract-of sbtc)))
    (asserts! (not (get is-async position)) err-wrong-kind)
    (asserts! (is-eq (get adapter position) adapter-principal) err-wrong-adapter)
    (let
      ((principal-amount (get principal-amount position))
       (gross            (try! (contract-call? adapter-contract withdraw
                                 (get principal-amount position) user sbtc))))
      ;; settle-withdraw pays `user` (never the owner); books fee on yield only.
      (let ((result (try! (settle-withdraw user sbtc principal-amount gross))))
        (release-lock)
        (print { event: "admin-exit", user: user, payout: (get payout result)
               , yield: (get yield result), fee: (get fee result), block: stacks-block-height })
        (ok (get payout result))))))

;; ---- Owner / fees -----------------------------------------------------------

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

;; Approve an adapter and declare its kind (async = true for two-phase redemption).
(define-public (approve-adapter (adapter principal) (async bool))
  (begin
    (try! (assert-owner))
    (map-set approved-adapters adapter true)
    (map-set async-adapters adapter async)
    (ok adapter)))

(define-public (revoke-adapter (adapter principal))
  (begin
    (try! (assert-owner))
    (map-set approved-adapters adapter false)
    (map-delete async-adapters adapter)
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

;; ---- Read-only --------------------------------------------------------------

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

(define-read-only (is-adapter-async (adapter principal))
  (default-to false (map-get? async-adapters adapter)))

(define-read-only (is-adapter-paused (adapter principal))
  (default-to false (map-get? adapter-paused-state adapter)))

(define-read-only (get-pending-fee-bps (scheduled-at uint))
  (map-get? pending-fee-bps scheduled-at))

(define-read-only (get-pending-fee-collector (scheduled-at uint))
  (map-get? pending-fee-collector scheduled-at))
