import type { NextConfig } from "next";

// Cloudflare Pages sets CF_PAGES=1 during its builds. A public build must name
// its HTTPS API origin: the local default would send every visitor's browser
// to port 8000 on their own computer. See docs/deployment.md.
if (process.env.CF_PAGES === "1" && !/^https:\/\/[^/\s]+\/?$/.test(process.env.NEXT_PUBLIC_API_BASE_URL ?? "")) {
  throw new Error(
    "Cloudflare Pages build: set NEXT_PUBLIC_API_BASE_URL to the HTTPS API origin, for example https://khonsu-api.<subdomain>.workers.dev, in the project's build environment variables.",
  );
}

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
