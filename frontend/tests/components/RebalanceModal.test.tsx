import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RebalanceModal } from "../../src/components/rebalance/RebalanceModal.js";
import type { NormalizedYield } from "../../src/types/yield.js";

const mockMutate = vi.fn();

vi.mock("../../src/hooks/useRebalance.js", () => ({
  useRebalance: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
  }),
}));

vi.mock("../../src/hooks/useYields.js", () => ({
  useYields: vi.fn(),
}));

vi.mock("../../src/context/WalletContext.js", () => ({
  useWallet: () => ({
    isConnected: true,
    address: "SP2TEST",
    connect: vi.fn(),
    disconnect: vi.fn(),
    callContract: vi.fn(),
  }),
}));

import { useYields } from "../../src/hooks/useYields.js";

const mockUseYields = vi.mocked(useYields);

const ALL_YIELDS: NormalizedYield[] = [
  {
    protocol: "bitflow",
    apy_percent: 22.0,
    risk_level: "low",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: 1_200_000,
    fetched_at: Date.now(),
  },
  {
    protocol: "alex",
    apy_percent: 18.0,
    risk_level: "low",
    lock_period_days: 0,
    reward_token: "ALEX",
    tvl_usd: 3_500_000,
    fetched_at: Date.now(),
  },
  {
    protocol: "zest",
    apy_percent: 15.0,
    risk_level: "high",
    lock_period_days: 30,
    reward_token: "ZEST",
    tvl_usd: 500_000,
    fetched_at: Date.now(),
  },
  {
    protocol: "velar",
    apy_percent: 20.0,
    risk_level: "medium",
    lock_period_days: 7,
    reward_token: "VELAR",
    tvl_usd: 800_000,
    fetched_at: Date.now(),
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("RebalanceModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseYields.mockReturnValue({
      data: ALL_YIELDS,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useYields>);
  });

  it("renders modal title and description when open", () => {
    render(
      <RebalanceModal
        open={true}
        onClose={vi.fn()}
        currentProtocol="bitflow"
      />,
      { wrapper }
    );

    expect(screen.getByText(/rebalance position/i)).toBeInTheDocument();
    expect(screen.getByText(/bitflow/i)).toBeInTheDocument();
  });

  it("excludes the current protocol from the options list", () => {
    render(
      <RebalanceModal
        open={true}
        onClose={vi.fn()}
        currentProtocol="bitflow"
      />,
      { wrapper }
    );

    const options = screen.getAllByRole("button", { name: /alex|zest|velar/i });
    expect(options.length).toBe(3);

    const bitflowButtons = screen.queryAllByRole("button", {
      name: /^bitflow$/i,
    });
    expect(bitflowButtons.length).toBe(0);
  });

  it("calls rebalance.mutate with from/to when confirm is clicked", () => {
    const onClose = vi.fn();
    render(
      <RebalanceModal
        open={true}
        onClose={onClose}
        currentProtocol="bitflow"
      />,
      { wrapper }
    );

    const alexButton = screen.getByRole("button", { name: /alex lab/i });
    fireEvent.click(alexButton);

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    fireEvent.click(confirmButton);

    expect(mockMutate).toHaveBeenCalledOnce();
    expect(mockMutate).toHaveBeenCalledWith(
      { from: "bitflow", to: "alex" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("disables confirm button when no protocol is selected", () => {
    render(
      <RebalanceModal
        open={true}
        onClose={vi.fn()}
        currentProtocol="bitflow"
      />,
      { wrapper }
    );

    const confirmButton = screen.getByRole("button", { name: /confirm/i });
    expect(confirmButton).toBeDisabled();
  });

  it("does not render content when closed", () => {
    render(
      <RebalanceModal
        open={false}
        onClose={vi.fn()}
        currentProtocol="bitflow"
      />,
      { wrapper }
    );

    expect(screen.queryByText(/rebalance position/i)).not.toBeInTheDocument();
  });
});
