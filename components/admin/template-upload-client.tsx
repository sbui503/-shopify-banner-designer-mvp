"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, LoaderCircle, Upload } from "lucide-react";
import {
  ADMIN_TEMPLATE_BANNER_TYPES,
  ADMIN_TEMPLATE_SPORTS,
  buildAdminTemplateDesignerUrl,
  type UploadedAdminTemplate
} from "@/lib/admin-template";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function TemplateUploadClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState<(typeof ADMIN_TEMPLATE_SPORTS)[number]>("Soccer");
  const [bannerType, setBannerType] = useState<(typeof ADMIN_TEMPLATE_BANNER_TYPES)[number]>("Hem & Grommet");
  const [playerCount, setPlayerCount] = useState("0");
  const [photoFrame, setPhotoFrame] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState<UploadedAdminTemplate | null>(null);

  async function uploadTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file && !sourceUrl.trim()) {
      setMessage("Choose one SVG file or enter one owned SVG URL.");
      return;
    }
    if (file && sourceUrl.trim()) {
      setMessage("Use either the SVG file field or the owned SVG URL field, not both.");
      return;
    }

    setBusy(true);
    setMessage("Uploading and validating editable SVG layers...");
    setCreated(null);
    try {
      const payload = new FormData();
      payload.set("title", title);
      payload.set("sport", sport);
      payload.set("bannerType", bannerType);
      payload.set("playerCount", playerCount);
      payload.set("photoFrame", String(photoFrame));
      if (file) payload.set("file", file);
      if (sourceUrl.trim()) payload.set("sourceUrl", sourceUrl.trim());
      const response = await fetch("/api/admin/templates", {
        method: "POST",
        body: payload,
        credentials: "same-origin"
      });
      const result = await response.json() as { template?: UploadedAdminTemplate; error?: string };
      if (!response.ok || !result.template) throw new Error(result.error || "Template upload failed.");

      setCreated(result.template);
      setMessage(`${result.template.title} uploaded with ${result.template.stats.objectCount} editable SVG objects.`);
      setTitle("");
      setPlayerCount("0");
      setPhotoFrame(false);
      setSourceUrl("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="template-upload-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          <CardTitle>Upload New Template</CardTitle>
        </div>
        <CardDescription>Store and validate a layered SVG template before opening it in the customer designer.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={uploadTemplate} data-testid="template-upload-form">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Template title</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Test 7 Soccer Template"
                minLength={3}
                maxLength={120}
                required
              />
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Sport</span>
              <Select value={sport} onChange={(event) => setSport(event.target.value as typeof sport)}>
                {ADMIN_TEMPLATE_SPORTS.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Banner type</span>
              <Select value={bannerType} onChange={(event) => setBannerType(event.target.value as typeof bannerType)}>
                {ADMIN_TEMPLATE_BANNER_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Player count</span>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={playerCount}
                onChange={(event) => setPlayerCount(event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Layered SVG file (4 MB maximum)</span>
              <Input ref={fileRef} type="file" accept=".svg,image/svg+xml" />
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>Or owned SVG URL</span>
              <Input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://...public.blob.vercel-storage.com/.../template.svg"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={photoFrame}
                onChange={(event) => setPhotoFrame(event.target.checked)}
                className="h-4 w-4 rounded border"
              />
              Photo-frame template
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "Uploading..." : "Upload template"}
            </Button>
          </div>

          {message ? (
            <div
              role="status"
              className={`rounded-md border p-3 text-sm font-semibold ${created ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "bg-slate-50 text-slate-700"}`}
            >
              {created ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : null}
              {message}
            </div>
          ) : null}

          {created ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-3 text-sm">
              <span className="font-semibold">{created.stats.layerCount || created.stats.objectCount} detected layer(s)</span>
              <span className="text-muted-foreground">Stored as {created.id}</span>
              <Button asChild variant="outline" size="sm" className="sm:ml-auto">
                <a href={buildAdminTemplateDesignerUrl(created)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open in designer
                </a>
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
