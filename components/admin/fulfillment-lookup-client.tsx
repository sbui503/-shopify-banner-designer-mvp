"use client";

import NextImage from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Eye, Layers3, Package as PackageIcon, RefreshCw, Search } from "lucide-react";
import {
  DesignRecoveryUpload,
  type RecoveredDesignManifest
} from "@/components/admin/design-recovery-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildAdminDesignSvgUrl, buildLayerVerificationUrl } from "@/lib/design-verification-url";
import { downloadIllustratorPackage } from "@/lib/illustrator-package";
import { downloadLayeredSvg } from "@/lib/illustrator-svg-download";

type DesignLayer = {
  id?: string;
  name?: string;
  sourceName?: string;
  role?: string;
  text?: string;
  value?: string;
  type?: string;
  data?: {
    name?: string;
    role?: string;
  };
};

type DesignManifest = {
  id?: string;
  savedAt?: string;
  previewUrl?: string;
  jsonUrl?: string;
  sourceSvgUrl?: string;
  sourceSvgBlobUrl?: string;
  sourceSvgDownloadUrl?: string;
  printSourceUrl?: string;
  manifestUrl?: string;
  backupManifestUrl?: string;
  backupStatus?: string;
  lookupUrl?: string;
  designerUrl?: string;
  teamName?: string;
  productTitle?: string;
  orderNumber?: string;
  parentDesignId?: string;
  adminUploaded?: boolean;
  proofOnly?: boolean;
  layers?: DesignLayer[];
  sourceSvgStats?: {
    objectCount?: number;
    imageCount?: number;
    rasterImageCount?: number;
    vectorObjectCount?: number;
    namedLayerCount?: number;
    textCount?: number;
    layered?: boolean;
    illustratorLayered?: boolean;
  };
  project?: {
    objects?: DesignLayer[];
    canvas?: {
      objects?: DesignLayer[];
    };
  } | null;
  product?: Record<string, unknown>;
  artboard?: Record<string, unknown>;
};

type OrderDesign = {
  id: string;
  previewUrl?: string;
  jsonUrl?: string;
  sourceSvgUrl?: string;
  sourceSvgDownloadUrl?: string;
  manifestUrl?: string;
  productTitle?: string;
};

type OrderLookup = {
  order?: {
    name?: string;
    customer?: string;
  };
  designIds?: string[];
  designs?: OrderDesign[];
};

type RecentDesignResponse = {
  designs?: DesignManifest[];
  count?: number;
};

function textValue(layer: DesignLayer) {
  return String(layer.text || layer.value || "").trim();
}

function layerLabel(layer: DesignLayer, index: number) {
  return String(layer.name || layer.sourceName || layer.data?.name || layer.id || layer.role || layer.data?.role || layer.type || `Text layer ${index + 1}`);
}

