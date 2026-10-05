import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: false,
  additionalPrecacheEntries: [
    { url: "/~offline", revision: "openmeet-offline-v1" },
  ],
});

const nextConfig: NextConfig = {
  // Lets updates build next to the live `.next` and swap it in (see README › Updating).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  eslint: {
    // API auth/logout use plain <a> (full navigation); ignoreDuringBuilds avoids blocking deploys.
    ignoreDuringBuilds: true,
  },
};

export default withSerwist(withNextIntl(nextConfig));
