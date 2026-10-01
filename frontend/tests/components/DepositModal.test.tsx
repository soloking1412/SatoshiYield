import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DepositModal } from "../../src/components/wallet/DepositModal.js";
const state = vi.hoisted(() => ({ enabled: true, mutate: vi.fn(), balanceError: false, success: false, positionsError: false, paused: false }));
vi.mock("../../src/constants/contracts.js", () => ({ get DEPOSITS_ENABLED() { return state.enabled; }, DEPOSIT_BLOCK_REASON: "Review is required.", VAULT_VERSION: "v7", CONTRACTS: { VAULT: "STTEST.vault-v7", ADAPTERS: { zest: "STTEST.mock-sync", hbtc: "STTEST.mock-async" } } }));
vi.mock("../../src/lib/stacksClient.js", () => ({ networkName: "testnet" }));
vi.mock("../../src/hooks/useDeposit.js", () => ({ useDeposit: () => ({ mutate: state.mutate, isPending: false, isError: false, isSuccess: state.success, data: state.success ? "0x1234" : undefined }) }));
vi.mock("../../src/hooks/useBalance.js", () => ({ useBalance: () => ({ data: 2_000_000n, isError: state.balanceError, isLoading: false, refetch: vi.fn() }) }));
vi.mock("../../src/hooks/useVaultStats.js", () => ({ useVaultStats: () => ({ data: { minDepositSats: 1000, totalDepositedSats: 0, tvlCapSats: 1_000_000, feeBasisPoints: 500 }, isError: false, isLoading: false, refetch: vi.fn() }) }));
vi.mock("../../src/hooks/usePositions.js", () => ({ usePositions: () => ({ positions: [], isError: state.positionsError, isLoading: false, refetch: vi.fn() }) }));
vi.mock("../../src/hooks/useDepositAdmission.js", () => ({ useDepositAdmission: () => ({ data: { available: !state.paused, reason: state.paused ? "The testnet vault is paused." : "", remainingSats: 1_000_000n }, isError: false, isLoading: false, refetch: vi.fn() }) }));
describe("DepositModal safeguards", () => {
  beforeEach(() => { state.enabled = true; state.balanceError = false; state.positionsError = false; state.success = false; state.paused = false; state.mutate.mockReset(); });
  it("blocks wallet prompts while the deployed vault remains paused", () => {
    state.paused = true;
    render(<DepositModal protocolId="zest" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "0.001" } });
    expect(screen.getByText("The testnet vault is paused.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review deposit" })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("blocks deposits behind the deployment gate", () => {
    state.enabled = false;
    render(<DepositModal protocolId="zest" onClose={() => {}} />);
    expect(screen.getByText("Deposits are unavailable.")).toBeVisible();
    expect(screen.queryByLabelText("Deposit amount")).not.toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("rejects exponent notation, excessive decimals and amounts over vault capacity", () => {
    render(<DepositModal protocolId="zest" onClose={() => {}} />);
    const input = screen.getByLabelText("Deposit amount");
    for (const value of ["1e309", "0.000010001", "0.011"]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole("button", { name: "Review deposit" })).toBeDisabled();
      expect(screen.getByRole("alert")).toBeVisible();
    }
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("fails closed when a balance or position read fails", () => {
    state.positionsError = true;
    render(<DepositModal protocolId="zest" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "0.001" } });
    expect(screen.getByRole("button", { name: "Review deposit" })).toBeDisabled();
    expect(screen.getByText(/Account or vault data could not be verified/)).toBeVisible();
  });
  it("allows an explicitly enabled mock simulation without a market feed and submits exact satoshis after review", () => {
    render(<DepositModal protocolId="zest" onClose={() => {}} />);
    expect(screen.getByText("Simulation only")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Deposit amount"), { target: { value: "0.00123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Review deposit" }));
    expect(state.mutate).not.toHaveBeenCalled();
    const approve = screen.getByRole("button", { name: "Review in wallet" });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(approve);
    expect(state.mutate).toHaveBeenCalledWith({ protocol: "zest", amountSats: 123456n, reviewedMaxFeeBps: 500 });
  });
  it("labels a wallet-returned transaction ID as submitted, not a confirmed deposit", () => {
    state.success = true;
    render(<DepositModal protocolId="zest" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Transaction submitted" })).toBeVisible();
    expect(screen.getByText("Submission is not confirmation.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Check transaction result/ })).toHaveAttribute("href", "https://explorer.hiro.so/txid/0x1234?chain=testnet");
    expect(screen.queryByText("Deposited!")).not.toBeInTheDocument();
  });
});