function externalLinks(manifest: DesignManifest) {
  return [
    ["Open print proof", manifest.previewUrl],
    ["Open editable JSON", manifest.jsonUrl],
    ["Open backup manifest", manifest.backupManifestUrl],
    ["Open fulfillment page", manifest.lookupUrl || (manifest.id ? `/fulfillment.html?designId=${encodeURIComponent(manifest.id)}` : "")]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function layeredSvgFileUrl(manifest: DesignManifest, download = false) {
  return buildAdminDesignSvgUrl({
    designId: manifest.id,
    sourceSvgUrl: manifest.sourceSvgUrl,
    sourceSvgDownloadUrl: manifest.sourceSvgDownloadUrl || manifest.printSourceUrl,
    download
  });
}

function layerVerificationUrl(manifest: DesignManifest) {
  return buildLayerVerificationUrl({
    sourceSvgUrl: manifest.sourceSvgUrl,
    productTitle: designProductTitle(manifest),
    designId: manifest.id
  });
}

async function fetchDesignManifest(id: string) {
  const response = await fetch(`/api/designs?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Design lookup failed.");
  return data as DesignManifest;
}

async function fetchOrderLookup(order: string) {
  const response = await fetch(`/api/fulfillment-lookup?order=${encodeURIComponent(order)}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.manualWorkflow || data.error || "Order lookup failed.");
  return data as OrderLookup;
}

async function fetchRecentDesigns() {
  const response = await fetch("/api/designs?recent=50", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Recent design lookup failed.");
  return data as RecentDesignResponse;
}

function designProductTitle(design: DesignManifest) {
  return design.productTitle || String(design.product?.title || "").trim() || "Customer design";
}

function savedTime(value: string | undefined) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

type FulfillmentLookupClientProps = {
  initialDesignId?: string;
  initialOrderNumber?: string;
};

export function FulfillmentLookupClient({
  initialDesignId = "",
  initialOrderNumber = ""
}: FulfillmentLookupClientProps) {
  const hasInitialLookup = Boolean(initialDesignId.trim() || initialOrderNumber.trim());
  const [designId, setDesignId] = useState(initialDesignId);
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [manifest, setManifest] = useState<DesignManifest | null>(null);
  const [orderLookup, setOrderLookup] = useState<OrderLookup | null>(null);
  const [status, setStatus] = useState(hasInitialLookup
    ? "Loading fulfillment data..."
    : "Enter a Design ID to load the exact customer design.");
  const [busy, setBusy] = useState(hasInitialLookup);
  const [recentDesigns, setRecentDesigns] = useState<DesignManifest[]>([]);
  const [recentStatus, setRecentStatus] = useState("Loading recent customer designs...");
  const [recentBusy, setRecentBusy] = useState(true);
  const [downloadingSvgId, setDownloadingSvgId] = useState("");
  const [downloadingPackageId, setDownloadingPackageId] = useState("");

  const downloadProductionPackage = useCallback(async (design: DesignManifest) => {
    const id = String(design.id || "").trim();
    if (!id) return;
    setDownloadingPackageId(id);
    setStatus(`Building the Illustrator production package for ${id}...`);
    try {
      const result = await downloadIllustratorPackage({
        id,
        previewUrl: design.previewUrl,
        jsonUrl: design.jsonUrl,
        sourceSvgUrl: design.sourceSvgUrl,
        sourceSvgBlobUrl: design.sourceSvgBlobUrl,
        sourceSvgDownloadUrl: design.sourceSvgDownloadUrl || design.printSourceUrl,
        printSourceUrl: design.printSourceUrl,
        productTitle: designProductTitle(design),
        savedAt: design.savedAt,
        layers: design.layers,
        project: design.project
      });
      setStatus(
        `Downloaded ${result.fileName}: ${result.classification} artwork, ${result.layerCount} named layers, `
        + `${result.textCount} live text objects, and ${result.imageCount} raster image objects.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Backup package download failed.");
    } finally {
      setDownloadingPackageId("");
    }
  }, []);

  const downloadEditableSvg = useCallback(async (design: DesignManifest) => {
    const id = String(design.id || "").trim();
    if (!id) return;
    setDownloadingSvgId(id);
    setStatus(`Preparing ${id} as a named-layer editable SVG...`);
    try {
      const result = await downloadLayeredSvg({
        id,
        sourceSvgUrl: design.sourceSvgUrl,
        sourceSvgBlobUrl: design.sourceSvgBlobUrl,
        sourceSvgDownloadUrl: design.sourceSvgDownloadUrl || design.printSourceUrl,
        jsonUrl: design.jsonUrl,
        layers: design.layers
      });
      setStatus(`Downloaded ${id}: ${result.layerCount} named SVG layers (${result.vectorLayerCount} text/vector, ${result.rasterLayerCount} image).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Layered SVG download failed.");
    } finally {
      setDownloadingSvgId("");
    }
  }, []);

  const textLayers = useMemo(() => {
    const layers = [
      ...(Array.isArray(manifest?.layers) ? manifest.layers : []),
      ...(Array.isArray(manifest?.project?.objects) ? manifest.project.objects : []),
      ...(Array.isArray(manifest?.project?.canvas?.objects) ? manifest.project.canvas.objects : [])
    ];
    const seen = new Set<string>();
    return layers
      .filter((layer) => textValue(layer))
      .filter((layer, index) => {
        const key = `${layerLabel(layer, index)}:${textValue(layer)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 24);
  }, [manifest]);

  const orderDesigns = useMemo<OrderDesign[]>(() => {
    if (orderLookup?.designs?.length) return orderLookup.designs;
    return (orderLookup?.designIds || []).map((id) => ({ id }));
  }, [orderLookup]);

  const lookupDesign = useCallback(async (id: string, orderDesign?: OrderDesign) => {
    try {
      const data = await fetchDesignManifest(id);
      setManifest(data);
      setOrderLookup(null);
      setStatus(`Loaded ${data.id || id}.`);
    } catch (error) {
      if (orderDesign && (orderDesign.previewUrl || orderDesign.jsonUrl || orderDesign.sourceSvgUrl)) {
        setManifest({ ...orderDesign, id });
        setOrderLookup(null);
        setStatus(`Loaded ${id} from the Shopify order.`);
        return;
      }
      throw error;
    }
  }, []);

  const lookupOrder = useCallback(async (order: string) => {
    const data = await fetchOrderLookup(order);
    setOrderLookup(data);
    setManifest(null);
    setStatus(`Loaded ${data.order?.name || order}.`);
  }, []);

  const loadRecentDesigns = useCallback(async () => {
    setRecentBusy(true);
    setRecentStatus("Loading recent customer designs...");
    try {
      const data = await fetchRecentDesigns();
      const designs = Array.isArray(data.designs) ? data.designs : [];
      setRecentDesigns(designs);
      setRecentStatus(designs.length ? `${designs.length} most recent saved designs.` : "No saved customer designs found.");
    } catch (error) {
      setRecentDesigns([]);
      setRecentStatus(error instanceof Error ? error.message : "Recent design lookup failed.");
    } finally {
      setRecentBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchRecentDesigns()
      .then((data) => {
        if (cancelled) return;
        const designs = Array.isArray(data.designs) ? data.designs : [];
        setRecentDesigns(designs);
        setRecentStatus(designs.length ? `${designs.length} most recent saved designs.` : "No saved customer designs found.");
      })
      .catch((error) => {
        if (cancelled) return;
        setRecentDesigns([]);
        setRecentStatus(error instanceof Error ? error.message : "Recent design lookup failed.");
      })
      .finally(() => {
        if (!cancelled) setRecentBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = initialDesignId.trim();
    const order = initialOrderNumber.trim();
    if (!id && !order) return;
    let cancelled = false;
    const request = id
      ? fetchDesignManifest(id).then((data) => ({ manifest: data, orderLookup: null, status: `Loaded ${data.id || id}.` }))
      : fetchOrderLookup(order).then((data) => ({ manifest: null, orderLookup: data, status: `Loaded ${data.order?.name || order}.` }));
    void request
      .then((result) => {
        if (cancelled) return;
        setManifest(result.manifest);
        setOrderLookup(result.orderLookup);
        setStatus(result.status);
      })
      .catch((error) => {
        if (cancelled) return;
        setManifest(null);
        setOrderLookup(null);
        setStatus(error instanceof Error ? error.message : "Lookup failed.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialDesignId, initialOrderNumber]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = designId.trim();
    const order = orderNumber.trim();
    if (!id && !order) {
      setStatus("Enter a Design ID or Shopify order number.");
      return;
    }
    setBusy(true);
    setStatus("Loading fulfillment data...");
    try {
      if (id) await lookupDesign(id);
      else await lookupOrder(order);
    } catch (error) {
      setManifest(null);
      setOrderLookup(null);
      setStatus(error instanceof Error ? error.message : "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  function onRecoveredDesign(saved: RecoveredDesignManifest) {
    setManifest(saved as DesignManifest);
    setDesignId(saved.id);
    setOrderLookup(null);
    setStatus(`Saved and loaded ${saved.id}.`);
    void loadRecentDesigns();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fulfillment Design Lookup</CardTitle>
        <CardDescription>Find the exact customer proof, editable JSON, and layered source stored during checkout.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmit}>
          <Input
            value={designId}
            onChange={(event) => setDesignId(event.target.value)}
            placeholder="Design ID: design_..."
            autoComplete="off"
          />
          <Input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="Order number: #1001"
            autoComplete="off"
          />
          <Button type="submit" disabled={busy}>
            <Search className="h-4 w-4" />
            Lookup
          </Button>
        </form>

        <p className="text-sm font-semibold text-muted-foreground">{status}</p>

        <DesignRecoveryUpload orderNumber={orderNumber} onSaved={onRecoveredDesign} />

        {orderLookup ? (
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-muted-foreground">Shopify order</p>
                <h3 className="mt-1 text-xl font-black">{orderLookup.order?.name || orderNumber}</h3>
              </div>
              <Badge variant={orderLookup.designIds?.length ? "success" : "warning"}>
                {orderLookup.designIds?.length || 0} design IDs
              </Badge>
            </div>
            <div className="mt-4 grid gap-3">
              {orderDesigns.map((design) => (
                <div key={design.id} className="rounded-lg border bg-white p-3">
                  <p className="break-all text-sm font-black">{design.id}</p>
                  {design.productTitle ? <p className="mt-1 text-sm text-muted-foreground">{design.productTitle}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" type="button" onClick={() => {
                      setDesignId(design.id);
                      void lookupDesign(design.id, design).catch((error) => {
                        setStatus(error instanceof Error ? error.message : "Design lookup failed.");
                      });
                    }}>
                      Load design
                    </Button>
                    {design.previewUrl ? (
                      <Button asChild size="sm" type="button">
                        <a href={design.previewUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open print proof
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {manifest ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="relative aspect-[16/10] overflow-hidden rounded-lg border bg-slate-100">
                {manifest.previewUrl ? (
                  <NextImage
                    src={manifest.previewUrl}
                    alt={`Customer proof ${manifest.id || ""}`}
                    fill
                    sizes="(min-width: 1280px) 60vw, 100vw"
                    className="object-contain"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-muted-foreground">No PNG proof saved</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {layeredSvgFileUrl(manifest, true) ? (
                  <Button
                    size="sm"
                    type="button"
                    disabled={downloadingSvgId === manifest.id}
                    onClick={() => void downloadEditableSvg(manifest)}
                  >
                    <Download className="h-4 w-4" />
                    {downloadingSvgId === manifest.id ? "Preparing layers..." : "Download layered SVG"}
                  </Button>
                ) : null}
                {layeredSvgFileUrl(manifest, true) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={downloadingPackageId === manifest.id}
                    onClick={() => void downloadProductionPackage(manifest)}
                  >
                    <PackageIcon className="h-4 w-4" />
                    {downloadingPackageId === manifest.id ? "Building package..." : "Download backup package"}
                  </Button>
                ) : null}
                {layerVerificationUrl(manifest) ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={layerVerificationUrl(manifest)} target="_blank" rel="noreferrer">
                      <Layers3 className="h-4 w-4" />
                      Verify layers in design tool
                    </a>
                  </Button>
                ) : (
                  <Badge variant="warning">PNG proof only: upload SVG to verify layers</Badge>
                )}
                {layeredSvgFileUrl(manifest) ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={layeredSvgFileUrl(manifest)} target="_blank" rel="noreferrer">
                      <Eye className="h-4 w-4" />
                      Preview layered SVG
                    </a>
                  </Button>
                ) : null}
                {externalLinks(manifest).map(([label, href]) => (
                  <Button key={label} asChild variant="outline" size="sm">
                    <a href={href} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      {label}
                    </a>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border bg-white p-4">
                <p className="text-xs font-black uppercase text-muted-foreground">Design ID</p>
                <p className="mt-1 break-all text-sm font-black">{manifest.id}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={manifest.previewUrl ? "success" : "warning"}>
                  {manifest.previewUrl ? "Print proof saved" : "Print proof missing"}
                  </Badge>
                  {manifest.adminUploaded ? <Badge variant="secondary">Admin recovery</Badge> : null}
                  {manifest.sourceSvgUrl ? <Badge variant="success">Source SVG saved</Badge> : null}
                  {manifest.sourceSvgStats?.illustratorLayered ? <Badge variant="success">Illustrator layers saved</Badge> : null}
                  {manifest.backupStatus === "complete" ? <Badge variant="success">Backup complete</Badge> : null}
                  {manifest.sourceSvgStats ? <Badge variant="secondary">{manifest.sourceSvgStats.objectCount || 0} objects</Badge> : null}
                  {manifest.sourceSvgStats ? <Badge variant="secondary">{manifest.sourceSvgStats.textCount || 0} text layers</Badge> : null}
                </div>
                {manifest.orderNumber ? <p className="mt-3 text-sm font-bold">Linked order: {manifest.orderNumber}</p> : null}
                {manifest.parentDesignId ? <p className="mt-1 break-all text-xs font-semibold text-muted-foreground">Original Design ID: {manifest.parentDesignId}</p> : null}
              </div>

              <div className="rounded-lg border bg-white p-4">
                <p className="text-xs font-black uppercase text-muted-foreground">Customer text layers</p>
                <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                  {textLayers.length ? textLayers.map((layer, index) => (
                    <div key={`${layerLabel(layer, index)}-${index}`} className="rounded-md bg-slate-50 p-2">
                      <p className="text-xs font-semibold text-muted-foreground">{layerLabel(layer, index)}</p>
                      <p className="break-words text-sm font-black">{textValue(layer)}</p>
                    </div>
                  )) : (
                    <p className="text-sm font-semibold text-muted-foreground">No editable text values found in saved metadata.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="border-t pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-950">Recent Customer Designs</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Every newly saved customer design appears here, even when an older Shopify order is missing its Design ID.
              </p>
            </div>
            <Button variant="outline" size="sm" type="button" disabled={recentBusy} onClick={() => void loadRecentDesigns()}>
              <RefreshCw className={`h-4 w-4 ${recentBusy ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <p className="mt-3 text-sm font-semibold text-muted-foreground">{recentStatus}</p>

          {recentDesigns.length ? (
            <div className="mt-4 divide-y rounded-lg border">
              {recentDesigns.map((design) => (
                <div key={design.id} className="grid gap-3 p-3 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center">
                  <div className="relative h-20 w-28 overflow-hidden rounded-md border bg-slate-100">
                    {design.previewUrl ? (
                      <NextImage
                        src={design.previewUrl}
                        alt={`Customer proof ${design.id || ""}`}
                        fill
                        sizes="112px"
                        className="object-contain"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-2 text-center text-xs font-semibold text-muted-foreground">
                        No proof
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-950">{designProductTitle(design)}</p>
                    <p className="mt-1 break-all text-xs font-semibold text-slate-600">{design.id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{savedTime(design.savedAt)}</p>
                    {design.teamName ? <p className="mt-1 truncate text-sm font-semibold">Team: {design.teamName}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2 sm:max-w-44 sm:justify-end">
                    <Button variant="outline" size="sm" type="button" onClick={() => {
                      const id = String(design.id || "");
                      if (!id) return;
                      setDesignId(id);
                      void lookupDesign(id, {
                        id,
                        previewUrl: design.previewUrl,
                        jsonUrl: design.jsonUrl,
                        sourceSvgUrl: design.sourceSvgUrl,
                        sourceSvgDownloadUrl: design.sourceSvgDownloadUrl || design.printSourceUrl,
                        manifestUrl: design.manifestUrl,
                        productTitle: designProductTitle(design)
                      }).catch((error) => {
                        setStatus(error instanceof Error ? error.message : "Design lookup failed.");
                      });
                    }}>
                      Load
                    </Button>
                    {design.sourceSvgUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={layerVerificationUrl(design)} target="_blank" rel="noreferrer">
                          <Layers3 className="h-4 w-4" />
                          Verify layers
                        </a>
                      </Button>
                    ) : null}
                    {design.jsonUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={design.jsonUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          JSON
                        </a>
                      </Button>
                    ) : null}
                    {layeredSvgFileUrl(design, true) ? (
                      <Button
                        size="sm"
                        type="button"
                        disabled={downloadingSvgId === design.id}
                        onClick={() => void downloadEditableSvg(design)}
                      >
                        <Download className="h-4 w-4" />
                        {downloadingSvgId === design.id ? "Preparing..." : "Layered SVG"}
                      </Button>
                    ) : null}
                    {layeredSvgFileUrl(design, true) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={downloadingPackageId === design.id}
                        onClick={() => void downloadProductionPackage(design)}
                      >
                        <PackageIcon className="h-4 w-4" />
                        {downloadingPackageId === design.id ? "Building..." : "Backup package"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
