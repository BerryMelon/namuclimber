import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/wikiclimber',
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
};

export default nextConfig;
