;; Candidate atomic request guard. Not deployed or independently audited.
;; All protocol dependencies are immutable mainnet principals. No owner, state,
;; arbitrary target, token custody, as-contract, or administrative functions.
(define-constant ERR-DIRECT (err u9001))
(define-constant ERR-INPUT (err u9002))
(define-constant ERR-FEE (err u9003))
(define-constant ERR-MINIMUM (err u9004))
(define-constant ERR-OWNER (err u9005))
(define-constant ERR-RECORD (err u9006))
(define-constant ERR-COOLDOWN (err u9007))

(define-public (request (shares uint) (min-sbtc-entitlement uint) (max-fee-bps uint) (max-cooldown-burn-blocks uint))
  (let ((user tx-sender))
    (asserts! (is-eq contract-caller user) ERR-DIRECT)
    (asserts! (and (> shares u0) (> min-sbtc-entitlement u0) (< max-fee-bps u10000) (> max-cooldown-burn-blocks u0)) ERR-INPUT)
    (asserts! (<= (contract-call? 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-stbtc-v1 get-withdraw-fee) max-fee-bps) ERR-FEE)
    (asserts! (<= (contract-call? 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.withdraw-data-stbtc get-withdraw-cooldown-blocks) max-cooldown-burn-blocks) ERR-COOLDOWN)
    ;; Preserve tx-sender. The protocol transfers the user's shares directly to
    ;; its core and mints the withdrawal NFT directly to the user.
    (let ((id (try! (contract-call? 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-stbtc-v1 init-withdraw shares))))
      (let ((entry (contract-call? 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.withdraw-data-stbtc get-withdrawals-by-nft id))
            (nft-owner (unwrap! (unwrap! (contract-call? 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stbtc-withdraw-nft get-owner id) ERR-OWNER) ERR-OWNER)))
        (asserts! (is-eq nft-owner user) ERR-OWNER)
        (asserts! (and (is-eq (get token-amount entry) shares) (>= (get unlock-burn-height entry) burn-block-height)) ERR-RECORD)
        (asserts! (<= (- (get unlock-burn-height entry) burn-block-height) max-cooldown-burn-blocks) ERR-COOLDOWN)
        (asserts! (and (< (get withdraw-fee entry) u10000) (<= (get withdraw-fee entry) max-fee-bps)) ERR-FEE)
        (let ((fee (/ (* (get asset-amount entry) (get withdraw-fee entry)) u10000)))
          (let ((net (- (get asset-amount entry) fee)))
            (asserts! (>= net min-sbtc-entitlement) ERR-MINIMUM)
            (ok {claim-id:id, sbtc-entitlement:net, unlock-burn-height:(get unlock-burn-height entry)})))))))
