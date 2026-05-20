;; SIP-010 fungible-token trait.
;; Lets the vault accept the sBTC token as a parameter, so the same vault
;; works on testnet (.mock-sbtc) and mainnet (the real sbtc-token) with no
;; source change - only the set-sbtc-token init call differs.

(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)
