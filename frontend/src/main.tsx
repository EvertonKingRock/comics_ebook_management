import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { Layout } from "./components/Layout";
import "./index.css";
import { applyTheme } from "./lib/theme";
import { DashboardPage } from "./pages/DashboardPage";
import { LibraryPage } from "./pages/library/LibraryPage";
import { SeriesPage } from "./pages/series/SeriesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TagsPage } from "./pages/TagsPage";

applyTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/library", element: <LibraryPage /> },
      { path: "/series/:id", element: <SeriesPage /> },
      { path: "/tags", element: <TagsPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <DashboardPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
    </QueryClientProvider>
  </StrictMode>,
);
