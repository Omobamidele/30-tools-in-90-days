import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hidden so screen recordings show only the product.
  devIndicators: false,
  // PDF parsing and the Anthropic SDK run on the Node runtime only.
  serverExternalPackages: ["unpdf", "pino"],
  experimental: {
    // Contract PDFs up to 25 MB (plus multipart overhead) are uploaded through a server action.
    serverActions: { bodySizeLimit: "26mb" },
  },
};

export default nextConfig;
