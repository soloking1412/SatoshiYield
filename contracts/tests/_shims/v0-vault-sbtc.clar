;; Clarinet simnet shim for SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.v0-vault-sbtc
;;
;; PURE-ACCOUNTING shim. Matches the real Zest Earn vault interface
;; (deposit/redeem/convert-to-shares/convert-to-assets) but performs NO SIP-010
;; token transfers. Referencing 'ST1...mock-sbtc here caused Clarinet to treat
;; mock-sbtc as a requirement dependency, conflicting with the local project
;; contract. Keeping the shim token-agnostic eliminates that conflict.
;;
;; sBTC FLOW IN TESTS:
;;   deposit: vault->adapter (vault.deposit), sBTC held in adapter (shim is noop)
;;   redeem:  shim returns gross amount; adapter's withdraw() then forwards its
;;            sBTC balance to the vault (see zest-earn-adapter post-redeem step)
;;   yield:   test calls shim.add-yield(N) for accounting AND
;;            mock-sbtc.mint(N, adapter) to fund the extra payout

(define-fungible-token zsbtc-v0)
(define-data-var total-assets uint u0)

(define-read-only (convert-to-shares (amount uint))
  (let ((supply (ft-get-supply zsbtc-v0))
        (assets (var-get total-assets)))
    (ok (if (or (is-eq supply u0) (is-eq assets u0))
          amount
          (/ (* amount supply) assets)))))

(define-read-only (convert-to-assets (shares uint))
  (let ((supply (ft-get-supply zsbtc-v0)))
    (ok (if (is-eq supply u0)
          u0
          (/ (* shares (var-get total-assets)) supply)))))

;; Record deposit: update accounting and mint zsbtc shares to recipient.
;; NO token transfer -- sBTC stays in the adapter contract.
(define-public (deposit (amount uint) (min-out uint) (recipient principal))
  (begin
    (asserts! (> amount u0) (err u1))
    (let ((supply (ft-get-supply zsbtc-v0))
          (assets (var-get total-assets)))
      (let ((shares (if (or (is-eq supply u0) (is-eq assets u0))
                      amount
                      (/ (* amount supply) assets))))
        (asserts! (>= shares min-out) (err u2))
        (var-set total-assets (+ assets amount))
        (try! (ft-mint? zsbtc-v0 shares recipient))
        (ok shares)))))

;; Record redeem: burn zsbtc shares and return computed gross amount.
;; NO token transfer -- caller (adapter.withdraw) forwards sBTC to vault.
(define-public (redeem (shares uint) (min-out uint) (recipient principal))
  (let ((supply (ft-get-supply zsbtc-v0)))
    (asserts! (and (> shares u0) (> supply u0)) (err u1))
    (let ((amount (/ (* shares (var-get total-assets)) supply)))
      (asserts! (>= amount min-out) (err u2))
      (try! (ft-burn? zsbtc-v0 shares tx-sender))
      (var-set total-assets (- (var-get total-assets) amount))
      (ok amount))))

;; TEST HELPER: bump total-assets to simulate accrued Zest PoX yield.
;; Caller must ALSO call mock-sbtc.mint(amount, adapter) to fund the payout.
;; Deployer-only.
(define-public (add-yield (amount uint))
  (begin
    (asserts! (is-eq tx-sender 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) (err u403))
    (asserts! (> amount u0) (err u1))
    (var-set total-assets (+ (var-get total-assets) amount))
    (ok amount)))

(define-read-only (get-total-assets) (var-get total-assets))
(define-read-only (get-shares (who principal)) (ft-get-balance zsbtc-v0 who))
