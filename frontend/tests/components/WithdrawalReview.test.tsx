import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { UserPosition } from "../../src/types/position.js";
import type { WithdrawalQuote } from "../../src/lib/transactionPolicy.js";
import { PositionCard } from "../../src/components/portfolio/PositionCard.js";

const state = vi.hoisted(() => ({
  version: "v7", address: "STTEST", connected: true,
  quote: vi.fn(), withdraw: vi.fn(), claim: vi.fn(), request: vi.fn(), cancel: vi.fn(),
}));
vi.mock("../../src/constants/contracts.js", () => ({ get VAULT_VERSION() { return state.version; } }));
vi.mock("../../src/context/WalletContext.js", () => ({ useWallet: () => ({ address: state.address, isConnected: state.connected }) }));
vi.mock("../../src/lib/transactionPolicy.js", () => ({ getWithdrawalQuote: state.quote }));
vi.mock("../../src/lib/stacksClient.js", () => ({ networkName: "testnet" }));
vi.mock("../../src/hooks/useWithdraw.js", () => ({ useWithdraw: () => ({ mutate: state.withdraw }) }));
vi.mock("../../src/hooks/useAsyncWithdraw.js", () => ({
  useRequestWithdraw: () => ({ mutate: state.request }),
  useClaimWithdraw: () => ({ mutate: state.claim }),
  useCancelWithdraw: () => ({ mutate: state.cancel }),
}));
vi.mock("../../src/hooks/useYields.js", () => ({ MAX_YIELD_AGE_MS: 600_000, useYields: () => ({}) }));

const position: UserPosition = { adapter: "STTEST.mock-sync-v7", protocol: "zest", principalSats: 100_000n, depositedAt: 100, isAsync: false, status: "active", claimId: 0, feeBps: 500 };
const quote: WithdrawalQuote = { grossSats: 120_000n, payoutSats: 119_000n, minimumSats: 118_405n, feeBps: 500 };
const approve = () => screen.getByRole("button", { name: "Review in wallet" });
const open = () => fireEvent.click(screen.getByRole("button", { name: "Review withdrawal" }));

