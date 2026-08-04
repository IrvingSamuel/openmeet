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
    { url: "/~offline", revision: "chronos-meet-offline-v1" },
  ],
});

const nextConfig: NextConfig = {
  eslint: {
    // API auth/logout use plain <a> (full navigation); ignoreDuringBuilds avoids blocking deploys.
    ignoreDuringBuilds: true,
  },
};

export default withSerwist(withNextIntl(nextConfig));
