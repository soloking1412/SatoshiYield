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
    protocol: "hbtc",
    apy_percent: 8.0,
    risk_level: "medium",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: 12_000_000,
    fetched_at: Date.now(),
  },
  {
    protocol: "zest",
    apy_percent: 3.4,
    risk_level: "low",
    lock_period_days: 0,
    reward_token: "sBTC",
    tvl_usd: 83_000_000,
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

  it("renders the two live tiles (Zest, Hermetica hBTC) and a coming-soon tile", () => {
    mockUseYields.mockReturnValue({
      data: FIXTURES,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useYields>);

    render(<YieldTable />, { wrapper });

    expect(screen.getAllByText("Zest").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Hermetica hBTC").length).toBeGreaterThanOrEqual(1);
    // The removed AMM/stub protocols must NOT be rendered.
    expect(screen.queryByText("ALEX Lab")).toBeNull();
    expect(screen.queryByText("Velar")).toBeNull();
    expect(screen.queryByText("Bitflow")).toBeNull();
    // "More yields coming soon" tile (Dual Stacking) is shown.
    expect(screen.getByText("Dual Stacking (PoX)")).toBeInTheDocument();
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

  it("renders the loading state while fetching", () => {
    mockUseYields.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useYields>);

    const { container } = render(<YieldTable />, { wrapper });

    expect(container.textContent).toMatch(/finding the best rates/i);
  });

  it("renders error state when fetch fails", () => {
    mockUseYields.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useYields>);

    render(<YieldTable />, { wrapper });

    expect(screen.getByText(/indexer unreachable/i)).toBeInTheDocument();
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
