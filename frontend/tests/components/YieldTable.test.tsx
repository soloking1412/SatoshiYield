import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { YieldTable } from "../../src/components/yields/YieldTable.js";
import type { NormalizedYield } from "../../src/types/yield.js";

vi.mock("../../src/hooks/useYields.js", () => ({
  useYields: vi.fn(),
}));

vi.mock("../../src/hooks/useDeposit.js", () => ({
  useDeposit: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../src/context/WalletContext.js", () => ({
  useWallet: () => ({
    isConnected: false,
    address: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    callContract: vi.fn(),
  }),
}));

import { useYields } from "../../src/hooks/useYields.js";

const mockUseYields = vi.mocked(useYields);

const FIXTURES: NormalizedYield[] = [
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
    protocol: "velar",
    apy_percent: 20.0,
    risk_level: "medium",
    lock_period_days: 7,
    reward_token: "VELAR",
    tvl_usd: 800_000,
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
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("YieldTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 4 protocol rows when data is loaded", () => {
    mockUseYields.mockReturnValue({
      data: FIXTURES,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useYields>);

    render(<YieldTable />, { wrapper });

    expect(screen.getByText("Bitflow")).toBeInTheDocument();
    expect(screen.getByText("ALEX Lab")).toBeInTheDocument();
    expect(screen.getByText("Zest")).toBeInTheDocument();
    expect(screen.getByText("Velar")).toBeInTheDocument();
  });

  it("renders protocols in APY descending order", () => {
    mockUseYields.mockReturnValue({
      data: FIXTURES,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useYields>);

    render(<YieldTable />, { wrapper });

    const apyValues = screen
      .getAllByText(/^\d+\.\d+%$/)
      .map((el) => parseFloat(el.textContent!));

    for (let i = 0; i < apyValues.length - 1; i++) {
      expect(apyValues[i]).toBeGreaterThanOrEqual(apyValues[i + 1]!);
    }
  });

  it("renders 4 skeleton rows while loading", () => {
    mockUseYields.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useYields>);

    const { container } = render(<YieldTable />, { wrapper });

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(4);
  });

  it("renders error state when fetch fails", () => {
    mockUseYields.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useYields>);

    render(<YieldTable />, { wrapper });

    expect(screen.getByText(/unable to load yield data/i)).toBeInTheDocument();
  });

  it("renders empty state when data is an empty array", () => {
    mockUseYields.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useYields>);

    render(<YieldTable />, { wrapper });

    expect(
      screen.getByText(/no yield data available/i)
    ).toBeInTheDocument();
  });
});
