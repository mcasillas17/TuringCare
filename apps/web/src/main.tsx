import { AppShell } from "@/components/app-shell/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/i18n";
import { PageViewTracker } from "@/lib/track";
import { RequireAdmin } from "@/routes/admin/require-admin";
import { Brief } from "@/routes/brief";
import { DogDetail } from "@/routes/dog-detail";
import { DogForm } from "@/routes/dog-form";
import { DogsList } from "@/routes/dogs-list";
import { Journal } from "@/routes/journal";
import { Landing } from "@/routes/landing";
import { Login } from "@/routes/login";
import { Overview } from "@/routes/overview";
import { Profile } from "@/routes/profile";
import { Register } from "@/routes/register";
import { RequireAuth } from "@/routes/require-auth";
import { Settings } from "@/routes/settings";
import { TrainerDetail } from "@/routes/trainer-detail";
import { Trainers } from "@/routes/trainers";
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
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/app" element={<Overview />} />
              <Route path="/app/dogs" element={<DogsList />} />
              <Route path="/app/dogs/new" element={<DogForm mode="create" />} />
              <Route path="/app/dogs/:id" element={<DogDetail />} />
              <Route path="/app/dogs/:id/edit" element={<DogForm mode="edit" />} />
              <Route path="/app/dogs/:id/brief" element={<Brief />} />
              <Route path="/app/journal" element={<Journal />} />
              <Route path="/app/brief" element={<Brief />} />
              <Route path="/app/trainers" element={<Trainers />} />
              <Route path="/app/trainers/:id" element={<TrainerDetail />} />
              <Route path="/app/profile" element={<Profile />} />
              <Route path="/app/settings" element={<Settings />} />
            </Route>
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
