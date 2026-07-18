"use client";

import { useMemo, useState } from "react";
import NextImage from "next/image";
import { Upload } from "lucide-react";
import type { AdminAsset } from "@/lib/admin-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function AssetManagementClient({
  assets,
  sports,
  bannerTypes
}: {
  assets: AdminAsset[];
  sports: string[];
  bannerTypes: string[];
}) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [bannerType, setBannerType] = useState("all");
  const [status, setStatus] = useState("all");

  const filteredAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesQuery = !needle || `${asset.name} ${asset.type} ${asset.sport} ${asset.bannerType}`.toLowerCase().includes(needle);
      const matchesSport = sport === "all" || asset.sport === sport;
      const matchesBanner = bannerType === "all" || asset.bannerType === bannerType;
      const matchesStatus = status === "all" || asset.status === status;
      return matchesQuery && matchesSport && matchesBanner && matchesStatus;
    });
  }, [assets, bannerType, query, sport, status]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Upload Assets</CardTitle>
          <CardDescription>Add SVG, PNG, or JPG assets before mapping them to design-tool categories.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 rounded-lg border border-dashed bg-slate-50 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-semibold">Drop files or select an upload batch</p>
              <p className="text-sm text-muted-foreground">Preview mode only. Production upload should use a logged batch with QA.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Upload className="h-4 w-4" />
              Choose files
              <input type="file" multiple className="sr-only" />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asset Library</CardTitle>
          <CardDescription>Search and filter by sport, banner type, and source readiness.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Search assets..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <Select value={sport} onChange={(event) => setSport(event.target.value)} aria-label="Filter by sport">
              <option value="all">All sports</option>
              {sports.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select value={bannerType} onChange={(event) => setBannerType(event.target.value)} aria-label="Filter by banner type">
              <option value="all">All banner types</option>
              {bannerTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="SVG Ready">SVG Ready</option>
              <option value="Ready">Ready</option>
              <option value="Needs Review">Needs Review</option>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.slice(0, 36).map((asset) => (
              <article key={`${asset.name}-${asset.previewUrl}`} className="overflow-hidden rounded-lg border bg-white">
                <div className="relative flex aspect-[16/10] items-center justify-center bg-slate-100">
                  {asset.previewUrl ? (
                    <NextImage
                      src={asset.previewUrl}
                      alt={asset.name}
                      fill
                      sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-contain p-3"
                      unoptimized
                    />
                  ) : (
                    <div className="text-sm font-semibold text-muted-foreground">No preview</div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-black">{asset.name}</h3>
                    <Badge variant={asset.status === "Needs Review" ? "warning" : "success"}>{asset.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{asset.sport}</span>
                    <span>{asset.bannerType}</span>
                    <span>{asset.type}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
            <span>Showing {Math.min(filteredAssets.length, 36)} of {filteredAssets.length} filtered assets</span>
            <Button variant="outline" size="sm">Export filtered list</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