describe("withdrawal consent and quote review", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.version = "v7"; state.address = "STTEST"; state.connected = true;
    state.quote.mockResolvedValue(quote);
  });

  it("waits for a fresh quote, freezes the shown minimum, and passes that exact value to withdrawal", async () => {
    let resolve!: (value: WithdrawalQuote) => void;
    state.quote.mockReturnValue(new Promise<WithdrawalQuote>(done => { resolve = done; }));
    const view = render(<PositionCard position={position} />);
    open();
    expect(approve()).toBeDisabled();
    expect(screen.getByText("Reading the current redemption quote…")).toBeVisible();
    fireEvent.click(approve()); expect(state.withdraw).not.toHaveBeenCalled();
    await act(async () => resolve(quote));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Estimated net payout").nextElementSibling).toHaveTextContent("0.00119 sBTC");
    expect(dialog.getByText("On-chain minimum payout").nextElementSibling).toHaveTextContent("0.00118405 sBTC");
    state.quote.mockResolvedValue({ ...quote, payoutSats: 50_000n, minimumSats: 49_750n });
    view.rerender(<PositionCard position={{ ...position }} />);
    fireEvent(window, new Event("focus"));
    expect(state.quote).toHaveBeenCalledExactlyOnceWith("STTEST", position.adapter);
    expect(dialog.getByText("On-chain minimum payout").nextElementSibling).toHaveTextContent("0.00118405 sBTC");
    fireEvent.click(approve());
    expect(state.withdraw).toHaveBeenCalledExactlyOnceWith({ adapter: position.adapter, minPayoutSats: 118_405n });
  });

  it("requires acknowledgement of a partial loss before accepting the displayed minimum", async () => {
    state.quote.mockResolvedValue({ ...quote, grossSats: 80_000n, payoutSats: 80_000n, minimumSats: 79_600n });
    render(<PositionCard position={position} />); open();
    const acknowledgement = await screen.findByRole("checkbox", { name: /I accept this loss/ });
    expect(approve()).toBeDisabled(); fireEvent.click(approve()); expect(state.withdraw).not.toHaveBeenCalled();
    fireEvent.click(acknowledgement); fireEvent.click(approve());
    expect(state.withdraw).toHaveBeenCalledWith({ adapter: position.adapter, minPayoutSats: 79_600n });
  });

  it("requires explicit zero-recovery acceptance and passes zero to a queued claim", async () => {
    state.quote.mockResolvedValue({ ...quote, grossSats: 0n, payoutSats: 0n, minimumSats: 0n });
    const pending = { ...position, adapter: "STTEST.mock-async-v7", isAsync: true, status: "pending" as const, claimId: 7 };
    render(<PositionCard position={pending} />);
    fireEvent.click(screen.getByRole("button", { name: "Review claim" }));
    const acknowledgement = await screen.findByRole("checkbox", { name: /zero sBTC payout and permanently close/ });
    expect(approve()).toBeDisabled(); fireEvent.click(approve()); expect(state.claim).not.toHaveBeenCalled();
    fireEvent.click(acknowledgement); fireEvent.click(approve());
    expect(state.claim).toHaveBeenCalledWith({ adapter: pending.adapter, minPayoutSats: 0n });
  });

  it("does not assume a payout after a read failure and retries only on request", async () => {
    state.quote.mockRejectedValueOnce(new Error("RPC unavailable"));
    render(<PositionCard position={position} />); open();
    expect(await screen.findByText("Redemption quote unavailable.")).toBeVisible();
    expect(approve()).toBeDisabled();
    expect(screen.queryByText("Estimated net payout")).not.toBeInTheDocument();
    fireEvent.click(approve()); expect(state.withdraw).not.toHaveBeenCalled();
    state.quote.mockResolvedValue(quote);
    fireEvent.click(screen.getByRole("button", { name: "Retry quote" }));
    await waitFor(() => expect(approve()).toBeEnabled());
    expect(state.quote).toHaveBeenCalledTimes(2);
  });

  it.each(["address change", "disconnect"])("closes the review on %s and discards its pending quote", async change => {
    let resolve!: (value: WithdrawalQuote) => void;
    state.quote.mockReturnValue(new Promise<WithdrawalQuote>(done => { resolve = done; }));
    const view = render(<PositionCard position={position} />); open();
    if (change === "address change") state.address = "STOTHER"; else state.connected = false;
    view.rerender(<PositionCard position={position} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => resolve(quote));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.withdraw).not.toHaveBeenCalled();
  });

  it("does not quote legacy exits and discloses their limited wallet protections", () => {
    state.version = "v6";
    render(<PositionCard position={position} />); open();
    expect(screen.getByText(/legacy vault does not support a minimum payout/)).toBeVisible();
    expect(screen.getByText(/zero outgoing sBTC and STX/)).toBeVisible();
    expect(screen.getByText(/other asset movements unconstrained/)).toBeVisible();
    expect(state.quote).not.toHaveBeenCalled();
    expect(screen.queryByText("On-chain minimum payout")).not.toBeInTheDocument();
    fireEvent.click(approve());
    expect(state.withdraw).toHaveBeenCalledWith({ adapter: position.adapter });
  });

  it.each(["request", "cancel"])("preserves %s as a state transition without a payout quote", action => {
    const asyncPosition = { ...position, isAsync: true, status: action === "request" ? "active" as const : "pending" as const };
    render(<PositionCard position={asyncPosition} />);
    fireEvent.click(screen.getByRole("button", { name: action === "request" ? "Request withdrawal" : "Cancel request" }));
    expect(state.quote).not.toHaveBeenCalled();
    expect(screen.getByText(action === "request" ? /starts a delayed redemption/ : /Cancellation is subject to the contract state/)).toBeVisible();
    fireEvent.click(approve());
    expect(action === "request" ? state.request : state.cancel).toHaveBeenCalledWith({ adapter: position.adapter });
  });
});
