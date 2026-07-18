"use client";

import { ChangeEvent, useMemo, useState } from "react";
import {
  BadgeCheck,
  Boxes,
  Clipboard,
  Download,
  ExternalLink,
  FileInput,
  FileJson,
  ImagePlus,
  Info,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  WandSparkles
} from "lucide-react";
import type { AdminTemplate } from "@/lib/admin-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type QueueItem = AdminTemplate & {
  queueId: string;
  notes?: string;
};

type StagedAsset = {
  id: string;
  name: string;
  category: string;
  sport: string;
  bannerType: string;
  resizeMode: string;
  fileCount: number;
  status: string;
};

const toolGroups = [
  {
    title: "Template Generation",
    icon: Sparkles,
    tools: ["Sport selector", "Banner type selector", "Player count lock", "SVG layout dropdown", "Preview all layouts", "Use design"]
  },
  {
    title: "Layer Editing",
    icon: Layers3,
    tools: ["Object select", "Layer list", "Text edit", "Photo-frame upload", "Align to artboard", "Bring forward/back"]
  },
  {
    title: "Asset Operations",
    icon: Boxes,
    tools: ["Logo upload", "SVG import", "PNG import", "Background fit/fill", "Clip art", "Team logo"]
  },
  {
    title: "Proof and Fulfillment",
    icon: BadgeCheck,
    tools: ["Cart preview", "Customer proof email", "No print proof", "Layered SVG package", "Editable JSON", "Order lookup"]
  }
];

const assetCategories = [
  "Photo Frame",
  "Font",
  "Object",
  "Team Logo",
  "Clip Art",
  "Background",
  "Nameplate",
  "Sport Icon"
];

function templateKey(template: AdminTemplate) {
  return `${template.title}:${template.sourceUrl}`;
}

