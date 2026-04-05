import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "Internet Mindmap",
    description:
      "Save any web page to your personal knowledge graph with Command+Shift+S",
    permissions: [
      "activeTab",
      "scripting",
      "notifications",
      "storage",
      ...(browser === "chrome" ? ["sidePanel"] : ([] as string[])),
    ],
    commands: {
      "save-page": {
        suggested_key: {
          default: "Ctrl+Shift+S",
          mac: "Command+Shift+S",
        },
        description: "Quick save current page",
      },
      "save-page-with-notes": {
        suggested_key: {
          default: "Ctrl+Shift+X",
          mac: "Command+Shift+X",
        },
        description: "Save current page with notes",
      },
    },
    // A stable extension ID is required for Firefox so that the redirect URL
    // registered with Google Cloud Console doesn't change on every reinstall.
    // Chrome derives its own stable ID from the CRX signing key.
    browser_specific_settings: {
      gecko: {
        id: "internet-mindmap@extension",
        strict_min_version: "115.0", // storage.session requires Firefox 115+
      },
    },
  }),
  vite: () => ({
    plugins: [tailwindcss() as any],
  }),
  alias: {
    "@internet-mindmap/shared": resolve(__dirname, "../shared/src"),
    "@internet-mindmap/ui": resolve(__dirname, "../ui/src"),
  },
});
