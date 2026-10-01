(define-constant ERR_SHUTDOWN (err u25001))
(define-constant ERR_WITHDRAW_LOCKED (err u25002))
(define-constant ERR_WITHDRAW_NOT_NFT_OWNER (err u25003))
(define-constant ERR_GET_OWNER (err u25005))
(define-constant ERR_INSUFFICIENT_IDLE (err u25006))
(define-constant ERR_MIN_SHARES (err u25007))
(define-constant ERR_INVALID_FEE (err u25008))

(define-constant DEAD_SHARES u1000)

(define-constant DENOMINATOR_8 u100000000)
(define-constant DENOMINATOR_BPS u10000)


(define-data-var shutdown-deposits bool false)
(define-data-var shutdown-init-withdraw bool false)
(define-data-var shutdown-withdraw bool false)
(define-data-var shutdown-withdraw-idle bool false)
(define-data-var withdraw-fee uint u0)
(define-data-var withdraw-idle-fee uint u100)
(define-map fee-exempt principal bool)


(define-read-only (get-shutdown-deposits) (var-get shutdown-deposits))
(define-read-only (get-shutdown-init-withdraw) (var-get shutdown-init-withdraw))
(define-read-only (get-shutdown-withdraw) (var-get shutdown-withdraw))
(define-read-only (get-shutdown-withdraw-idle) (var-get shutdown-withdraw-idle))
(define-read-only (get-withdraw-fee) (var-get withdraw-fee))
(define-read-only (get-withdraw-idle-fee) (var-get withdraw-idle-fee))
(define-read-only (is-fee-exempt (who principal))
  (default-to false (map-get? fee-exempt who))
)


(define-public (deposit (sbtc-amount uint) (min-shares-out uint))
  (begin
    (try! (contract-call? .dao check-is-enabled))
    (asserts! (not (var-get shutdown-deposits)) ERR_SHUTDOWN)
    (try! (contract-call? .rewards-pox5-v1 process-rewards))

    (let (
      (current-supply (unwrap-panic (contract-call? .stbtc-token get-total-supply)))
      (is-first (is-eq current-supply u0))
      (stbtc-amount
        (if is-first
          (- sbtc-amount DEAD_SHARES)
          (/ (* sbtc-amount DENOMINATOR_8)
             (contract-call? .data-stbtc-v1 get-sbtc-per-stbtc-up))))
    )
      (asserts! (>= stbtc-amount min-shares-out) ERR_MIN_SHARES)

      (if is-first
        (try! (contract-call? .stbtc-token mint-for-protocol DEAD_SHARES current-contract))
        true)

      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer sbtc-amount tx-sender .stbtc-reserve none))
      (try! (contract-call? .stbtc-token mint-for-protocol stbtc-amount tx-sender))

      (print { action: "deposit", data: { stacker: tx-sender, sbtc-amount: sbtc-amount, stbtc-amount: stbtc-amount, block-height: stacks-block-height } })
      (ok stbtc-amount)
    )
  )
)

(define-public (init-withdraw (stbtc-amount uint))
  (begin
    (try! (contract-call? .dao check-is-enabled))
    (asserts! (not (var-get shutdown-init-withdraw)) ERR_SHUTDOWN)
    (try! (contract-call? .rewards-pox5-v1 process-rewards))

    (let (
      (sender tx-sender)
      (ratio (contract-call? .data-stbtc-v1 get-sbtc-per-stbtc))
      (sbtc-amount (/ (* stbtc-amount ratio) DENOMINATOR_8))
      (sbtc-fee (/ (* (var-get withdraw-fee) sbtc-amount) DENOMINATOR_BPS))
      (sbtc-user (- sbtc-amount sbtc-fee))
      (unlock-burn-height (contract-call? .withdraw-data-stbtc get-withdraw-unlock-burn-height))
    )
      (let ((nft-id (unwrap-panic (contract-call? .stbtc-withdraw-nft mint-for-protocol sender))))
        (try! (contract-call? .withdraw-data-stbtc set-withdrawals-by-nft nft-id sbtc-amount stbtc-amount unlock-burn-height (var-get withdraw-fee)))

        (try! (contract-call? .stbtc-reserve lock-sbtc-for-withdrawal sbtc-user))
        (try! (contract-call? .stbtc-token transfer stbtc-amount sender current-contract none))
        (try! (contract-call? .data-stbtc-v1 add-pending-shares stbtc-amount))

        (print { action: "init-withdraw", data: { stacker: sender, nft-id: nft-id, sbtc-amount: sbtc-amount, sbtc-user: sbtc-user, sbtc-fee: sbtc-fee, stbtc-amount: stbtc-amount, unlock-burn-height: unlock-burn-height, block-height: stacks-block-height } })
        (ok nft-id)
      )
    )
  )
)

