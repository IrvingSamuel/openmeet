import type { MetadataRoute } from "next";
import { resolveSystemUiTheme } from "@/lib/system-theme";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const theme = await resolveSystemUiTheme();
  const name = theme.wordmark;
  const iconSrc = theme.logoUrl || theme.faviconUrl;

  const icons: MetadataRoute.Manifest["icons"] = iconSrc
    ? [
        {
          src: iconSrc,
          sizes: "any",
          type: "image/png",
          purpose: "any",
        },
      ]
    : [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ];

  return {
    name,
    short_name: name.slice(0, 12),
    description: `Videoconferência inteligente white-label com copiloto ${name}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: theme.background || "#05060f",
    theme_color: theme.primary || "#05060f",
    categories: ["business", "productivity", "social"],
    icons,
  };
}
