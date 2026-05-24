;; zest-adapter-v5 -- SatoshiYields yield-source adapter with time-weighted yield accrual.
;; Changes vs v4:
;;   - Tracks deposit-block per user so elapsed time can be computed on withdraw
;;   - Maintains a yield-reserve (sBTC pre-funded by admin) to pay real yield
;;   - withdraw returns principal + accrued yield (capped at reserve balance)
;;   - add-yield-reserve: owner deposits sBTC into the contract's yield pool
;;   - get-apy (read-only) and oracle/consensus logic unchanged from v4

(impl-trait .yield-source-v2.yield-source-v2-trait)
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

(define-constant CONTRACT-OWNER     tx-sender)
(define-constant APY-CAP            u100000)
(define-constant STALE-BLOCKS       u720)
(define-constant CONSENSUS-TOL-PCT  u10)
(define-constant MAX-DEVIATION-PCT  u50)
(define-constant ORACLE-COUNT       u3)
;; ~144 blocks/day x 365 days = 52,560 blocks/year on Stacks
(define-constant BLOCKS-PER-YEAR    u52560)

(define-constant err-not-owner      (err u100))
(define-constant err-paused         (err u101))
(define-constant err-zero-amount    (err u102))
(define-constant err-not-vault      (err u103))
(define-constant err-insufficient   (err u104))
(define-constant err-already-init   (err u105))
(define-constant err-apy-too-high   (err u106))
(define-constant err-stale-apy      (err u107))
(define-constant err-no-consensus   (err u108))
(define-constant err-deviation      (err u109))
(define-constant err-bad-oracle-idx (err u110))

(define-data-var adapter-paused     bool false)
(define-data-var current-apy-bps    uint u0)
(define-data-var total-shares       uint u0)
(define-data-var authorized-vault   (optional principal) none)
(define-data-var last-updated-block uint u0)
(define-data-var yield-reserve      uint u0)

(define-map oracle-principals   uint principal)
(define-map oracle-reports      uint uint)
(define-map oracle-report-block uint uint)
(define-map user-shares         principal uint)
(define-map user-deposit-block  principal uint)

(define-private (assert-vault)
  (match (var-get authorized-vault)
    v (if (is-eq contract-caller v) (ok true) err-not-vault)
    err-not-vault))

(define-private (assert-owner)
  (if (is-eq tx-sender CONTRACT-OWNER) (ok true) err-not-owner))

