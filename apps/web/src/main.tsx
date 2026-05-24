import { AppShell } from "@/components/app-shell/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/i18n";
import { PageViewTracker } from "@/lib/track";
import { RequireAdmin } from "@/routes/admin/require-admin";
import { Brief } from "@/routes/brief";
import { DogDetail } from "@/routes/dog-detail";
import { DogForm } from "@/routes/dog-form";
import { DogsList } from "@/routes/dogs-list";
import { ForgotPassword } from "@/routes/forgot-password";
import { Journal } from "@/routes/journal";
import { Landing } from "@/routes/landing";
import { Login } from "@/routes/login";
import { NotFound } from "@/routes/not-found";
import { Overview } from "@/routes/overview";
import { Privacy } from "@/routes/privacy";
import { Profile } from "@/routes/profile";
import { RedirectIfAuthed } from "@/routes/redirect-if-authed";
import { Register } from "@/routes/register";
import { RequireAuth } from "@/routes/require-auth";
import { ResetPassword } from "@/routes/reset-password";
import { Settings } from "@/routes/settings";
import { SharedBrief } from "@/routes/shared-brief";
import { Terms } from "@/routes/terms";
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

const AdminTrainers = lazy(() =>
  import("@/routes/admin/trainers").then((m) => ({ default: m.AdminTrainers })),
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
            <Route
              path="/login"
              element={
                <RedirectIfAuthed>
                  <Login />
                </RedirectIfAuthed>
              }
            />
            <Route
              path="/register"
              element={
                <RedirectIfAuthed>
                  <Register />
                </RedirectIfAuthed>
              }
            />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/b/:token" element={<SharedBrief />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/my" element={<Overview />} />
              <Route path="/my/dogs" element={<DogsList />} />
              <Route path="/my/dogs/new" element={<DogForm mode="create" />} />
              <Route path="/my/dogs/:id" element={<DogDetail />} />
              <Route path="/my/dogs/:id/edit" element={<DogForm mode="edit" />} />
              <Route path="/my/dogs/:id/brief" element={<Brief />} />
              <Route path="/my/journal" element={<Journal />} />
              <Route path="/my/brief" element={<Brief />} />
              <Route path="/my/trainers" element={<Trainers />} />
              <Route path="/my/trainers/:id" element={<TrainerDetail />} />
              <Route path="/my/profile" element={<Profile />} />
              <Route path="/my/settings" element={<Settings />} />
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
            <Route
              path="/admin/trainers"
              element={
                <RequireAdmin>
                  <Suspense fallback={<p className="p-8">Loading…</p>}>
                    <AdminTrainers />
                  </Suspense>
                </RequireAdmin>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
