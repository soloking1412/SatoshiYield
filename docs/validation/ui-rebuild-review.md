# Independent UI review — final evaluation

Reviewed 2026-10-01 in Chromium, using the frontend-design evaluator criteria. The evaluator was separate from the implementation agent. A different-provider evaluator was not available in this tool configuration.

## Verdict: PASS for the reviewed release-candidate interface

The interface has a consistent copper, charcoal and off-white visual system. Ledger-like strategy rows, exact-unit amounts, network labels and explicit withdrawal terms give the product a clear identity suited to a Bitcoin financial application. Direct protocol positions, the legacy vault, mock testnet strategies and incomplete Bitcoin preparations are distinguished without presenting missing rates or failed reads as financial results.

This is a UI evaluation, not an independent smart-contract audit or evidence that every advertised protocol lifecycle is complete. No wallet signature or transaction broadcast was performed during this review.

| Criterion | Score | Status | Weight | Reason |
|---|---:|---|---|---|
| Design quality | 2/3 | Pass | High | Consistent typography, muted surfaces, copper action emphasis, aligned accounting rows and restrained status treatments. |
| Originality | 2/3 | Pass | High | The strategy register, capital flow, disclosure-first route workspaces and withdrawal-focused language are deliberate product decisions. |
| Craft | 2/3 | Pass | Medium | Desktop, tablet and 375px layouts remain usable without horizontal overflow. Mobile controls reflow and long contract identifiers wrap. Focus and dialog behavior were checked and corrected. |
| Functionality | 2/3 | Pass | Medium | Read failures, release gates, consent, eligibility and confirmation states are distinguishable. Full wallet signing and external-protocol completion remain outside this review. |

## Coverage and observed behavior

- All six application routes (`/`, `/yields`, `/integrations`, `/portfolio`, `/tvl`, `/security`), including both integration tabs: seven views at 1440px, 768px and 375px. Final settled sweep: 21 screenshots, zero uncaught page errors, zero failed requests and zero horizontal-overflow findings. Captures finish finite entrance animations and wait for the relevant contract/feed read state.
- Keyboard: skip link targets the main landmark; visible focus outline; integration panel selection; wallet dialog focus containment, Escape dismissal and restored opener focus; withdrawal dialog restored opener focus. Main and mobile navigation are additionally recorded in the navigation evidence.
- Mainnet vault deposit controls remain disabled. Strategy details expose the risk and unavailable action. Rates with no verified fresh source render as unavailable, not invented APY. Transparency labels deposited principal as accounting rather than redemption value and omits invented historical charts.
- A read-only browser session using a public mainnet address loaded real Zest and StackingDAO receipt balances. Those reads returned zero receipts for that address; the page shows its last-check timestamp and explains that withdrawal NFTs are not enumerated. Simulated RPC failure instead produced `Unavailable` holdings and an explicit failed-position message, never a fabricated zero balance.
- A live direct Zest quote for 0.001 sBTC showed 0.0009994 zsBTC expected and 0.0009944 zsBTC minimum at the observed chain state. The wallet handoff was disabled before consent and enabled after checking consent. It was never invoked. Source/RPC failure produced an error with no wallet handoff.
- The existing StackingDAO claim link selects the NFT claim action. New queue requests explain the undeployed atomic-guard restriction. Testnet explicitly refuses the mainnet direct-protocol routes.
- Babylon's real Signet network read displayed current Bitcoin/Babylon heights, a 0.00050000 test-BTC minimum and a 6-of-9 committee. Preparation remained disabled without a payment account. Missing Bitcoin and Ethereum wallet providers produced errors rather than a transaction.
- Native PoX-5 mainnet eligibility read returned bond #2/open, zero allowance and a 13.369200 STX paired commitment for the public observer. The interface reports the allowance, STX and signer-manager blockers and explicitly keeps funding disabled. Signet, regtest and mainnet are described separately.
- The testnet withdrawal review read the real public mock position: 0.001 sBTC principal, 0.001095 sBTC estimated net, 0.00108953 sBTC minimum and the position's 5.00% performance-fee snapshot. An unavailable preview blocked wallet review and stated that no payout was assumed.
- An isolated browser journal was populated from two existing public testnet call records, then checked against the live canonical receipt API. It displayed the real successful deposit as confirmed and the real premature governance application as failed. Aborting a subsequent receipt lookup changed that row to `Confirmation unavailable`, not failed or confirmed. No new transaction was created to produce these states.
- Light-theme primary button colors were verified after the theme transition: text `rgb(255,249,240)` on `rgb(153,80,26)`. A screenshot taken during the transition is not evidence of the final color contrast.

