"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, FileCode2, RefreshCw, ShoppingBag } from "lucide-react";
import { CustomField, CustomOrderCoverage, formatDate } from "@/components/admin/shopify-orders-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { normalizeShopifyAttributes, type ShopifyCustomAttribute } from "@/lib/shopify-custom-order";

type DraftLineItem = {
  id: string;
  name: string;
  title: string;
  quantity: number;
  sku?: string;
  variantTitle?: string;
  customAttributes?: ShopifyCustomAttribute[];
};

type ShopifyDraft = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  note?: string;
  tags?: string[];
  adminUrl: string;
  order?: { id?: string; name?: string; adminUrl?: string } | null;
  total?: { amount?: string; currencyCode?: string };
  customAttributes?: ShopifyCustomAttribute[];
  designIds: string[];
  lineItems: DraftLineItem[];
};

type DraftResponse = {
  drafts?: ShopifyDraft[];
  scopes?: string[];
  canRead?: boolean;
  canWrite?: boolean;
  created?: number;
  error?: string;
  requiresScope?: string;
};

const QA_SLOTS = [
  { key: "hem", label: "Hem & Grommets", teamName: "TSB QA HEM" },
  { key: "pole", label: "Pole Pocket", teamName: "TSB QA POLE" },
  { key: "triangle", label: "Triangle", teamName: "TSB QA TRIANGLE" },
  { key: "home", label: "Home Plate", teamName: "TSB QA HOME" }
] as const;

function customFieldCount(draft: ShopifyDraft) {
  return normalizeShopifyAttributes(draft.customAttributes || []).length
    + draft.lineItems.reduce((count, item) => count + normalizeShopifyAttributes(item.customAttributes || []).length, 0)
    + (draft.note ? 1 : 0);
}

