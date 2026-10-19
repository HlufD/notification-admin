import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErrorState } from "./components/ui";
import { ApiRequestError } from "./api/client";
import EventPage from "./pages/EventPage";
import NamespacesPage from "./pages/NamespacesPage";
import ServicePage from "./pages/ServicePage";
import ServicesPage from "./pages/ServicesPage";
import SnippetsPage from "./pages/SnippetsPage";
import TemplateEditorPage from "./pages/TemplateEditorPage";
import "./index.css";

const notFound = new ApiRequestError(404, {
  code: "ROUTE_NOT_FOUND",
  message: "This page doesn't exist.",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<NamespacesPage />} />
          <Route path="namespaces/:namespace" element={<ServicesPage />} />
          <Route path="services/:service" element={<ServicePage />} />
          <Route path="services/:service/events/:event" element={<EventPage />} />
          <Route
            path="services/:service/events/:event/templates/:audience/:channel"
            element={<TemplateEditorPage />}
          />
          <Route path="snippets" element={<SnippetsPage />} />
          <Route path="snippets/:key" element={<SnippetsPage />} />
          <Route
            path="*"
            element={<ErrorState error={notFound} back={{ to: "/", label: "Home" }} />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
