"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type AssetUrlFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  /** @deprecated prefer uploadUrl */
  slug?: string;
  uploadUrl?: string;
  kind: "logo" | "pattern";
  placeholder?: string;
};

export function AssetUrlField({
  label,
  hint,
  value,
  onChange,
  slug,
  uploadUrl,
  kind,
  placeholder,
}: AssetUrlFieldProps) {
  const t = useTranslations("brand.asset");
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const endpoint =
    uploadUrl || (slug ? `/api/rooms/${slug}/brand/upload` : "/api/me/brand/upload");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const res = await fetch(endpoint, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("uploadFailed"));
        return;
      }
      onChange(data.url);
      toast.success(t("uploaded"));
    } catch {
      toast.error(t("uploadNetworkFailed"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Input
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "https://…/image.svg"}
        hint={hint}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {t("upload")}
        </Button>
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="h-8 max-w-[96px] rounded border border-line object-contain bg-black/40 p-0.5"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange("")}
            >
              {t("clear")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
