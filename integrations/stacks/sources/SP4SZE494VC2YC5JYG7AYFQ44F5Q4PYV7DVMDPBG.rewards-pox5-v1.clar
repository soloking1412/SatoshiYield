(define-constant DENOMINATOR_BPS u10000)
(define-constant ERR_BPS_TOO_HIGH (err u33002))
(define-constant ERR_RECIPIENT_NOT_SET (err u33003))
(define-constant ERR_NOT_KEEPER (err u33004))
(define-constant ERR_ALREADY_INITIALIZED (err u33005))

(define-constant RELEASE_WINDOW_BLOCKS (if is-in-mainnet u2100 u10))

(define-data-var release-per-block uint u0)
(define-data-var release-end-block uint u0)
(define-data-var last-release-block uint u0)

(define-data-var ststxbtc-bps uint u0)
(define-data-var ststx-bps uint u0)

(define-data-var stx-reward-recipient (optional principal) none)


(define-data-var keeper (optional principal) none)

(define-read-only (get-keeper) (var-get keeper))

(define-read-only (get-release-end-block) (var-get release-end-block))

(define-read-only (get-sbtc-balance)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract))
)

(define-read-only (get-streaming-remaining)
  (let ((end (var-get release-end-block)))
    (if (>= burn-block-height end)
      u0
      (* (- end burn-block-height) (var-get release-per-block))
    )
  )
)

(define-read-only (get-ststxbtc-bps) (var-get ststxbtc-bps))
(define-read-only (get-ststx-bps) (var-get ststx-bps))
(define-read-only (get-stx-reward-recipient) (var-get stx-reward-recipient))

