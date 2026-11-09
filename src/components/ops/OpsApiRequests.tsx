"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Badge, Skeleton } from "@/components/ui/Surface";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type ApiRequestRow = {
  id: string;
  createdAt: string;
  tokenId: string | null;
  tokenName: string;
  tokenSource: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip: string | null;
};

type TokenFilter = {
  id: string;
  name: string;
  preview: string;
};

function statusTone(code: number): "success" | "warn" | "danger" | "neutral" {
  if (code >= 200 && code < 300) return "success";
  if (code >= 400 && code < 500) return "warn";
  if (code >= 500) return "danger";
  return "neutral";
}

export function OpsApiRequests() {
  const t = useTranslations("ops.apiRequests");
  const locale = useLocale();
  const toast = useToast();
  const [items, setItems] = useState<ApiRequestRow[] | null>(null);
  const [tokens, setTokens] = useState<TokenFilter[]>([]);
  const [tokenId, setTokenId] = useState("");
  const [q, setQ] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = Boolean(opts?.append);
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams();
        if (tokenId) params.set("tokenId", tokenId);
        if (q.trim()) params.set("q", q.trim());
        if (opts?.cursor) params.set("cursor", opts.cursor);
        params.set("limit", "50");
        const res = await fetch(`/api/ops/api-requests?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "failed");
        const rows = (data.items ?? []) as ApiRequestRow[];
        setItems((prev) => (append && prev ? [...prev, ...rows] : rows));
        setNextCursor(data.nextCursor ?? null);
        if (data.filters?.tokens) {
          setTokens(data.filters.tokens as TokenFilter[]);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("loadError"));
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tokenId, q, toast, t],
  );

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initial load

  return (
    <section className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Select
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
          className="min-w-[180px]"
        >
          <option value="">{t("allTokens")}</option>
          {tokens.map((tok) => (
            <option key={tok.id} value={tok.id}>
              {tok.name}
            </option>
          ))}
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-[200px] flex-1"
        />
        <Button type="submit" size="sm" loading={loading}>
          {t("search")}
        </Button>
      </form>

      {items === null || loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-3xl glass p-8 text-center text-sm text-ink-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-3xl glass">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("col.time")}</th>
                <th className="px-4 py-3 font-semibold">{t("col.token")}</th>
                <th className="px-4 py-3 font-semibold">{t("col.method")}</th>
                <th className="px-4 py-3 font-semibold">{t("col.path")}</th>
                <th className="px-4 py-3 font-semibold">{t("col.status")}</th>
                <th className="px-4 py-3 font-semibold">{t("col.duration")}</th>
                <th className="px-4 py-3 font-semibold">{t("col.ip")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line/60 last:border-0"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                    {new Date(row.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{row.tokenName}</span>
                    {row.tokenSource === "env" ? (
                      <span className="ml-2 text-[10px] uppercase text-ink-faint">
                        env
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    {row.method}
                  </td>
                  <td
                    className="max-w-[240px] truncate px-4 py-3 font-mono text-xs text-ink-muted"
                    title={row.path}
                  >
                    {row.path}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(row.statusCode)}>
                      {row.statusCode}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {row.durationMs}ms
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-mono text-xs text-ink-faint",
                    )}
                  >
                    {row.ip || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            loading={loadingMore}
            onClick={() => void load({ append: true, cursor: nextCursor })}
          >
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
