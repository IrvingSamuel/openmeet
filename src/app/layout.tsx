import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

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

export const metadata: Metadata = {
  metadataBase: new URL("https://meet.chronos.com.pt"),
  title: {
    default: "Chronos Meet — Smart white-label videoconferencing",
    template: "%s · Chronos Meet",
  },
  description:
    "Open-source videoconferencing with your own visual identity, live captions and a copilot that turns meetings into Chronos tasks.",
  applicationName: "Chronos Meet",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Chronos Meet",
    title: "Chronos Meet — Smart white-label videoconferencing",
    description:
      "Rooms branded for your company, live captions and automatic minutes integrated with Chronos boards.",
  },
  robots: { index: true, follow: true },
};

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
