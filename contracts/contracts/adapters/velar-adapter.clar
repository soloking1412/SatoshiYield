(impl-trait .yield-source.yield-source-trait)

(define-constant CONTRACT-OWNER tx-sender)

(define-constant APY-CAP           u100000)
(define-constant STALE-BLOCKS      u720)
(define-constant CONSENSUS-TOL-PCT u10)
(define-constant MAX-DEVIATION-PCT u50)
(define-constant ORACLE-COUNT      u3)

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
(define-data-var current-apy-bps    uint u2000)
(define-data-var total-shares       uint u0)
(define-data-var authorized-vault   (optional principal) none)
(define-data-var last-updated-block uint u0)

(define-map oracle-principals   uint principal)
(define-map oracle-reports      uint uint)
(define-map oracle-report-block uint uint)

(define-map user-shares principal uint)

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

(define-private (within-tol (a uint) (ref uint))
  (if (is-eq ref u0)
    (is-eq a u0)
    (<= (* u100 (abs-diff a ref)) (* CONSENSUS-TOL-PCT ref))))

(define-private (conservative-median (a uint) (b uint))
  (if (<= a b) a b))

(define-private (try-commit-consensus (new-bps uint))
  (let
    ((r0 (default-to u0 (map-get? oracle-reports u0)))
     (r1 (default-to u0 (map-get? oracle-reports u1)))
     (r2 (default-to u0 (map-get? oracle-reports u2)))
     (b0 (default-to u0 (map-get? oracle-report-block u0)))
     (b1 (default-to u0 (map-get? oracle-report-block u1)))
     (b2 (default-to u0 (map-get? oracle-report-block u2)))
     (live0 (> b0 u0))
     (live1 (> b1 u0))
     (live2 (> b2 u0)))
    (if (and live0 live1 (within-tol r0 r1))
      (ok (conservative-median r0 r1))
      (if (and live0 live2 (within-tol r0 r2))
        (ok (conservative-median r0 r2))
        (if (and live1 live2 (within-tol r1 r2))
          (ok (conservative-median r1 r2))
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
      (var-set total-shares (+ (var-get total-shares) amount))
      (ok amount))))

(define-public (withdraw (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (let ((shares (default-to u0 (map-get? user-shares user))))
      (asserts! (>= shares amount) err-insufficient)
      (map-set user-shares user (- shares amount))
      (var-set total-shares
        (if (>= (var-get total-shares) amount)
          (- (var-get total-shares) amount)
          u0))
      (ok amount))))

(define-public (set-apy (bps uint))
  (let ((caller tx-sender))
    (asserts!
      (or (is-eq caller CONTRACT-OWNER) (is-oracle caller))
      err-not-owner)
    (asserts! (<= bps APY-CAP) err-apy-too-high)
    (let ((current (var-get current-apy-bps)))
      (asserts!
        (or (is-eq current u0)
            (<= (* u100 (abs-diff bps current)) (* MAX-DEVIATION-PCT current)))
        err-deviation)
      (let ((idx (oracle-index-of caller)))
        (match idx
          i (begin
              (map-set oracle-reports      i bps)
              (map-set oracle-report-block i stacks-block-height))
          (begin
            (map-set oracle-reports      u0 bps)
            (map-set oracle-report-block u0 stacks-block-height)))
        (match (try-commit-consensus bps)
          committed-bps (begin
            (var-set current-apy-bps committed-bps)
            (var-set last-updated-block stacks-block-height)
            (ok committed-bps))
          e (ok (var-get current-apy-bps)))))))

(define-public (set-oracle (oracle principal))
  (begin
    (try! (assert-owner))
    (map-set oracle-principals u0 oracle)
    (ok oracle)))

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
    (if (and (> last u0)
             (> stacks-block-height (+ last STALE-BLOCKS)))
      err-stale-apy
      (ok (var-get current-apy-bps)))))

(define-read-only (get-total-deposited) (ok (var-get total-shares)))
(define-read-only (is-paused)           (ok (var-get adapter-paused)))
(define-read-only (get-last-updated-block) (ok (var-get last-updated-block)))

(define-read-only (get-oracle-report (idx uint))
  (ok { bps:   (default-to u0 (map-get? oracle-reports idx))
      , block: (default-to u0 (map-get? oracle-report-block idx)) }))

(define-read-only (get-oracle (idx uint))
  (map-get? oracle-principals idx))

(define-read-only (get-shares (user principal))
  (default-to u0 (map-get? user-shares user)))