(define-private (is-oracle (caller principal))
  (or (is-eq caller (default-to 'SP000000000000000000002Q6VF78 (map-get? oracle-principals u0)))
      (is-eq caller (default-to 'SP000000000000000000002Q6VF78 (map-get? oracle-principals u1)))
      (is-eq caller (default-to 'SP000000000000000000002Q6VF78 (map-get? oracle-principals u2)))))

(define-private (oracle-index-of (caller principal))
  (if (is-eq caller (default-to 'SP000000000000000000002Q6VF78 (map-get? oracle-principals u0)))
    (some u0)
    (if (is-eq caller (default-to 'SP000000000000000000002Q6VF78 (map-get? oracle-principals u1)))
      (some u1)
      (if (is-eq caller (default-to 'SP000000000000000000002Q6VF78 (map-get? oracle-principals u2)))
        (some u2)
        none))))

(define-private (abs-diff (a uint) (b uint))
  (if (>= a b) (- a b) (- b a)))

(define-private (is-fresh (idx uint))
  (let ((b (default-to u0 (map-get? oracle-report-block idx))))
    (and (> b u0) (<= (- stacks-block-height b) STALE-BLOCKS))))

(define-private (try-commit-consensus (new-bps uint))
  (let
    ((r0    (default-to u0 (map-get? oracle-reports u0)))
     (r1    (default-to u0 (map-get? oracle-reports u1)))
     (r2    (default-to u0 (map-get? oracle-reports u2)))
     (live0 (is-fresh u0))
     (live1 (is-fresh u1))
     (live2 (is-fresh u2)))
    (if (and live0 live1 (<= (* u100 (abs-diff r0 r1)) (* CONSENSUS-TOL-PCT r1)))
      (ok (/ (+ r0 r1) u2))
      (if (and live0 live2 (<= (* u100 (abs-diff r0 r2)) (* CONSENSUS-TOL-PCT r2)))
        (ok (/ (+ r0 r2) u2))
        (if (and live1 live2 (<= (* u100 (abs-diff r1 r2)) (* CONSENSUS-TOL-PCT r2)))
          (ok (/ (+ r1 r2) u2))
          err-no-consensus)))))

(define-public (set-vault (vault principal))
  (begin
    (try! (assert-owner))
    (asserts! (is-none (var-get authorized-vault)) err-already-init)
    (var-set authorized-vault (some vault))
    (ok vault)))

(define-public (deposit (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (asserts! (not (var-get adapter-paused)) err-paused)
    (asserts! (> amount u0) err-zero-amount)
    (let ((existing (default-to u0 (map-get? user-shares user))))
      (map-set user-shares user (+ existing amount))
      (map-set user-deposit-block user stacks-block-height)
      (var-set total-shares (+ (var-get total-shares) amount))
      (ok amount))))

(define-public (withdraw (amount uint) (user principal) (sbtc <sip-010-trait>))
  (begin
    (try! (assert-vault))
    (let ((shares        (default-to u0 (map-get? user-shares user)))
          (deposit-block (default-to stacks-block-height (map-get? user-deposit-block user)))
          (reserve       (var-get yield-reserve)))
      (asserts! (>= shares amount) err-insufficient)
      (let ((elapsed   (- stacks-block-height deposit-block))
            (raw-yield (/ (* (* amount (var-get current-apy-bps)) elapsed)
                           (* u10000 BLOCKS-PER-YEAR))))
        (let ((payout-yield (if (> raw-yield reserve) reserve raw-yield))
              (gross         (+ amount payout-yield)))
          (map-set user-shares user (- shares amount))
          (map-delete user-deposit-block user)
          (var-set total-shares
            (if (>= (var-get total-shares) amount)
              (- (var-get total-shares) amount) u0))
          (var-set yield-reserve (- reserve payout-yield))
          (let ((vault (unwrap! (var-get authorized-vault) err-not-vault)))
            (try! (as-contract
              (contract-call? sbtc transfer gross tx-sender vault none)))
            (ok gross)))))))

;; Owner deposits sBTC into this contract as the yield reserve pool.
(define-public (add-yield-reserve (amount uint) (sbtc <sip-010-trait>))
  (begin
    (try! (assert-owner))
    (asserts! (> amount u0) err-zero-amount)
    (try! (contract-call? sbtc transfer amount tx-sender (as-contract tx-sender) none))
    (var-set yield-reserve (+ (var-get yield-reserve) amount))
    (ok amount)))

(define-public (set-apy (bps uint))
  (let ((caller tx-sender))
    (asserts! (is-oracle caller) err-not-owner)
    (asserts! (<= bps APY-CAP) err-apy-too-high)
    (let ((current (var-get current-apy-bps))
          (idx     (unwrap! (oracle-index-of caller) err-not-owner)))
      (asserts!
        (or (is-eq current u0)
            (<= (* u100 (abs-diff bps current)) (* MAX-DEVIATION-PCT current)))
        err-deviation)
      (map-set oracle-reports      idx bps)
      (map-set oracle-report-block idx stacks-block-height)
      (match (try-commit-consensus bps)
        committed-bps (begin
          (var-set current-apy-bps committed-bps)
          (var-set last-updated-block stacks-block-height)
          (ok committed-bps))
        e (ok (var-get current-apy-bps))))))

(define-public (set-oracle-at (idx uint) (oracle principal))
  (begin
    (try! (assert-owner))
    (asserts! (< idx ORACLE-COUNT) err-bad-oracle-idx)
    (map-set oracle-principals idx oracle)
    (ok oracle)))

(define-public (set-paused (val bool))
  (begin
    (try! (assert-owner))
    (var-set adapter-paused val)
    (ok val)))

(define-read-only (get-apy)
  (let ((last (var-get last-updated-block)))
    (if (> stacks-block-height (+ last STALE-BLOCKS))
      err-stale-apy
      (ok (var-get current-apy-bps)))))

(define-read-only (get-total-deposited)    (ok (var-get total-shares)))
(define-read-only (get-yield-reserve)      (ok (var-get yield-reserve)))
(define-read-only (is-paused)              (ok (var-get adapter-paused)))
(define-read-only (get-last-updated-block) (ok (var-get last-updated-block)))

(define-read-only (get-oracle-report (idx uint))
  (ok { bps:   (default-to u0 (map-get? oracle-reports idx))
      , block: (default-to u0 (map-get? oracle-report-block idx)) }))

(define-read-only (get-oracle (idx uint))
  (map-get? oracle-principals idx))

(define-read-only (get-shares (user principal))
  (default-to u0 (map-get? user-shares user)))

(define-read-only (get-deposit-block (user principal))
  (map-get? user-deposit-block user))
