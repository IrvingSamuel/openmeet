import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { resolveSystemUiTheme } from "@/lib/system-theme";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export async function generateMetadata(): Promise<Metadata> {
  const theme = await resolveSystemUiTheme();
  const name = theme.wordmark;
  const logo = theme.logoUrl || "/OpenMeet_Logo.png";
  const favicon = theme.faviconUrl;

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL || "https://openmeet.chronos.com.pt",
    ),
    title: {
      default: `${name} — Smart white-label videoconferencing`,
      template: `%s · ${name}`,
    },
    description:
      "Open-source videoconferencing with your own visual identity, live captions and a copilot that turns meetings into summaries and webhooks.",
    applicationName: name,
    icons: {
      icon: favicon
        ? [{ url: favicon }]
        : [
            { url: "/favicon.ico", sizes: "any" },
            { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          ],
      apple: favicon
        ? [{ url: favicon }]
        : [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: name,
      title: `${name} — Smart white-label videoconferencing`,
      description:
        "Rooms branded for your company, live captions and automatic minutes for external tools via webhooks.",
      images: [
        {
          url: logo,
          width: 1000,
          height: 1000,
          alt: name,
        },
      ],
    },
    twitter: {
      card: "summary",
      images: [logo],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#05060f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
