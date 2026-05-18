import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/i18n";
import { DogDetail } from "@/routes/dog-detail";
import { DogForm } from "@/routes/dog-form";
import { DogsList } from "@/routes/dogs-list";
import { Landing } from "@/routes/landing";
import { Login } from "@/routes/login";
import { Register } from "@/routes/register";
import { RequireAuth } from "@/routes/require-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <DogsList />
                </RequireAuth>
              }
            />
            <Route
              path="/app/dogs/new"
              element={
                <RequireAuth>
                  <DogForm mode="create" />
                </RequireAuth>
              }
            />
            <Route
              path="/app/dogs/:id"
              element={
                <RequireAuth>
                  <DogDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/app/dogs/:id/edit"
              element={
                <RequireAuth>
                  <DogForm mode="edit" />
                </RequireAuth>
              }
            />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </LocaleProvider>
    </QueryClientProvider>
  </StrictMode>,
);
