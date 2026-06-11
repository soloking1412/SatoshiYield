;; hermetica-hbtc-adapter - LIVE YIELD adapter (Hermetica hBTC vault), ASYNC.
;;
;; Routes deposited sBTC into the Hermetica hBTC vault (ERC-4626-style, ~8% BTC
;; yield). Deposit is synchronous; redemption is ASYNCHRONOUS:
;;   request-withdraw -> Hermetica manager funds the claim after a cooldown ->
;;   claim-withdraw. cancel-withdraw restores the position while the claim is
;;   unfunded, so user funds are never lost (worst case the user stays in hBTC).
;;
;; YIELD SOURCE: SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2
;;   Managed delta-neutral + dual-staking strategy. NOT principal-guaranteed like
;;   Zest lending: a small exit fee applies and sBTC liquidity depends on
;;   Hermetica funding redemptions. Disclosed in the UI.
;;
;; sBTC FLOW:
;;   deposit : vault-v6 -> adapter -> hBTC.deposit (hBTC shares minted to adapter)
;;   request : adapter -> hBTC.request-redeem (adapter's shares escrowed, claim id)
;;   claim   : adapter -> hBTC.redeem -> sBTC to adapter -> forwarded to vault-v6
;;   cancel  : adapter -> hBTC.cancel-redeem (shares returned to adapter)

(impl-trait .yield-source-async-v1.yield-source-async-v1-trait)
(use-trait sip-010-trait .sip-010-trait.sip-010-trait)

(define-constant CONTRACT-OWNER     tx-sender)
(define-constant APY-CAP            u6000)
(define-constant STALE-BLOCKS       u2160)
(define-constant CONSENSUS-TOL-PCT  u10)
(define-constant MAX-DEVIATION-PCT  u50)
(define-constant ORACLE-COUNT       u3)

;; Hermetica hBTC vault: 'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2
;; (referenced as a literal in contract-call?; the cached copy is a simnet shim
;; for tests, the real contract is validated via a mainnet fork before approval).
;; The sBTC token is supplied by vault-v6 as a SIP-010 trait (network-agnostic);
;; vault-v6 validates it against the canonical sbtc-token, so this adapter does
;; not hardcode it.

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
(define-constant err-no-claim       (err u121))
(define-constant err-bad-token      (err u122))

(define-data-var adapter-paused     bool false)
(define-data-var current-apy-bps    uint u0)
(define-data-var total-shares       uint u0)
(define-data-var authorized-vault   (optional principal) none)
(define-data-var last-updated-block uint u0)

(define-map oracle-principals   uint principal)
(define-map oracle-reports      uint uint)
(define-map oracle-report-block uint uint)
(define-map user-shares         principal uint)
(define-map user-claim          principal uint)   ;; pending claim id per user

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

;; vault-v6 has already transferred `amount` sBTC to this adapter before calling.
;; Deposit it into hBTC (as-contract); hBTC shares are minted to this adapter.
(define-public (deposit (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (asserts! (not (var-get adapter-paused)) err-paused)
    (asserts! (> amount u0) err-zero-amount)
    (let ((shares (try! (as-contract (contract-call? 'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2 deposit amount none)))))
      (asserts! (> shares u0) err-no-shares)
      (map-set user-shares user (+ (default-to u0 (map-get? user-shares user)) shares))
      (var-set total-shares (+ (var-get total-shares) shares))
      (ok amount))))

;; Phase 1: escrow the user's full hBTC share balance and open a redemption claim.
(define-public (request-withdraw (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (let ((shares (default-to u0 (map-get? user-shares user))))
      (asserts! (> shares u0) err-no-shares)
      (let ((claim-id (try! (as-contract (contract-call? 'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2 request-redeem shares false)))))
        (map-set user-claim user claim-id)
        (ok claim-id)))))

;; Phase 2: redeem the funded+cooled claim to sBTC and forward gross to vault-v6.
;;
;; SECURITY (audit C1): forward EXACTLY this claim's redeemed amount (the value
;; hBTC.redeem returns), NEVER the adapter's full sBTC balance. hBTC.redeem is
;; permissionless and pays the claim's recorded user (= this pooled adapter), so
;; multiple users' redeemed sBTC can co-mingle here; forwarding the full balance
;; would let one user's claim sweep another's funds. `gross` = redeem's return
;; value, so each claim only ever moves its own proceeds.
;;   Mainnet: hBTC.redeem sends `gross` sBTC to this adapter, then we forward it.
;;   Simnet : the pure-accounting shim returns `gross` and moves no sBTC; the
;;            adapter already holds the deposited sBTC, so the forward succeeds.
(define-public (claim-withdraw (amount uint) (user principal) (sbtc <sip-010-trait>))
  (begin
    (try! (assert-vault))
    (let ((shares   (default-to u0 (map-get? user-shares user)))
          (claim-id (unwrap! (map-get? user-claim user) err-no-claim))
          (vault    (unwrap! (var-get authorized-vault) err-not-vault)))
      (asserts! (> shares u0) err-no-shares)
      (let ((gross (try! (as-contract (contract-call? 'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2 redeem claim-id)))))
        (asserts! (> gross u0) err-insufficient)
        (try! (as-contract (contract-call? sbtc transfer gross tx-sender vault none)))
        (map-delete user-shares user)
        (map-delete user-claim user)
        (var-set total-shares (if (>= (var-get total-shares) shares) (- (var-get total-shares) shares) u0))
        (ok gross)))))

;; Escape hatch: cancel an unfunded claim; shares return to the adapter and the
;; user's position stays intact.
(define-public (cancel-withdraw (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (let ((claim-id (unwrap! (map-get? user-claim user) err-no-claim)))
      (try! (as-contract (contract-call? 'SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2 cancel-redeem claim-id)))
      (map-delete user-claim user)
      (ok true))))

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

;; Total hBTC shares held by this adapter (proxy for sBTC deposited). On-chain
;; read-only functions cannot call an external contract's read-only to value the
;; shares, so the indexer converts shares -> sBTC off-chain via
;; vault-hbtc-v1-2.preview-redeem(total-shares).
(define-read-only (get-total-deposited)
  (ok (var-get total-shares)))

(define-read-only (is-paused)              (ok (var-get adapter-paused)))
(define-read-only (get-last-updated-block) (ok (var-get last-updated-block)))

(define-read-only (get-oracle-report (idx uint))
  (ok { bps:   (default-to u0 (map-get? oracle-reports idx))
      , block: (default-to u0 (map-get? oracle-report-block idx)) }))

(define-read-only (get-oracle (idx uint))
  (map-get? oracle-principals idx))

(define-read-only (get-shares (user principal))
  (default-to u0 (map-get? user-shares user)))

(define-read-only (get-claim-id (user principal))
  (map-get? user-claim user))
