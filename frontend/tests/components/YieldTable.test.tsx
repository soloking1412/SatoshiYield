import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { YieldTable } from "../../src/components/yields/YieldTable.js";
import type { NormalizedYield } from "../../src/types/yield.js";
vi.mock("../../src/hooks/useYields.js", () => ({ MAX_YIELD_AGE_MS: 600_000, useYields: vi.fn() }));
vi.mock("../../src/context/WalletContext.js", () => ({ useWallet: () => ({ isConnected: false, address: null }) }));
import { useYields } from "../../src/hooks/useYields.js";
const fixture: NormalizedYield = { protocol: "zest", apy_percent: 3.4, risk_level: "medium", lock_period_days: 0, reward_token: "sBTC", tvl_usd: 83_000_000, fetched_at: Date.now(), last_updated_block: 1234, apy_stale: false, is_live_integration: true };
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}
function mockQuery(data: NormalizedYield[] | undefined = [fixture], flags = {}) {
  vi.mocked(useYields).mockReturnValue({ data, isLoading: false, isError: false, ...flags } as ReturnType<typeof useYields>);
}
describe("YieldTable", () => {
  beforeEach(() => { vi.clearAllMocks(); mockQuery(); });
  it("keeps every registered route visible with new deposits blocked on mainnet", () => {
    render(<YieldTable />, { wrapper });
    expect(screen.getByText("Zest")).toBeVisible();
    expect(screen.getByText("Hermetica hBTC")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View Zest details" }));
    expect(screen.getByRole("button", { name: "Deposits unavailable" })).toBeDisabled();
    expect(screen.queryByText(/principal-protected|locked in audited/i)).not.toBeInTheDocument();
  });
  it("displays a fresh rate while keeping authorization independent from the feed", () => {
    render(<YieldTable />, { wrapper });
    expect(screen.getByText("3.4%")).toBeVisible();
    expect(screen.getByText(/New deposits are disabled/)).toBeVisible();
  });
  it("hides stale rates instead of presenting them as current", () => {
    mockQuery([{ ...fixture, fetched_at: Date.now() - 600_001 }]);
    render(<YieldTable />, { wrapper });
    expect(screen.queryByText("3.4%")).not.toBeInTheDocument();
    expect(screen.getByText("Stale · unavailable")).toBeVisible();
  });
  it("filters by category and searches the protocol register", () => {
    render(<YieldTable />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Managed" }));
    expect(screen.queryByText("Zest")).not.toBeInTheDocument();
    expect(screen.getByText("Hermetica hBTC")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing protocol" } });
    expect(screen.getByText("No matching strategies")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Zest")).toBeVisible();
  });
  it("keeps the register useful when the rate service fails", () => {
    mockQuery(undefined, { isError: true });
    render(<YieldTable />, { wrapper });
    expect(screen.getByText("Rate data unavailable.")).toBeVisible();
    expect(screen.getByText("Zest")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });
  it("distinguishes loading and missing rate data", () => {
    mockQuery(undefined, { isLoading: true });
    const view = render(<YieldTable />, { wrapper });
    expect(screen.getByText("Checking rate sources…")).toBeVisible();
    expect(screen.getByLabelText("Listed yield strategies")).toHaveAttribute("aria-busy", "true");
    view.unmount();
    mockQuery([]);
    render(<YieldTable />, { wrapper });
    expect(screen.getByText("No yield data available")).toBeVisible();
    expect(within(screen.getByLabelText("Listed yield strategies")).getByText("Zest")).toBeVisible();
  });
});
