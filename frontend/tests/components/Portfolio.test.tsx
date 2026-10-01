import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Portfolio } from "../../src/pages/Portfolio.js";
import { PositionCard } from "../../src/components/portfolio/PositionCard.js";
import type { UserPosition } from "../../src/types/position.js";
const state = vi.hoisted(() => ({ error: false, connected: true, rateError: false, withdraw: vi.fn() }));
vi.mock("../../src/context/WalletContext.js", () => ({ useWallet: () => ({ isConnected: state.connected, address: "SPTEST" }) }));
vi.mock("../../src/hooks/usePositions.js", () => ({ usePositions: () => ({ positions: [], isLoading: false, isError: state.error, refetch: vi.fn() }) }));
vi.mock("../../src/hooks/useWithdraw.js", () => ({ useWithdraw: () => ({ mutate: state.withdraw }) }));
vi.mock("../../src/hooks/useAsyncWithdraw.js", () => ({ useRequestWithdraw: () => ({}), useClaimWithdraw: () => ({}), useCancelWithdraw: () => ({}) }));
vi.mock("../../src/hooks/useYields.js", () => ({ MAX_YIELD_AGE_MS: 600_000, useYields: () => ({ isError: state.rateError, data: [{ protocol: "zest", apy_percent: 3.4, apy_stale: false, fetched_at: Date.now() }] }) }));
vi.mock("../../src/components/wallet/FaucetButton.js", () => ({ FaucetButton: () => null }));
vi.mock("../../src/hooks/useTransactions.js", () => ({ useTransactions: () => [] }));
const position: UserPosition = { adapter: "SPUNKNOWN.some-adapter", protocol: null, principalSats: 123456789n, depositedAt: 100, isAsync: false, status: "active", claimId: 0 };
describe("Portfolio safety states", () => {
  beforeEach(() => { state.error = false; state.connected = true; state.rateError = false; state.withdraw.mockReset(); });
  it("does not render empty or zero balances when contract reads fail", () => {
    state.error = true;
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Portfolio /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("Positions could not be verified.")).toBeVisible();
    expect(screen.queryByText("No positions in this vault.")).not.toBeInTheDocument();
  });
  it("explains connection without suggesting it authorizes funds", () => {
    state.connected = false;
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Portfolio /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText(/Connecting does not authorize any transaction/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Connect wallet/ })).toBeEnabled();
  });
  it("hides a cached rate when the latest rate request fails", () => {
    state.rateError = true;
    render(<PositionCard position={{ ...position, protocol: "zest" }} />);
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.queryByText("3.4%")).not.toBeInTheDocument();
  });
  it("keeps an unknown adapter label and exact principal while preserving its actual exit target", () => {
    render(<PositionCard position={position} />);
    expect(screen.getByText("Unknown adapter")).toBeVisible();
    expect(screen.getByText("1.23456789", { exact: false })).toBeVisible();
    expect(screen.queryByText("Zest")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review withdrawal" }));
    expect(state.withdraw).not.toHaveBeenCalled();
    expect(screen.getByText(/legacy vault does not support a minimum payout/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Review in wallet" }));
    expect(state.withdraw).toHaveBeenCalledWith({ adapter: position.adapter });
  });
});