(define-public (set-split-bps (new-ststxbtc-bps uint) (new-ststx-bps uint))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (asserts! (<= (+ new-ststxbtc-bps new-ststx-bps) DENOMINATOR_BPS) ERR_BPS_TOO_HIGH)
    (var-set ststxbtc-bps new-ststxbtc-bps)
    (var-set ststx-bps new-ststx-bps)
    (print { action: "set-split-bps", data: { ststxbtc-bps: new-ststxbtc-bps, ststx-bps: new-ststx-bps, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-stx-reward-recipient (recipient principal))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (var-set stx-reward-recipient (some recipient))
    (print { action: "set-stx-reward-recipient", data: { recipient: recipient, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-read-only (get-ready-to-release)
  (let (
    (end (var-get release-end-block))
    (last (var-get last-release-block))
    (effective-end (if (< burn-block-height end) burn-block-height end))
  )
    (if (> effective-end last)
      (* (- effective-end last) (var-get release-per-block))
      u0
    )
  )
)

(define-private (route-sbtc-share (share uint) (dest principal))
  (if (> share u0)
    (as-contract?
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" share))
      (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer share current-contract dest none)))
    (ok true)))


(define-public (process-rewards)
  (let (
    (release-amount (get-ready-to-release))
    (effective-end (if (< burn-block-height (var-get release-end-block)) burn-block-height (var-get release-end-block)))
  )
    (if (> release-amount u0)
      (let (
        (ststxbtc-share (/ (* release-amount (var-get ststxbtc-bps)) DENOMINATOR_BPS))
        (ststx-share (/ (* release-amount (var-get ststx-bps)) DENOMINATOR_BPS))
        (stbtc-share (- release-amount (+ ststxbtc-share ststx-share)))
        (ststxbtc-supply-v1 (unwrap-panic (contract-call? .ststxbtc-token get-total-supply)))
        (ststxbtc-supply-v2 (unwrap-panic (contract-call? .ststxbtc-token-v2 get-total-supply)))
        (total-supply (+ ststxbtc-supply-v1 ststxbtc-supply-v2))
      )
        (try! (route-sbtc-share stbtc-share .stbtc-reserve))
        (if (> ststxbtc-share u0)
          (if (> total-supply u0)
            (let (
              (rewards-v1 (if (is-eq total-supply u0) u0
                (/ (* ststxbtc-share ststxbtc-supply-v1) total-supply)))
              (rewards-v2 (- ststxbtc-share rewards-v1))
            )
              (if (> rewards-v1 u0)
                (try! (as-contract?
                  ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" rewards-v1))
                  (try! (contract-call? .ststxbtc-tracking add-rewards rewards-v1))))
                true)
              (if (> rewards-v2 u0)
                (try! (as-contract?
                  ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" rewards-v2))
                  (try! (contract-call? .ststxbtc-tracking-v2 add-rewards rewards-v2))))
                true))
            (try! (route-sbtc-share ststxbtc-share .stbtc-reserve)))
          true)
        (try! (route-sbtc-share ststx-share (match (var-get stx-reward-recipient) r r .stbtc-reserve)))
        (var-set last-release-block effective-end)
      )
      true
    )

    (if (is-eq (some contract-caller) (var-get keeper))
    (let (
      (balance-mid (get-sbtc-balance))
      (queued-mid (get-streaming-remaining))
      (new-raw (if (> balance-mid queued-mid) (- balance-mid queued-mid) u0))

      (pool-commission-bps (contract-call? .data-pools-stbtc-v1 get-pool-commission))
      (pool-owner-share-bps (contract-call? .data-pools-stbtc-v1 get-pool-owner-share))
      (pool-owner-receiver (contract-call? .data-pools-stbtc-v1 get-pool-owner-receiver))

      (commission-amount (/ (* new-raw pool-commission-bps) DENOMINATOR_BPS))
      (pool-owner-amount (/ (* commission-amount pool-owner-share-bps) DENOMINATOR_BPS))
      (commission-left (- commission-amount pool-owner-amount))
      (staking-end (+ burn-block-height RELEASE_WINDOW_BLOCKS))
    )
      (if (> pool-owner-amount u0)
        (try! (as-contract?
          ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" pool-owner-amount))
          (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer pool-owner-amount current-contract (unwrap! pool-owner-receiver ERR_RECIPIENT_NOT_SET) none))
        ))
        true
      )
      (if (> commission-left u0)
        (try! (as-contract?
          ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" commission-left))
          (try! (contract-call? .commission-sbtc-v1 add-commission commission-left staking-end))
        ))
        u0
      )

      (let (
        (balance-post (- (- balance-mid pool-owner-amount) commission-left))
        (queued-post queued-mid)
        (new-to-fold (if (> balance-post queued-post) (- balance-post queued-post) u0))
      )
        (if (> new-to-fold u0)
          (let (
            (new-total (+ queued-post new-to-fold))
            (new-end (+ burn-block-height RELEASE_WINDOW_BLOCKS))
            (new-per-block (/ new-total RELEASE_WINDOW_BLOCKS))
          )
            (var-set release-per-block new-per-block)
            (var-set release-end-block new-end)
            (var-set last-release-block burn-block-height)
          )
          true
        )

        (print { action: "process-rewards", data: {
          released: release-amount,
          new-raw: new-raw,
          pool-owner: pool-owner-amount,
          commission-left: commission-left,
          folded: new-to-fold,
          per-block: (var-get release-per-block),
          end-block: (var-get release-end-block),
          block-height: stacks-block-height
        } })
        true
      )
      )
      true
    )
    (ok release-amount)
  )
)


(define-public (initialize (the-keeper principal))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (asserts! (is-none (var-get keeper)) ERR_ALREADY_INITIALIZED)
    (var-set keeper (some the-keeper))
    (print { action: "initialize", data: { keeper: the-keeper, block-height: stacks-block-height } })
    (ok true)
  )
)

(define-public (set-keeper (new-keeper principal))
  (begin
    (try! (contract-call? .dao check-is-protocol contract-caller))
    (var-set keeper (some new-keeper))
    (print { action: "set-keeper", data: { keeper: new-keeper, block-height: stacks-block-height } })
    (ok true)
  )
)
