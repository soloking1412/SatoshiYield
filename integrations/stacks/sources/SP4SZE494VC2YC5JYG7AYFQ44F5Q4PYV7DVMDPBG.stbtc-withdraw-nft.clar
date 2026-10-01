(impl-trait .nft-trait.nft-trait)

(define-non-fungible-token withdraw-nft uint)


(define-constant ERR_NOT_AUTHORIZED (err u15001))
(define-constant ERR_GET_OWNER (err u15002))


(define-data-var last-id uint u1)
(define-data-var token-uri (optional (string-ascii 256)) none)


(define-read-only (get-last-token-id)
  (let ((next (var-get last-id)))
    (ok (if (> next u1) (- next u1) u0))
  )
)

(define-read-only (get-token-uri (token-id uint))
  (if (is-some (nft-get-owner? withdraw-nft token-id))
    (ok (var-get token-uri))
    (ok none)
  )
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? withdraw-nft token-id))
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR_NOT_AUTHORIZED)
    (try! (nft-transfer? withdraw-nft token-id sender recipient))
    (print { action: "transfer", data: { token-id: token-id, sender: sender, recipient: recipient, block-height: stacks-block-height } })
    (ok true)
  )
)


(define-public (set-token-uri (value (string-ascii 256)))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (var-set token-uri (some value))
    (print { action: "set-token-uri", data: { value: value, block-height: stacks-block-height } })
    (ok true)
  )
)


(define-public (mint-for-protocol (recipient principal))
  (let (
    (id (var-get last-id))
  )
    (try! (contract-call? .dao check-is-protocol contract-caller))

    (try! (nft-mint? withdraw-nft id recipient))
    (var-set last-id (+ id u1))
    (print { action: "mint-for-protocol", data: { token-id: id, recipient: recipient, block-height: stacks-block-height } })
    (ok id)
  )
)

(define-public (burn-for-protocol (token-id uint))
  (let (
    (owner (unwrap! (nft-get-owner? withdraw-nft token-id) ERR_GET_OWNER))
  )
    (try! (contract-call? .dao check-is-protocol contract-caller))

    (try! (nft-burn? withdraw-nft token-id owner))
    (print { action: "burn-for-protocol", data: { token-id: token-id, owner: owner, block-height: stacks-block-height } })
    (ok true)
  )
)
