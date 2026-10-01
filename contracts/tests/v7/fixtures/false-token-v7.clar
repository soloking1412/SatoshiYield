;; ADVERSARIAL TEST ONLY
(impl-trait .sip-010-trait.sip-010-trait)

(define-fungible-token mock-sbtc)

(define-constant CONTRACT-OWNER tx-sender)
;; TEST ONLY: return ok false for a selected sender without moving funds.
(define-data-var fail-sender (optional principal) none)
(define-public (set-fail-sender (sender (optional principal)))
  (begin (asserts! (is-eq contract-caller CONTRACT-OWNER) (err u100))
    (var-set fail-sender sender) (ok true)))

(define-constant err-not-owner    (err u100))
(define-constant err-not-sender   (err u101))
(define-constant err-zero-amount  (err u102))

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) err-not-owner)
    (asserts! (> amount u0) err-zero-amount)
    (ft-mint? mock-sbtc amount recipient)))

(define-public (burn (amount uint) (owner principal))
  (begin
    (asserts! (is-eq tx-sender owner) err-not-sender)
    (asserts! (> amount u0) err-zero-amount)
    (ft-burn? mock-sbtc amount owner)))

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34))))
  (if (is-eq (var-get fail-sender) (some sender)) (ok false)
  (begin
    (asserts! (is-eq tx-sender sender) err-not-sender)
    (asserts! (> amount u0) err-zero-amount)
    (try! (ft-transfer? mock-sbtc amount sender recipient))
    (match memo m (print m) 0x)
    (ok true))))

(define-read-only (get-name)        (ok "Mock sBTC"))
(define-read-only (get-symbol)      (ok "mock-sBTC"))
(define-read-only (get-decimals)    (ok u8))
(define-read-only (get-token-uri)   (ok none))
(define-read-only (get-total-supply) (ok (ft-get-supply mock-sbtc)))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance mock-sbtc who)))
