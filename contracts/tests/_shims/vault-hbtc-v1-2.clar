;; Clarinet simnet shim for SP1S1HSFH0SQQGWKB69EYFNY0B1MHRMGXR3J1FH4D.vault-hbtc-v1-2
;;
;; PURE-ACCOUNTING shim of the Hermetica hBTC vault for the Vitest suite. It
;; mirrors the real public interface the adapter calls (deposit / request-redeem
;; / redeem / cancel-redeem / preview-redeem) plus the async claim lifecycle, but
;; performs NO sBTC transfers - exactly like the Zest shim. The deposited sBTC
;; stays in the adapter, which forwards its balance to the vault on claim.
;;
;; Applied into ./.cache/requirements/ by tests/_shims/apply-shims.mjs (npm
;; pretest). The REAL contract is validated via a mainnet fork before approval.

(define-fungible-token hbtc-shim)
(define-data-var total-assets uint u0)
(define-data-var claim-counter uint u0)
;; Cooldown in BLOCKS for the shim (real vault uses a state-configured time-based
;; cooldown). Default 0 so the happy path needs no block mining; tests can bump it.
(define-data-var cooldown-blocks uint u0)

(define-constant share-base u100000000)

(define-constant ERR-NO-CLAIM     (err u103003))
(define-constant ERR-NOT-COOLED   (err u103004))
(define-constant ERR-ALREADY-FUND (err u103005))
(define-constant ERR-NOT-FUNDED   (err u103006))
(define-constant ERR-NOT-AUTH     (err u103008))
(define-constant ERR-ZERO         (err u103002))

(define-map claims uint
  { user: principal, shares: uint, funded: bool, assets: uint, ready-block: uint })

(define-read-only (convert-to-shares (assets uint))
  (let ((supply (ft-get-supply hbtc-shim)) (a (var-get total-assets)))
    (ok (if (or (is-eq supply u0) (is-eq a u0)) assets (/ (* assets supply) a)))))

(define-read-only (convert-to-assets (shares uint))
  (let ((supply (ft-get-supply hbtc-shim)))
    (ok (if (is-eq supply u0) u0 (/ (* shares (var-get total-assets)) supply)))))

(define-read-only (preview-deposit (assets uint)) (convert-to-shares assets))
(define-read-only (preview-redeem  (shares uint)) (convert-to-assets shares))

(define-read-only (get-share-price)
  (let ((supply (ft-get-supply hbtc-shim)))
    (ok (if (is-eq supply u0) share-base (/ (* (var-get total-assets) share-base) supply)))))

(define-read-only (get-claim (id uint))
  (ok (unwrap! (map-get? claims id) ERR-NO-CLAIM)))

(define-read-only (get-shares (who principal)) (ft-get-balance hbtc-shim who))

;; Mint shares to the caller (the adapter). NO sBTC transfer - sBTC stays in the
;; adapter, mirroring the Zest pure-accounting shim.
(define-public (deposit (assets uint) (affiliate (optional (buff 64))))
  (begin
    (asserts! (> assets u0) ERR-ZERO)
    (let ((shares (unwrap-panic (convert-to-shares assets))))
      (var-set total-assets (+ (var-get total-assets) assets))
      (try! (ft-mint? hbtc-shim shares contract-caller))
      (ok shares))))

;; Escrow the caller's shares and open a claim.
(define-public (request-redeem (shares uint) (is-express bool))
  (begin
    (asserts! (> shares u0) ERR-ZERO)
    (try! (ft-transfer? hbtc-shim shares contract-caller (as-contract tx-sender)))
    (let ((id (+ (var-get claim-counter) u1)))
      (var-set claim-counter id)
      (map-set claims id
        { user: contract-caller, shares: shares, funded: false, assets: u0
        , ready-block: (+ stacks-block-height (var-get cooldown-blocks)) })
      (ok id))))

;; Manager funds the claim (test stand-in: no auth). Records assets at the
;; current share price.
(define-public (fund-claim (claim-id uint))
  (let ((claim (unwrap! (map-get? claims claim-id) ERR-NO-CLAIM)))
    (asserts! (not (get funded claim)) ERR-ALREADY-FUND)
    (let ((assets (unwrap-panic (convert-to-assets (get shares claim)))))
      (map-set claims claim-id (merge claim { funded: true, assets: assets }))
      (ok assets))))

;; Redeem a funded + cooled claim: burn escrowed shares and settle accounting.
;; NO sBTC transfer (adapter forwards its own balance).
(define-public (redeem (claim-id uint))
  (let ((claim (unwrap! (map-get? claims claim-id) ERR-NO-CLAIM)))
    (asserts! (get funded claim) ERR-NOT-FUNDED)
    (asserts! (>= stacks-block-height (get ready-block claim)) ERR-NOT-COOLED)
    (try! (ft-burn? hbtc-shim (get shares claim) (as-contract tx-sender)))
    (var-set total-assets
      (if (>= (var-get total-assets) (get assets claim)) (- (var-get total-assets) (get assets claim)) u0))
    (map-delete claims claim-id)
    (ok (get assets claim))))

;; Cancel an unfunded claim: return escrowed shares to the user.
(define-public (cancel-redeem (claim-id uint))
  (let ((claim (unwrap! (map-get? claims claim-id) ERR-NO-CLAIM)))
    (asserts! (not (get funded claim)) ERR-ALREADY-FUND)
    (try! (as-contract (ft-transfer? hbtc-shim (get shares claim) tx-sender (get user claim))))
    (map-delete claims claim-id)
    (ok (get shares claim))))

;; TEST HELPER: simulate accrued hBTC yield by bumping total-assets (share price).
;; The test must ALSO mint the extra sBTC to the adapter to fund the payout.
(define-public (add-yield (amount uint))
  (begin (var-set total-assets (+ (var-get total-assets) amount)) (ok amount)))

;; TEST HELPER: set the redemption cooldown (blocks).
(define-public (set-cooldown-blocks (n uint))
  (begin (var-set cooldown-blocks n) (ok n)))

(define-read-only (get-total-assets) (var-get total-assets))