(define-public (withdraw (nft-id uint))
  (let (
    (receiver tx-sender)
    (withdrawal-entry (contract-call? .withdraw-data-stbtc get-withdrawals-by-nft nft-id))
    (unlock-burn-height (get unlock-burn-height withdrawal-entry))
    (sbtc-amount (get asset-amount withdrawal-entry))
    (stbtc-amount (get token-amount withdrawal-entry))
    (sbtc-fee (/ (* (get withdraw-fee withdrawal-entry) sbtc-amount) DENOMINATOR_BPS))
    (sbtc-user (- sbtc-amount sbtc-fee))
    (nft-owner (unwrap! (unwrap! (contract-call? .stbtc-withdraw-nft get-owner nft-id) ERR_GET_OWNER) ERR_GET_OWNER))
  )
    (try! (contract-call? .dao check-is-enabled))
    (asserts! (not (var-get shutdown-withdraw)) ERR_SHUTDOWN)
    (asserts! (is-eq nft-owner tx-sender) ERR_WITHDRAW_NOT_NFT_OWNER)
    (asserts! (>= burn-block-height unlock-burn-height) ERR_WITHDRAW_LOCKED)

    (try! (contract-call? .withdraw-data-stbtc delete-withdrawals-by-nft nft-id))

    (try! (contract-call? .stbtc-reserve request-sbtc-for-withdrawal sbtc-user receiver))
    (try! (contract-call? .stbtc-token burn-for-protocol stbtc-amount current-contract))
    (try! (contract-call? .stbtc-withdraw-nft burn-for-protocol nft-id))
    (try! (contract-call? .data-stbtc-v1 remove-pending-shares stbtc-amount))

    (print { action: "withdraw", data: { stacker: receiver, nft-id: nft-id, sbtc-amount: sbtc-amount, sbtc-user: sbtc-user, sbtc-fee: sbtc-fee, stbtc-amount: stbtc-amount, block-height: stacks-block-height } })
    (ok { sbtc-user: sbtc-user, sbtc-fee: sbtc-fee })
  )
)

(define-public (withdraw-idle (stbtc-amount uint))
  (begin
    (try! (contract-call? .dao check-is-enabled))
    (asserts! (not (var-get shutdown-withdraw-idle)) ERR_SHUTDOWN)
    (try! (contract-call? .rewards-pox5-v1 process-rewards))

    (let (
      (receiver tx-sender)
      (ratio (contract-call? .data-stbtc-v1 get-sbtc-per-stbtc))
      (sbtc-amount (/ (* stbtc-amount ratio) DENOMINATOR_8))
      (sbtc-fee (if (is-fee-exempt tx-sender) u0 (/ (* (var-get withdraw-idle-fee) sbtc-amount) DENOMINATOR_BPS)))
      (sbtc-user (- sbtc-amount sbtc-fee))
      (idle-balance (contract-call? .stbtc-reserve get-sbtc-balance))
      (reserved (contract-call? .stbtc-reserve get-sbtc-for-withdrawals))
      (available (- idle-balance reserved))
    )
      (asserts! (>= available sbtc-user) ERR_INSUFFICIENT_IDLE)

      (try! (contract-call? .stbtc-token burn-for-protocol stbtc-amount receiver))
      (try! (contract-call? .stbtc-reserve pay-sbtc-from-idle sbtc-user receiver))

      (print { action: "withdraw-idle", data: { stacker: receiver, sbtc-amount: sbtc-amount, sbtc-user: sbtc-user, sbtc-fee: sbtc-fee, stbtc-amount: stbtc-amount, block-height: stacks-block-height } })
      (ok { sbtc-user: sbtc-user, sbtc-fee: sbtc-fee })
    )
  )
)


(define-public (set-shutdown-deposits (shutdown bool))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (var-set shutdown-deposits shutdown)
    (print { action: "set-shutdown-deposits", data: { shutdown: shutdown, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-shutdown-init-withdraw (shutdown bool))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (var-set shutdown-init-withdraw shutdown)
    (print { action: "set-shutdown-init-withdraw", data: { shutdown: shutdown, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-shutdown-withdraw (shutdown bool))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (var-set shutdown-withdraw shutdown)
    (print { action: "set-shutdown-withdraw", data: { shutdown: shutdown, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-shutdown-withdraw-idle (shutdown bool))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (var-set shutdown-withdraw-idle shutdown)
    (print { action: "set-shutdown-withdraw-idle", data: { shutdown: shutdown, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-withdraw-fee (fee uint))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (asserts! (< fee DENOMINATOR_BPS) ERR_INVALID_FEE)
    (var-set withdraw-fee fee)
    (print { action: "set-withdraw-fee", data: { fee: fee, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-withdraw-idle-fee (fee uint))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (asserts! (< fee DENOMINATOR_BPS) ERR_INVALID_FEE)
    (var-set withdraw-idle-fee fee)
    (print { action: "set-withdraw-idle-fee", data: { fee: fee, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-fee-exempt (who principal) (exempt bool))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (map-set fee-exempt who exempt)
    (ok true)
  )
)
