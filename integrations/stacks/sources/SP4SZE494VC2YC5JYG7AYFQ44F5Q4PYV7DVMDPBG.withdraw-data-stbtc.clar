(define-constant ERR_COOLDOWN_TOO_SHORT (err u24001))


(define-data-var withdraw-cooldown-blocks uint (if is-in-mainnet u2100 u10))


(define-map withdrawals-by-nft uint {
  unlock-burn-height: uint,
  asset-amount: uint,
  token-amount: uint,
  withdraw-fee: uint,
})


(define-read-only (get-withdraw-cooldown-blocks)
  (var-get withdraw-cooldown-blocks)
)

(define-public (set-withdraw-cooldown-blocks (blocks uint))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (asserts! (>= blocks (if is-in-mainnet u2100 u10)) ERR_COOLDOWN_TOO_SHORT)
    (var-set withdraw-cooldown-blocks blocks)
    (print { action: "set-withdraw-cooldown-blocks", data: { blocks: blocks, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-read-only (get-withdraw-unlock-burn-height)
  (+ burn-block-height (var-get withdraw-cooldown-blocks))
)


(define-read-only (get-withdrawals-by-nft (nft-id uint))
  (default-to
    { unlock-burn-height: u0, asset-amount: u0, token-amount: u0, withdraw-fee: u0 }
    (map-get? withdrawals-by-nft nft-id)
  )
)

(define-public (set-withdrawals-by-nft (nft-id uint) (asset-amount uint) (token-amount uint) (unlock-burn-height uint) (withdraw-fee uint))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))

    (map-set withdrawals-by-nft nft-id {
      unlock-burn-height: unlock-burn-height,
      asset-amount: asset-amount,
      token-amount: token-amount,
      withdraw-fee: withdraw-fee,
    })
    (print { action: "set-withdrawals-by-nft", data: { nft-id: nft-id, asset-amount: asset-amount, token-amount: token-amount, unlock-burn-height: unlock-burn-height, withdraw-fee: withdraw-fee, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (delete-withdrawals-by-nft (nft-id uint))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))

    (map-delete withdrawals-by-nft nft-id)
    (print { action: "delete-withdrawals-by-nft", data: { nft-id: nft-id, block-height: stacks-block-height } })
    (ok true)
  )
)
