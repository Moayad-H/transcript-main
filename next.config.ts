import { execSync } from "child_process";
import type { NextConfig } from "next";
import packageJson from "./package.json";

function getBuildNumber(): string {
  try {
    return execSync("git rev-list --count HEAD").toString().trim();
  } catch {
    return "0";
  }
}

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: `${packageJson.version}+${getBuildNumber()}`,
  },
};

export default nextConfig;