## Findings fixed during review

1. **Strategy inventory could be mistaken for on-chain registration.** The home and strategy directory used “registered” for a configured list that included a mainnet adapter absent from the verified deployment graph. The implementation now says “listed strategies.” Fresh browser text verified the correction.
2. **Wallet dialog lost keyboard position on dismissal.** A dialog opened outside `Dialog.Trigger` returned focus to the document body. The shared modal now retains the external opener and restores it if connected, otherwise focusing the main landmark. The implementation added a regression test; independent browser checks verified both Connect wallet and Review withdrawal openers.
3. **Concurrent preview optimizer state interrupted the native module.** One native eligibility attempt failed its dynamic import after dependency reinstall with two preview servers. Fresh navigation after restart succeeded with no failed requests. The implementer separated Vite optimizer cache directories by network. This was a development-preview issue; a failed attempt was retained in the evidence rather than classified as successful.

No unresolved must-fix presentation or accessibility issue was found within the tested scope. A minor remaining refinement is to translate raw provider/network messages such as “no wallet provider was found” or “Failed to fetch” into action-oriented copy while retaining the original diagnostic for support.

## Evidence

The [screenshot directory](ui-rebuild/) contains the complete responsive captures and state details. Key records:

- [Responsive route sweep](ui-rebuild/initial-browser-evidence.json)
- [Interaction and RPC outage checks](ui-rebuild/interaction-browser-evidence.json)
- [Final consent, focus and theme checks](ui-rebuild/final-browser-evidence.json)
- [Native eligibility retry](ui-rebuild/native-browser-evidence.json)
- [Real testnet withdrawal review](ui-rebuild/withdrawal-browser-evidence.json)
- [Real testnet receipt journal](ui-rebuild/journal-browser-evidence.json)
- [Keyboard navigation](ui-rebuild/navigation-browser-evidence.json)
- [Desktop integrations](ui-rebuild/integrations-stacks-1440.png)
- [Mobile integrations](ui-rebuild/integrations-stacks-375.png)
- [Mobile native eligibility](ui-rebuild/native-eligibility-375.png)
- [Mobile withdrawal review](ui-rebuild/testnet-withdrawal-review-375.png)

Earlier interaction evidence contains the original focus issue; the final focus check supersedes it. The earlier native dynamic-import failure is superseded by the separate successful native read. Full-page screenshots place fixed navigation at the captured viewport's bottom, which can appear partway through a long image; live viewport checks govern overlap findings. The isolated native-panel capture uses a taller viewport at the same 375px width so its full result can be inspected.

## Limits

Tests used isolated browser storage with public addresses; no extension credentials, private keys, wallet permissions or signing sessions were used. The journal was seeded from real public records for receipt-display testing, not presented as transactions submitted through this browser. Network-outage cases were intentionally intercepted and are labeled as such. This review does not establish successful wallet signing, Lombard authorization, Babylon registration/recovery, PoX-5 funding/registration, assistive screen-reader behavior, Safari/Firefox behavior, or exhaustive WCAG conformance. The supported viewport floor reviewed was 375px. Current numbers are observations at capture time, not forecasts or permanent protocol limits.

The design direction should be **refined**, not replaced. Remaining protocol release gates belong to integration validation and governance, not cosmetic status changes.
