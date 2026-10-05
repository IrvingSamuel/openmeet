import type { Metadata } from "next";
import { LiveView } from "@/components/room/LiveView";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * LiveKit Egress custom template. Egress opens this page in headless Chrome
 * with `?url=<ws>&token=<hidden recorder token>` and captures it to RTMP.
 */
export default async function LiveViewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const url = typeof params.url === "string" ? params.url : "";
  const token = typeof params.token === "string" ? params.token : "";
  return <LiveView serverUrl={url} token={token} />;
}
