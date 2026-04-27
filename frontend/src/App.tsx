import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";
import { WalletProvider } from "./context/WalletContext.js";
import { Header } from "./components/layout/Header.js";
import { Footer } from "./components/layout/Footer.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Portfolio } from "./pages/Portfolio.js";
import { NotFound } from "./pages/NotFound.js";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-surface-base text-text-primary">
            <Header />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
            <Footer />
          </div>
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  );
}
