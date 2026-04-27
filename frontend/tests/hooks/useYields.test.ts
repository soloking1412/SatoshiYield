import { describe, it, expect, afterEach, afterAll, beforeAll } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createElement } from "react";
import { useYields } from "../../src/hooks/useYields.js";
import type { NormalizedYield } from "../../src/types/yield.js";

const MOCK_YIELDS: NormalizedYield[] = [
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
];

const server = setupServer(
  http.get("/api/yields", () => HttpResponse.json(MOCK_YIELDS))
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useYields", () => {
  it("returns yield data from the API", async () => {
    const { result } = renderHook(() => useYields(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0]!.protocol).toBe("bitflow");
    expect(result.current.data![0]!.apy_percent).toBe(22.0);
  });

  it("sets isError on non-200 response", async () => {
    server.use(http.get("/api/yields", () => new HttpResponse(null, { status: 503 })));

    const { result } = renderHook(() => useYields(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("sets isLoading true initially before data arrives", () => {
    const { result } = renderHook(() => useYields(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
