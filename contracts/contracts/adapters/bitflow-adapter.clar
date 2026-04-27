(impl-trait .yield-source.yield-source-trait)

(define-constant CONTRACT-OWNER tx-sender)

(define-constant err-not-owner    (err u100))
(define-constant err-paused       (err u101))
(define-constant err-zero-amount  (err u102))
(define-constant err-not-vault    (err u103))
(define-constant err-insufficient (err u104))

(define-data-var adapter-paused     bool  false)
(define-data-var current-apy-bps    uint  u2200)
(define-data-var total-shares       uint  u0)
(define-data-var authorized-vault   (optional principal) none)
(define-data-var authorized-oracle  (optional principal) none)

(define-map user-shares principal uint)

(define-private (assert-vault)
  (match (var-get authorized-vault)
    v (if (is-eq contract-caller v) (ok true) err-not-vault)
    err-not-vault))

(define-private (assert-owner)
  (if (is-eq tx-sender CONTRACT-OWNER) (ok true) err-not-owner))

;; Called once by deployer to register the vault address.
(define-public (set-vault (vault principal))
  (begin
    (try! (assert-owner))
    (var-set authorized-vault (some vault))
    (ok vault)))

;; Record a deposit. Vault holds the actual tokens.
(define-public (deposit (amount uint) (user principal))
  (begin
    (try! (assert-vault))
    (asserts! (not (var-get adapter-paused)) err-paused)
    (asserts! (> amount u0) err-zero-amount)
    (let ((existing (default-to u0 (map-get? user-shares user))))
      (map-set user-shares user (+ existing amount))
      (var-set total-shares (+ (var-get total-shares) amount))
      (ok amount))))

;; Return how many satoshis to send back on withdrawal.
;; v1: 1:1 shares-to-satoshis - no on-chain yield accumulation.
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
  (begin
    (asserts!
      (or (is-eq tx-sender CONTRACT-OWNER)
          (match (var-get authorized-oracle) o (is-eq tx-sender o) false))
      err-not-owner)
    (var-set current-apy-bps bps)
    (ok bps)))

(define-public (set-oracle (oracle principal))
  (begin
    (try! (assert-owner))
    (var-set authorized-oracle (some oracle))
    (ok oracle)))

(define-public (set-paused (val bool))
  (begin
    (try! (assert-owner))
    (var-set adapter-paused val)
    (ok val)))

(define-read-only (get-apy)             (ok (var-get current-apy-bps)))
(define-read-only (get-total-deposited) (ok (var-get total-shares)))
(define-read-only (is-paused)           (ok (var-get adapter-paused)))
(define-read-only (get-shares (user principal))
  (default-to u0 (map-get? user-shares user)))
