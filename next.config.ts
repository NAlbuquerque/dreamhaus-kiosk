import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  experimental: {
    // TypeScript 7 requires this — Next.js uses the TS CLI directly
    // instead of the internal compiler API.
    useTypeScriptCli: true,
  },
};

export default withEve(nextConfig);
