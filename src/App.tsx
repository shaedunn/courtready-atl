// CourtReady ATL — force rebuild with correct backend URL
import { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import CourtDetail from "./pages/CourtDetail";
import FacilityAdmin from "./pages/FacilityAdmin";
import Instructions from "./pages/Instructions";
import BeaconPage from "./pages/BeaconPage";
import CaptainDashboard from "./pages/CaptainDashboard";
import NotFound from "./pages/NotFound";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,   // 5 minutes
      gcTime: 10 * 60 * 1000,     // 10 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/court/:id" element={<CourtDetail />} />
            <Route path="/court/:id/admin" element={<FacilityAdmin />} />
            <Route path="/instructions" element={<Instructions />} />
            <Route path="/status/:share_slug" element={<BeaconPage />} />
            <Route path="/captain" element={<CaptainDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
