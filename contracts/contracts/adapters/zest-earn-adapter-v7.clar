;; Candidate Zest adapter for a NEW v7 deployment, not released or fork-validated.
;; Mainnet dependencies are immutable literal principals. Never deploy test shims.
;; The strategy can lose funds or restrict liquidity. No principal guarantee.
;; Returns actual credited share units for v7 min-shares checks.
(impl-trait .yield-source-v2.yield-source-v2-trait)
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

(define-constant CONTRACT-OWNER     tx-sender)
(define-constant APY-CAP            u6000)
(define-constant STALE-BLOCKS       u144) ;; Bitcoin burn blocks
(define-constant CONSENSUS-TOL-PCT  u10)
(define-constant MAX-DEVIATION-PCT  u50)
(define-constant ORACLE-COUNT       u3)
(define-constant SLIPPAGE-BPS       u100)

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
(define-constant err-no-shares      (err u120))
(define-constant err-bad-token      (err u122))
(define-constant err-duplicate      (err u123))

(define-data-var adapter-paused     bool true)
(define-data-var current-apy-bps    uint u0)
(define-data-var total-shares       uint u0)
(define-data-var authorized-vault   (optional principal) none)
(define-data-var last-updated-block uint u0)

(define-map oracle-principals   uint principal)
(define-map oracle-reports      uint uint)
(define-map oracle-report-block uint uint)
(define-map user-shares         principal uint)

(define-private (assert-vault)
  (match (var-get authorized-vault)
    v (if (is-eq contract-caller v) (ok true) err-not-vault)
    err-not-vault))

(define-private (assert-owner)
  (if (is-eq contract-caller CONTRACT-OWNER) (ok true) err-not-owner))

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
    (and (> b u0) (<= (- burn-block-height b) STALE-BLOCKS))))

(define-private (try-commit-consensus (new-bps uint))
  (let
    ((r0    (default-to u0 (map-get? oracle-reports u0)))
     (r1    (default-to u0 (map-get? oracle-reports u1)))
     (r2    (default-to u0 (map-get? oracle-reports u2)))
     (live0 (is-fresh u0))
     (live1 (is-fresh u1))
     (live2 (is-fresh u2)))
    (if (and live0 live1 (<= (* u100 (abs-diff r0 r1)) (* CONSENSUS-TOL-PCT r1)))
      (ok { bps: (/ (+ r0 r1) u2), at: (min (default-to u0 (map-get? oracle-report-block u0)) (default-to u0 (map-get? oracle-report-block u1))) })
      (if (and live0 live2 (<= (* u100 (abs-diff r0 r2)) (* CONSENSUS-TOL-PCT r2)))
        (ok { bps: (/ (+ r0 r2) u2), at: (min (default-to u0 (map-get? oracle-report-block u0)) (default-to u0 (map-get? oracle-report-block u2))) })
        (if (and live1 live2 (<= (* u100 (abs-diff r1 r2)) (* CONSENSUS-TOL-PCT r2)))
          (ok { bps: (/ (+ r1 r2) u2), at: (min (default-to u0 (map-get? oracle-report-block u1)) (default-to u0 (map-get? oracle-report-block u2))) })
          err-no-consensus)))))

(define-private (min (a uint) (b uint)) (if (< a b) a b))
(define-private (min-out (expected uint))
  (+ (* (/ expected u10000) (- u10000 SLIPPAGE-BPS))
     (/ (* (mod expected u10000) (- u10000 SLIPPAGE-BPS)) u10000)))

(define-public (set-vault (vault principal))
  (begin
    (try! (assert-owner))
    (asserts! (is-none (var-get authorized-vault)) err-already-init)
    (asserts! (is-eq vault .vault-v7) err-not-vault)
    (var-set authorized-vault (some vault))
    (ok vault)))

