import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // Redirect TanStack Start's bundled server entry to src/server.ts (the SSR
    // error wrapper). nitro builds the deployable output from that entry.
    tanstackStart({ server: { entry: "server" } }),
    nitro(),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-store"],
  },
});
