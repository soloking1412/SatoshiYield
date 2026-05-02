import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";
import { WalletProvider } from "./context/WalletContext.js";
import { ToastProvider } from "./context/ToastContext.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { ConnectModalProvider } from "./context/ConnectModalContext.js";
import { Header } from "./components/layout/Header.js";
import { Footer } from "./components/layout/Footer.js";
import { BottomTabs } from "./components/layout/BottomTabs.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Portfolio } from "./pages/Portfolio.js";
import { NotFound } from "./pages/NotFound.js";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <ThemeProvider>
          <ConnectModalProvider>
            <ToastProvider>
              <BrowserRouter>
                <div
                  className="min-h-screen flex flex-col"
                  style={{ background: "var(--bg)", color: "var(--text)" }}
                >
                  <Header />
                  <div className="flex-1">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/portfolio" element={<Portfolio />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </div>
                  <Footer />
                  <BottomTabs />
                </div>
              </BrowserRouter>
            </ToastProvider>
          </ConnectModalProvider>
        </ThemeProvider>
      </WalletProvider>
    </QueryClientProvider>
  );
}