;; vault-v7 has already transferred `amount` sBTC to this adapter before calling.
;; Forward it into the Zest vault (as-contract) and record shares for `user`.
;; Shares are minted to (as-contract tx-sender) = this adapter's own principal.
(define-public (deposit (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (asserts! (not (var-get adapter-paused)) err-paused)
    (asserts! (> amount u0) err-zero-amount)
    (asserts! (is-none (map-get? user-shares user)) err-duplicate)
    (let ((expected (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc convert-to-shares amount) err-no-shares)))
      (let ((shares (try! (as-contract
              (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc deposit amount (min-out expected) (as-contract tx-sender))))))
        (asserts! (> shares u0) err-no-shares)
        (map-set user-shares user (+ (default-to u0 (map-get? user-shares user)) shares))
        (var-set total-shares (+ (var-get total-shares) shares))
        (ok shares)))))

 ;; Redeems directly to the v7 vault. No simnet fallback, no balance sweep.
(define-public (withdraw (amount uint) (user principal) (sbtc <sip-010-trait>))
  (begin
    (try! (assert-vault))
    (asserts! (is-eq (contract-of sbtc) 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token) err-bad-token)
    (let ((shares (default-to u0 (map-get? user-shares user)))
          (vault (unwrap! (var-get authorized-vault) err-not-vault)))
      (asserts! (> shares u0) err-no-shares)
      (let ((expected (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc convert-to-assets shares) err-no-shares)))
        (let ((gross (try! (as-contract (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc redeem shares (min-out expected) vault)))))
          (map-delete user-shares user)
          (var-set total-shares (- (var-get total-shares) shares))
          (ok gross))))))

(define-public (set-apy (bps uint))
  (let ((caller contract-caller))
    (asserts! (is-eq caller tx-sender) err-not-owner)
    (asserts! (is-oracle caller) err-not-owner)
    (asserts! (<= bps APY-CAP) err-apy-too-high)
    (let ((current (var-get current-apy-bps))
          (idx     (unwrap! (oracle-index-of caller) err-not-owner)))
      (asserts!
        (or (is-eq current u0)
            (<= (* u100 (abs-diff bps current)) (* MAX-DEVIATION-PCT current)))
        err-deviation)
      (map-set oracle-reports      idx bps)
      (map-set oracle-report-block idx burn-block-height)
      (match (try-commit-consensus bps)
        committed-bps (begin
          (var-set current-apy-bps (get bps committed-bps))
          (var-set last-updated-block (get at committed-bps))
          (ok (get bps committed-bps)))
        e (ok (var-get current-apy-bps))))))

(define-public (set-oracle-at (idx uint) (oracle principal))
  (begin
    (try! (assert-owner))
    (asserts! (< idx ORACLE-COUNT) err-bad-oracle-idx)
    (asserts! (or (is-none (oracle-index-of oracle))
                   (is-eq (oracle-index-of oracle) (some idx))) err-duplicate)
    (map-set oracle-principals idx oracle)
    (map-delete oracle-reports idx)
    (map-delete oracle-report-block idx)
    (var-set last-updated-block u0)
    (ok oracle)))

(define-public (set-paused (val bool))
  (begin
    (try! (assert-owner))
    (var-set adapter-paused val)
    (ok val)))

(define-read-only (get-apy)
  (let ((last (var-get last-updated-block)))
    (if (or (is-eq last u0) (> burn-block-height (+ last STALE-BLOCKS)))
      err-stale-apy
      (ok (var-get current-apy-bps)))))

;; sBTC value currently held for all users (principal + accrued yield).
(define-read-only (get-total-deposited)
  (ok (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc convert-to-assets (var-get total-shares)) (err u120))))

(define-read-only (is-paused)              (ok (var-get adapter-paused)))
(define-read-only (get-last-updated-block) (ok (var-get last-updated-block)))

(define-read-only (get-oracle-report (idx uint))
  (ok { bps:   (default-to u0 (map-get? oracle-reports idx))
      , block: (default-to u0 (map-get? oracle-report-block idx)) }))

(define-read-only (get-oracle (idx uint))
  (map-get? oracle-principals idx))

(define-read-only (get-shares (user principal))
  (default-to u0 (map-get? user-shares user)))

(define-read-only (preview-deposit (amount uint))
  (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc convert-to-shares amount))
(define-read-only (preview-withdraw (user principal))
  (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc convert-to-assets (default-to u0 (map-get? user-shares user))))
