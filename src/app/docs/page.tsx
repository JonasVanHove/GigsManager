"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => unknown;
  }
}

export default function ApiDocsPage() {
  useEffect(() => {
    const existingBundle = document.getElementById("swagger-ui-bundle");
    const existingPreset = document.getElementById("swagger-ui-standalone-preset");

    const boot = () => {
      if (!window.SwaggerUIBundle) return;
      window.SwaggerUIBundle({
        url: "/api/openapi",
        dom_id: "#swagger-ui",
        docExpansion: "list",
        defaultModelsExpandDepth: -1,
      });
    };

    if (existingBundle && existingPreset) {
      boot();
      return;
    }

    const bundleScript = document.createElement("script");
    bundleScript.id = "swagger-ui-bundle";
    bundleScript.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    bundleScript.async = true;

    const presetScript = document.createElement("script");
    presetScript.id = "swagger-ui-standalone-preset";
    presetScript.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js";
    presetScript.async = true;

    bundleScript.onload = () => {
      presetScript.onload = boot;
      document.body.appendChild(presetScript);
    };

    document.body.appendChild(bundleScript);
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
      />
      <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        API Docs
      </h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Interactive Swagger documentation for GigsManager.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div id="swagger-ui" />
      </div>
    </main>
  );
}