function uniqueValues(values: Array<string | number>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function designerUrl(template: AdminTemplate) {
  const params = new URLSearchParams({
    templateSvg: template.sourceUrl,
    productTitle: template.title,
    productShape: template.bannerType,
    productTags: `${template.sport},${template.bannerType},${template.playerCount}-player`,
    autoLoadProduct: "1",
    autoLayer: "svg",
    panel: "templates"
  });
  return `/?${params.toString()}#team-banner-designer-section`;
}

function downloadText(fileName: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white text-slate-500"
      title={text}
      aria-label={text}
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

export function TemplateGeneratorAdminClient({
  templates,
  sports,
  bannerTypes
}: {
  templates: AdminTemplate[];
  sports: string[];
  bannerTypes: string[];
}) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [bannerType, setBannerType] = useState("all");
  const [playerCount, setPlayerCount] = useState("all");
  const [photoFrameOnly, setPhotoFrameOnly] = useState("all");
  const [selectedKey, setSelectedKey] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [stagedAssets, setStagedAssets] = useState<StagedAsset[]>([]);
  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState(assetCategories[0]);
  const [assetSport, setAssetSport] = useState(sports[0] || "General");
  const [assetBannerType, setAssetBannerType] = useState(bannerTypes[0] || "Hem & Grommet");
  const [resizeMode, setResizeMode] = useState("contain-safe-area");
  const [fileCount, setFileCount] = useState(0);
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("Select a template to open it in the admin test bench.");

  const playerCounts = useMemo(() => uniqueValues(templates.map((template) => template.playerCount).filter(Boolean)), [templates]);

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((template) => {
      const haystack = `${template.title} ${template.sport} ${template.bannerType} ${template.sourceUrl}`.toLowerCase();
      const matchesQuery = !needle || haystack.includes(needle);
      const matchesSport = sport === "all" || template.sport === sport;
      const matchesBanner = bannerType === "all" || template.bannerType === bannerType;
      const matchesPlayer = playerCount === "all" || String(template.playerCount) === playerCount;
      const matchesPhoto = photoFrameOnly === "all" || (photoFrameOnly === "photo" ? template.photoFrame : !template.photoFrame);
      return matchesQuery && matchesSport && matchesBanner && matchesPlayer && matchesPhoto && template.sourceUrl;
    });
  }, [bannerType, photoFrameOnly, playerCount, query, sport, templates]);

  const selectedTemplate = useMemo(() => {
    return filteredTemplates.find((template) => templateKey(template) === selectedKey) || filteredTemplates[0] || templates[0];
  }, [filteredTemplates, selectedKey, templates]);

  const activeDesignerUrl = selectedTemplate ? designerUrl(selectedTemplate) : "/";

  function addToQueue(template: AdminTemplate) {
    setQueue((current) => {
      if (current.some((item) => templateKey(item) === templateKey(template))) return current;
      return [...current, { ...template, queueId: `${templateKey(template)}:${Date.now()}` }];
    });
    setMessage(`${template.title} added to bulk queue.`);
  }

  function addFilteredToQueue() {
    const next = filteredTemplates.slice(0, 50);
    setQueue((current) => {
      const existing = new Set(current.map(templateKey));
      const additions = next
        .filter((template) => !existing.has(templateKey(template)))
        .map((template, index) => ({ ...template, queueId: `${templateKey(template)}:${Date.now()}:${index}` }));
      return [...current, ...additions];
    });
    setMessage(`Added ${next.length} filtered templates to the bulk queue.`);
  }

  function exportQueueJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      type: "tsb-admin-template-bulk-queue",
      templates: queue.map((item) => ({
        title: item.title,
        sport: item.sport,
        bannerType: item.bannerType,
        playerCount: item.playerCount,
        sourceUrl: item.sourceUrl,
        photoFrame: item.photoFrame,
        editable: item.editable,
        designerUrl: designerUrl(item)
      })),
      stagedAssets
    };
    downloadText("tsb-template-bulk-queue.json", JSON.stringify(payload, null, 2));
  }

  function exportQueueCsv() {
    const header = ["title", "sport", "banner_type", "player_count", "source_url", "photo_frame", "designer_url"];
    const rows = queue.map((item) => [
      item.title,
      item.sport,
      item.bannerType,
      item.playerCount,
      item.sourceUrl,
      item.photoFrame ? "yes" : "no",
      designerUrl(item)
    ]);
    downloadText("tsb-template-bulk-queue.csv", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv");
  }

  async function copyDesignerUrl() {
    await navigator.clipboard.writeText(activeDesignerUrl);
    setMessage("Designer test URL copied.");
  }

  function stageAsset() {
    const name = assetName.trim() || `${assetSport} ${assetCategory}`;
    setStagedAssets((current) => [
      ...current,
      {
        id: `asset_${Date.now()}`,
        name,
        category: assetCategory,
        sport: assetSport,
        bannerType: assetBannerType,
        resizeMode,
        fileCount,
        status: "Staged for QA import"
      }
    ]);
    setAssetName("");
    setFileCount(0);
    setMessage(`${name} staged for admin import review.`);
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    setFileCount(event.target.files?.length || 0);
  }

  function importAiManifest() {
    try {
      const parsed = JSON.parse(importText);
      const incomingTemplates = Array.isArray(parsed.templates) ? parsed.templates : Array.isArray(parsed) ? parsed : [];
      const additions: QueueItem[] = incomingTemplates
        .filter((item: Record<string, unknown>) => item && (item.sourceUrl || item.url))
        .slice(0, 100)
        .map((item: Record<string, unknown>, index: number) => ({
          title: String(item.title || item.name || `Imported template ${index + 1}`),
          sport: String(item.sport || "General"),
          bannerType: String(item.bannerType || item.type || "Hem & Grommet"),
          playerCount: Number(item.playerCount || item.players || 0),
          sourceUrl: String(item.sourceUrl || item.url || ""),
          status: String(item.status || "imported"),
          editable: Boolean(item.editable ?? item.nativeEditableSvg ?? true),
          photoFrame: Boolean(item.photoFrame ?? item.premiumPhotoFrame),
          queueId: `imported:${Date.now()}:${index}`,
          notes: "Imported from AI/helper manifest"
        }));
      setQueue((current) => [...current, ...additions]);
      setMessage(`Imported ${additions.length} AI/helper template rows into the bulk queue.`);
    } catch {
      setMessage("Import failed. Paste valid JSON with a templates array or template rows.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Template Test Bench</CardTitle>
                <CardDescription>Load native SVG templates into the customer designer with the exact production load path.</CardDescription>
              </div>
              <Badge variant="success">Customer designer iframe</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search template, sport, source..." />
              </div>
              <Select value={sport} onChange={(event) => setSport(event.target.value)} aria-label="Sport filter">
                <option value="all">All sports</option>
                {sports.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <Select value={bannerType} onChange={(event) => setBannerType(event.target.value)} aria-label="Banner type filter">
                <option value="all">All banner types</option>
                {bannerTypes.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <Select value={playerCount} onChange={(event) => setPlayerCount(event.target.value)} aria-label="Player count filter">
                <option value="all">All players</option>
                {playerCounts.map((item) => <option key={item} value={item}>{item} players</option>)}
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
              <Select
                value={selectedTemplate ? templateKey(selectedTemplate) : ""}
                onChange={(event) => setSelectedKey(event.target.value)}
                aria-label="Template to test"
              >
                {filteredTemplates.slice(0, 250).map((template) => (
                  <option key={templateKey(template)} value={templateKey(template)}>
                    {template.title} - {template.playerCount || "Auto"} player
                  </option>
                ))}
              </Select>
              <Select value={photoFrameOnly} onChange={(event) => setPhotoFrameOnly(event.target.value)} aria-label="Photo-frame filter">
                <option value="all">All source types</option>
                <option value="photo">Photo-frame only</option>
                <option value="standard">Standard only</option>
              </Select>
              <Button type="button" onClick={() => selectedTemplate && addToQueue(selectedTemplate)}>
                <Plus className="h-4 w-4" />
                Add to queue
              </Button>
            </div>

            {selectedTemplate ? (
              <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 text-sm lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-950">{selectedTemplate.title}</p>
                    <Badge variant={selectedTemplate.editable ? "success" : "warning"}>{selectedTemplate.editable ? "Editable SVG" : "Review source"}</Badge>
                    {selectedTemplate.photoFrame ? <Badge variant="secondary">Photo frame</Badge> : null}
                  </div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{selectedTemplate.sourceUrl}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" type="button" onClick={copyDesignerUrl}>
                    <Clipboard className="h-4 w-4" />
                    Copy URL
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={activeDesignerUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      New tab
                    </a>
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-lg border bg-white">
              <iframe title="Template designer test bench" src={activeDesignerUrl} className="h-[680px] w-full bg-white" />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Generation Queue</CardTitle>
              <CardDescription>Build batches for QA, AI review, Shopify mapping, or product import.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" onClick={addFilteredToQueue}>
                  <Search className="h-4 w-4" />
                  Add filtered
                </Button>
                <Button type="button" variant="outline" onClick={() => setQueue([])}>
                  <RefreshCw className="h-4 w-4" />
                  Clear queue
                </Button>
                <Button type="button" variant="outline" onClick={exportQueueJson} disabled={!queue.length}>
                  <FileJson className="h-4 w-4" />
                  Export JSON
                </Button>
                <Button type="button" variant="outline" onClick={exportQueueCsv} disabled={!queue.length}>
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="text-2xl font-black">{queue.length}</div>
                <p className="text-sm text-muted-foreground">templates queued for bulk test/generation</p>
              </div>
              <div className="max-h-[340px] space-y-2 overflow-auto pr-1">
                {queue.length ? queue.map((item) => (
                  <div key={item.queueId} className="rounded-lg border bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.sport} / {item.bannerType} / {item.playerCount || "Auto"} player</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setQueue((current) => current.filter((row) => row.queueId !== item.queueId))}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm font-semibold text-muted-foreground">No queued templates yet.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Helper Import</CardTitle>
              <CardDescription>Paste JSON generated by Qwen, Meta, Gemini, or another helper. Codex validates and queues it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                className="min-h-32 w-full rounded-md border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder='{"templates":[{"title":"Basketball 10 Player","sport":"Basketball","bannerType":"Hem & Grommet","playerCount":10,"sourceUrl":"/svg-layer-templates/example.svg"}]}'
              />
              <Button type="button" className="w-full" onClick={importAiManifest}>
                <FileInput className="h-4 w-4" />
                Import helper JSON
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Asset Creation Workspace</CardTitle>
            <CardDescription>Stage new photo frames, fonts, objects, logos, clip art, and backgrounds before QA import.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold">
                <span className="flex items-center gap-1.5">Asset name <InfoTip text="Use a production-safe name: sport-category-style-version." /></span>
                <Input value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder="basketball-frame-orange-black-v1" />
              </label>
              <label className="space-y-1.5 text-sm font-semibold">
                <span>Category</span>
                <Select value={assetCategory} onChange={(event) => setAssetCategory(event.target.value)}>
                  {assetCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold">
                <span>Sport</span>
                <Select value={assetSport} onChange={(event) => setAssetSport(event.target.value)}>
                  {sports.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold">
                <span>Banner type</span>
                <Select value={assetBannerType} onChange={(event) => setAssetBannerType(event.target.value)}>
                  {bannerTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold">
                <span className="flex items-center gap-1.5">Auto resize <InfoTip text="Contain keeps the full asset visible. Cover fills the target frame. Safe-area adds margin for print edges." /></span>
                <Select value={resizeMode} onChange={(event) => setResizeMode(event.target.value)}>
                  <option value="contain-safe-area">Contain in safe area</option>
                  <option value="cover-frame">Cover selected frame</option>
                  <option value="fit-width">Fit width</option>
                  <option value="fit-height">Fit height</option>
                  <option value="original-size">Keep original size</option>
                </Select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold">
                <span>Files</span>
                <Input type="file" multiple accept=".svg,.png,.jpg,.jpeg,.otf,.ttf,.json,.csv" onChange={handleFiles} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={stageAsset}>
                <ImagePlus className="h-4 w-4" />
                Stage asset
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadText("tsb-staged-assets.json", JSON.stringify({ exportedAt: new Date().toISOString(), stagedAssets }, null, 2))}
                disabled={!stagedAssets.length}
              >
                <Download className="h-4 w-4" />
                Export staged assets
              </Button>
            </div>
            <div className="grid gap-2">
              {stagedAssets.slice(-6).map((asset) => (
                <div key={asset.id} className="rounded-lg border bg-slate-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black">{asset.name}</p>
                    <Badge variant="secondary">{asset.status}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {asset.category} / {asset.sport} / {asset.bannerType} / {asset.resizeMode} / {asset.fileCount} file(s)
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Design Tool Function Map</CardTitle>
            <CardDescription>Admin-facing categories for the tools exposed by the customer designer.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {toolGroups.map((group) => {
                const Icon = group.icon;
                return (
                  <div key={group.title} className="rounded-lg border bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
                      <h3 className="font-black">{group.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.tools.map((tool) => (
                        <span key={tool} className="rounded-full border bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700" title={`${tool} is available in the designer workflow.`}>
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={cn("mt-4 rounded-lg border p-3 text-sm font-semibold", message.includes("failed") ? "border-red-200 bg-red-50 text-red-700" : "bg-slate-50 text-slate-700")}>
              <WandSparkles className="mr-2 inline h-4 w-4" />
              {message}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
