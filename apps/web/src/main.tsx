import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/i18n";
import { PageViewTracker } from "@/lib/track";
import { RequireAdmin } from "@/routes/admin/require-admin";
import { AppHome } from "@/routes/app";
import { Landing } from "@/routes/landing";
import { Login } from "@/routes/login";
import { Register } from "@/routes/register";
import { RequireAuth } from "@/routes/require-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";

const AdminDashboard = lazy(() =>
  import("@/routes/admin").then((m) => ({ default: m.AdminDashboard })),
);

const queryClient = new QueryClient();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <BrowserRouter>
          <PageViewTracker />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AppHome />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Suspense fallback={<p className="p-8">Loading…</p>}>
                    <AdminDashboard />
                  </Suspense>
                </RequireAdmin>
              }
            />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
