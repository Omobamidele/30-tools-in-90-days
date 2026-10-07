import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hidden so screen recordings show only the product.
  devIndicators: false,
  serverExternalPackages: ["pino"],
};

export default nextConfig;
