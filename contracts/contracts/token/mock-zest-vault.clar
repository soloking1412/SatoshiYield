;; mock-zest-vault - TEST / DEVNET / SIMNET ONLY.
;;
;; A faithful, minimal stand-in for the real Zest Earn sBTC vault so the
;; zest-earn-adapter and the full deposit -> yield -> fee path can be unit-tested
;; without mainnet. It is an ERC-4626-style share vault over mock-sbtc:
;;   - deposit(amount, min-shares): pull sBTC from caller, mint shares (zsBTC)
;;   - redeem(shares, min-amount):  burn shares, return sBTC (principal + yield)
;;   - add-yield(amount):           TEST HELPER - mints sBTC into the vault and
;;                                  raises the share price, simulating accrued
;;                                  Zest interest. Owner-only.
;;
;; NOT part of the mainnet publish list. On mainnet the adapter is repointed at
;; the real Zest vault principal (see MAINNET-DEPLOY.md).

(impl-trait .zest-sbtc-vault-trait.zest-sbtc-vault-trait)

(define-fungible-token zsbtc)

(define-constant CONTRACT-OWNER tx-sender)

(define-constant err-not-owner   (err u200))
(define-constant err-zero        (err u201))
(define-constant err-slippage    (err u202))
(define-constant err-no-shares   (err u203))

;; sBTC sats currently held on behalf of share holders.
(define-data-var total-assets uint u0)

(define-read-only (get-total-assets) (var-get total-assets))
(define-read-only (get-total-shares) (ft-get-supply zsbtc))

(define-read-only (convert-to-shares (amount uint))
  (let ((supply (ft-get-supply zsbtc))
        (assets (var-get total-assets)))
    (ok (if (or (is-eq supply u0) (is-eq assets u0))
          amount
          (/ (* amount supply) assets)))))

(define-read-only (convert-to-assets (shares uint))
  (let ((supply (ft-get-supply zsbtc)))
    (ok (if (is-eq supply u0)
          u0
          (/ (* shares (var-get total-assets)) supply)))))

;; Pull sBTC from tx-sender (the adapter) into this vault; mint shares to recipient.
(define-public (deposit (amount uint) (min-shares uint) (recipient principal))
  (begin
    (asserts! (> amount u0) err-zero)
    (let ((supply (ft-get-supply zsbtc))
          (assets (var-get total-assets)))
      (let ((shares (if (or (is-eq supply u0) (is-eq assets u0))
                      amount
                      (/ (* amount supply) assets))))
        (asserts! (>= shares min-shares) err-slippage)
        (try! (contract-call? .mock-sbtc transfer amount tx-sender (as-contract tx-sender) none))
        (var-set total-assets (+ assets amount))
        (try! (ft-mint? zsbtc shares recipient))
        (ok shares)))))

;; Burn shares from tx-sender (the adapter); send sBTC proceeds to recipient.
(define-public (redeem (shares uint) (min-amount uint) (recipient principal))
  (let ((caller tx-sender)
        (supply (ft-get-supply zsbtc)))
    (asserts! (> shares u0) err-zero)
    (asserts! (> supply u0) err-no-shares)
    (let ((amount (/ (* shares (var-get total-assets)) supply)))
      (asserts! (>= amount min-amount) err-slippage)
      (try! (ft-burn? zsbtc shares caller))
      (var-set total-assets (- (var-get total-assets) amount))
      ;; Send sBTC directly to recipient (the vault) -- no extra hop needed.
      (try! (as-contract (contract-call? .mock-sbtc transfer amount tx-sender recipient none)))
      (ok amount))))

;; TEST HELPER: simulate accrued Zest yield by minting sBTC into the vault and
;; raising the share price (assets up, shares unchanged). Owner-only.
(define-public (add-yield (amount uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) err-not-owner)
    (asserts! (> amount u0) err-zero)
    (try! (contract-call? .mock-sbtc mint amount (as-contract tx-sender)))
    (var-set total-assets (+ (var-get total-assets) amount))
    (ok amount)))

(define-read-only (get-shares (who principal))
  (ft-get-balance zsbtc who))
