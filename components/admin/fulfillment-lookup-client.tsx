"use client";

import NextImage from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  manifestUrl?: string;
  lookupUrl?: string;
  teamName?: string;
  layers?: DesignLayer[];
  sourceSvgStats?: {
    objectCount?: number;
    imageCount?: number;
    textCount?: number;
    layered?: boolean;
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

type OrderLookup = {
  order?: {
    name?: string;
    customer?: string;
  };
  designIds?: string[];
};

function textValue(layer: DesignLayer) {
  return String(layer.text || layer.value || "").trim();
}

function layerLabel(layer: DesignLayer, index: number) {
  return String(layer.name || layer.sourceName || layer.data?.name || layer.id || layer.role || layer.data?.role || layer.type || `Text layer ${index + 1}`);
}

function externalLinks(manifest: DesignManifest) {
  return [
    ["Open PNG proof", manifest.previewUrl],
    ["Open layered SVG", manifest.sourceSvgUrl],
    ["Open editable JSON", manifest.jsonUrl],
    ["Open fulfillment page", manifest.lookupUrl || (manifest.id ? `/fulfillment.html?designId=${encodeURIComponent(manifest.id)}` : "")]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

export function FulfillmentLookupClient() {
  const [designId, setDesignId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [manifest, setManifest] = useState<DesignManifest | null>(null);
  const [orderLookup, setOrderLookup] = useState<OrderLookup | null>(null);
  const [status, setStatus] = useState("Enter a Design ID to load the exact customer design.");
  const [busy, setBusy] = useState(false);

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

  async function lookupDesign(id: string) {
    const response = await fetch(`/api/designs?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Design lookup failed.");
    setManifest(data);
    setOrderLookup(null);
    setStatus(`Loaded ${data.id || id}.`);
  }

  async function lookupOrder(order: string) {
    const response = await fetch(`/api/fulfillment-lookup?order=${encodeURIComponent(order)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.manualWorkflow || data.error || "Order lookup failed.");
    setOrderLookup(data);
    setManifest(null);
    setStatus(`Loaded ${data.order?.name || order}.`);
  }

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
            <div className="mt-4 flex flex-wrap gap-2">
              {(orderLookup.designIds || []).map((id) => (
                <Button key={id} variant="outline" size="sm" type="button" onClick={() => {
                  setDesignId(id);
                  void lookupDesign(id);
                }}>
                  {id}
                </Button>
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
                  <Badge variant={manifest.sourceSvgStats?.layered ? "success" : "warning"}>
                    {manifest.sourceSvgStats?.layered ? "Layered SVG" : "Flat warning"}
                  </Badge>
                  <Badge variant="secondary">{manifest.sourceSvgStats?.objectCount || 0} objects</Badge>
                  <Badge variant="secondary">{manifest.sourceSvgStats?.textCount || 0} text layers</Badge>
                </div>
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
      </CardContent>
    </Card>
  );
}
