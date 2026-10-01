import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";
import { WalletProvider } from "./context/WalletContext.js";
import { ToastProvider } from "./context/ToastContext.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { ConnectModalProvider } from "./context/ConnectModalContext.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Header } from "./components/layout/Header.js";
import { Footer } from "./components/layout/Footer.js";
import { BottomTabs } from "./components/layout/BottomTabs.js";
import { Home } from "./pages/Home.js";
import { Dashboard } from "./pages/Dashboard.js";
import { TVL } from "./pages/TVL.js";
import { Portfolio } from "./pages/Portfolio.js";
import { NotFound } from "./pages/NotFound.js";
import { Security } from "./pages/Security.js";
import { Integrations } from "./pages/Integrations.js";

function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const titles: Record<string, string> = { "/": "Bitcoin capital, in view", "/yields": "Explore strategies", "/portfolio": "Your portfolio", "/tvl": "Vault transparency", "/security": "Risk & release", "/integrations": "Protocol connections" };
    document.title = `${titles[pathname] ?? "Page not found"} | SatoshiYield`;
  }, [pathname]);
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <Header />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/yields" element={<Dashboard />} />
          <Route path="/tvl" element={<TVL />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/security" element={<Security />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <Footer />
      <BottomTabs />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>
            <ThemeProvider>
              <ConnectModalProvider>
                <BrowserRouter>
                  <AppShell />
                </BrowserRouter>
              </ConnectModalProvider>
            </ThemeProvider>
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