function formatMoney(draft: ShopifyDraft) {
  const amount = Number(draft.total?.amount);
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: draft.total?.currencyCode || "USD"
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${draft.total?.currencyCode || "USD"}`;
  }
}

async function readDraftResponse(response: Response) {
  const data = (await response.json().catch(() => ({}))) as DraftResponse;
  if (!response.ok) throw Object.assign(new Error(data.error || "Shopify draft-order request failed."), { data });
  return data;
}

export function ShopifyDraftOrdersClient() {
  const [drafts, setDrafts] = useState<ShopifyDraft[]>([]);
  const [designIds, setDesignIds] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading Shopify draft orders...");
  const [busy, setBusy] = useState(true);
  const [createBusy, setCreateBusy] = useState(false);
  const [canRead, setCanRead] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [expandedId, setExpandedId] = useState("");

  const loadDrafts = useCallback(async () => {
    setBusy(true);
    setStatus("Loading Shopify draft orders...");
    try {
      const data = await readDraftResponse(await fetch("/api/admin/shopify/draft-orders", { cache: "no-store" }));
      const nextDrafts = Array.isArray(data.drafts) ? data.drafts : [];
      setDrafts(nextDrafts);
      setCanRead(Boolean(data.canRead));
      setCanWrite(Boolean(data.canWrite));
      setStatus(nextDrafts.length ? `${nextDrafts.length} newest Shopify draft orders.` : "No Shopify draft orders found.");
    } catch (error) {
      const data = (error as Error & { data?: DraftResponse }).data;
      setDrafts([]);
      setCanRead(Boolean(data?.canRead));
      setCanWrite(Boolean(data?.canWrite));
      setStatus(error instanceof Error ? error.message : "Shopify draft-order lookup failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDrafts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDrafts]);

  async function createQaDrafts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const designs = QA_SLOTS.map((slot) => ({
      designId: String(designIds[slot.key] || "").trim(),
      bannerType: slot.label,
      teamName: slot.teamName
    }));
    if (!designs.every((design) => /^design_[0-9]+_[a-z0-9]+$/i.test(design.designId))) {
      setStatus("Enter all four saved Design IDs before creating QA drafts.");
      return;
    }

    setCreateBusy(true);
    setStatus("Creating four QA-only draft orders...");
    try {
      const data = await readDraftResponse(await fetch("/api/admin/shopify/draft-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmQa: true, designs })
      }));
      const nextDrafts = Array.isArray(data.drafts) ? data.drafts : [];
      setDrafts(nextDrafts);
      setCanRead(true);
      setCanWrite(true);
      setStatus(`${data.created ?? nextDrafts.length} QA drafts created; ${nextDrafts.length} designs verified in Shopify.`);
      if (nextDrafts[0]) setExpandedId(nextDrafts[0].id);
    } catch (error) {
      const data = (error as Error & { data?: DraftResponse }).data;
      if (data?.requiresScope) setCanWrite(false);
      setStatus(error instanceof Error ? error.message : "Shopify QA draft creation failed.");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Shopify Draft Orders</CardTitle>
            <CardDescription>Customer details and exact design files remain attached before checkout or fulfillment.</CardDescription>
          </div>
          <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void loadDrafts()}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={canRead ? "success" : "warning"}>{canRead ? "Draft lookup ready" : "Draft read scope needed"}</Badge>
          <Badge variant={canWrite ? "success" : "warning"}>{canWrite ? "Draft creation ready" : "write_draft_orders needed"}</Badge>
          <p className="text-sm font-semibold text-muted-foreground">{status}</p>
        </div>

        <form className="mt-4 border-y py-4" onSubmit={createQaDrafts}>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-black uppercase text-slate-500">Four-banner customer-flow QA</p>
            <p className="text-sm font-semibold text-slate-800">Creates zero-dollar drafts marked DO NOT FULFILL. No invoice is sent and no order is completed.</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {QA_SLOTS.map((slot) => (
              <label key={slot.key} className="grid gap-1 text-sm font-bold text-slate-800">
                {slot.label}
                <Input
                  value={designIds[slot.key] || ""}
                  onChange={(event) => setDesignIds((current) => ({ ...current, [slot.key]: event.target.value }))}
                  placeholder="design_..."
                  aria-label={`${slot.label} Design ID`}
                  autoComplete="off"
                />
              </label>
            ))}
          </div>
          <Button className="mt-3" type="submit" disabled={createBusy || !canWrite}>
            <ShoppingBag className="h-4 w-4" />
            Create 4 QA draft orders
          </Button>
        </form>

        {drafts.length ? (
          <div className="mt-4 divide-y rounded-lg border">
            {drafts.map((draft) => (
              <article key={draft.id} className="p-4">
                <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(180px,auto)_160px] lg:items-center">
                  <div>
                    <p className="text-lg font-black text-slate-950">{draft.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(draft.createdAt)}</p>
                    {draft.adminUrl ? (
                      <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                        <a href={draft.adminUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open in Shopify
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {draft.lineItems.map((item) => `${item.quantity}x ${item.name || item.title}`).join(", ") || "No line items"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="mt-2"
                      aria-expanded={expandedId === draft.id}
                      onClick={() => setExpandedId((current) => current === draft.id ? "" : draft.id)}
                    >
                      {expandedId === draft.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      View draft details ({customFieldCount(draft)})
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {draft.designIds.length ? draft.designIds.map((designId) => (
                      <Button key={designId} asChild variant="outline" size="sm">
                        <a href={`/admin/orders?designId=${encodeURIComponent(designId)}`}>
                          <FileCode2 className="h-4 w-4" />
                          {designId}
                        </a>
                      </Button>
                    )) : <Badge variant="warning">No Design ID</Badge>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Badge variant={/open/i.test(draft.status) ? "success" : "secondary"}>{draft.status || "Unknown"}</Badge>
                    {(draft.tags || []).includes("DO-NOT-FULFILL") ? <Badge variant="warning">DO NOT FULFILL</Badge> : null}
                    <span className="font-black">{formatMoney(draft)}</span>
                  </div>
                </div>

                {expandedId === draft.id ? (
                  <div className="mt-4 border-t pt-4">
                    {draft.note ? (
                      <div className="border-b pb-3">
                        <p className="text-xs font-black uppercase text-slate-500">Draft note</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-900">{draft.note}</p>
                      </div>
                    ) : null}

                    {normalizeShopifyAttributes(draft.customAttributes || []).length ? (
                      <dl className="border-b">
                        {normalizeShopifyAttributes(draft.customAttributes || []).map((attribute, index) => (
                          <CustomField key={`${attribute.key}-${index}`} attribute={attribute} />
                        ))}
                      </dl>
                    ) : null}

                    <div className="divide-y">
                      {draft.lineItems.map((item) => {
                        const attributes = normalizeShopifyAttributes(item.customAttributes || []);
                        return (
                          <section key={item.id} className="py-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h4 className="font-black text-slate-950">{item.quantity}x {item.name || item.title}</h4>
                                <p className="mt-1 text-xs text-muted-foreground">{attributes.length} preserved custom fields</p>
                              </div>
                              <Badge variant={attributes.length ? "success" : "warning"}>{attributes.length ? "Order info present" : "Order info missing"}</Badge>
                            </div>
                            {attributes.length ? (
                              <>
                                <CustomOrderCoverage attributes={attributes} />
                                <dl className="mt-3">
                                  {attributes.map((attribute, index) => (
                                    <CustomField key={`${attribute.key}-${index}`} attribute={attribute} />
                                  ))}
                                </dl>
                              </>
                            ) : (
                              <p className="mt-3 text-sm font-semibold text-muted-foreground">No custom order information was saved on this Shopify draft. Shopify cannot recover fields that were never stored; check the original form email or ask the customer to resubmit.</p>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
