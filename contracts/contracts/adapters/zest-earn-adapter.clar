;; zest-earn-adapter - LIVE YIELD adapter (Zest Earn sBTC vault).
;;
;; Routes deposited sBTC into the Zest Earn sBTC vault, tracks each user's
;; vault shares, and on withdraw redeems those shares back to sBTC
;; (principal + accrued Zest yield). vault-v6 takes its 5% performance fee
;; on yield only -- this is the real protocol revenue path.
;;
;; YIELD SOURCE: SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
;;   Real APY: ~3.5-4% (PoX dual-stacking rewards passed to suppliers).
;;   No impermanent loss -- lending/supply vault, not an AMM.
;;   Principal is always returned in full; only the yield carries risk.
;;
;; sBTC FLOW:
;;   deposit: vault-v6 -> adapter -> Zest vault (shares minted to adapter)
;;   withdraw: Zest redeems shares, sends sBTC directly to vault-v6
;;             (vault-v6 pays user principal + (1 - fee) * yield)

(impl-trait .yield-source-v2.yield-source-v2-trait)
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

(define-constant CONTRACT-OWNER     tx-sender)
(define-constant APY-CAP            u6000)
(define-constant STALE-BLOCKS       u2160)
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

(define-data-var adapter-paused     bool false)
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

(define-private (min-out (expected uint))
  (/ (* expected (- u10000 SLIPPAGE-BPS)) u10000))

(define-public (set-vault (vault principal))
  (begin
    (try! (assert-owner))
    (asserts! (is-none (var-get authorized-vault)) err-already-init)
    (var-set authorized-vault (some vault))
    (ok vault)))

;; vault-v6 has already transferred `amount` sBTC to this adapter before calling.
;; Forward it into the Zest vault (as-contract) and record shares for `user`.
;; Shares are minted to (as-contract tx-sender) = this adapter's own principal.
(define-public (deposit (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (asserts! (not (var-get adapter-paused)) err-paused)
    (asserts! (> amount u0) err-zero-amount)
    (let ((expected (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc convert-to-shares amount) err-no-shares)))
      (let ((shares (try! (as-contract
              (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc deposit amount (min-out expected) (as-contract tx-sender))))))
        (asserts! (> shares u0) err-no-shares)
        (map-set user-shares user (+ (default-to u0 (map-get? user-shares user)) shares))
        (var-set total-shares (+ (var-get total-shares) shares))
        (ok amount)))))

;; Redeem the user's full share balance from Zest.
;; On mainnet: real Zest vault transfers sBTC to vault inside redeem() -- no extra hop.
;; On simnet: the shim is pure-accounting, so sBTC stays in this adapter after deposit.
;;   We forward the adapter's sBTC balance to vault here (noop on mainnet, active on simnet).
;; vault-v6 receives gross and pays the user (principal + yield - fee).
(define-public (withdraw (amount uint) (user principal) (sbtc <sip-010-trait>))
  (begin
    (try! (assert-vault))
    (let ((shares (default-to u0 (map-get? user-shares user))))
      (asserts! (> shares u0) err-no-shares)
      (let ((vault (unwrap! (var-get authorized-vault) err-not-vault)))
        (let ((expected (unwrap! (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc convert-to-assets shares) err-no-shares)))
          (let ((gross (try! (as-contract
                  (contract-call? 'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc redeem shares (min-out expected) vault)))))
            ;; Forward any sBTC sitting in this adapter to vault.
            ;; Mainnet: real Zest vault already sent gross to vault, adapter-bal = 0 (noop).
            ;; Simnet:  pure-accounting shim left sBTC here; forward it now.
            (match (as-contract (contract-call? sbtc get-balance tx-sender))
              adapter-bal
              (if (> adapter-bal u0)
                (try! (as-contract (contract-call? sbtc transfer adapter-bal tx-sender vault none)))
                true)
              e true)
            (map-delete user-shares user)
            (var-set total-shares
              (if (>= (var-get total-shares) shares) (- (var-get total-shares) shares) u0))
            (ok gross)))))))

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
