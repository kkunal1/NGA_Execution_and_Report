import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright must stay a real Node dependency, never bundled by Turbopack/webpack.
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
