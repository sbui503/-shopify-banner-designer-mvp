"use client";

import Link from "next/link";
import NextImage from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Download, ExternalLink, FileImage, FilePenLine, Link2, Mail, RefreshCw, Search, WandSparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  customOrderSummary,
  normalizeShopifyAttributes,
  type ShopifyCustomAttribute
} from "@/lib/shopify-custom-order";

type ShopifyAttribute = ShopifyCustomAttribute;

type GeneratedDesign = {
  id: string;
  sourceSvgUrl?: string;
  sourceSvgDownloadUrl?: string;
  designerUrl?: string;
  lookupUrl?: string;
  warnings?: string[];
  reused?: boolean;
};

type ShopifyOrder = {
  id: string;
  name: string;
  createdAt: string;
  adminUrl: string;
  financialStatus: string;
  fulfillmentStatus: string;
  total?: {
    amount?: string;
    currencyCode?: string;
  };
  designIds: string[];
  likelyDesign?: {
    id: string;
    productTitle: string;
    savedAt: string;
    secondsBeforeOrder: number;
    matchReason?: string;
  } | null;
  note?: string;
  customer?: {
    name?: string;
    email?: string;
  };
  customAttributes?: ShopifyAttribute[];
  lineItems: Array<{
    id: string;
    name: string;
    quantity: number;
    sku?: string;
    variantTitle?: string;
    productHandle?: string;
    productTitle?: string;
    customAttributes?: ShopifyAttribute[];
    generatedDesign?: GeneratedDesign | null;
  }>;
};

type OrdersResponse = {
  orders?: ShopifyOrder[];
  error?: string;
  requiresConnection?: boolean;
};

type ShopifyOrdersError = Error & {
  requiresConnection?: boolean;
};

async function fetchShopifyOrders(lookup = "") {
  const params = new URLSearchParams();
  if (lookup.trim()) params.set("lookup", lookup.trim());
  const response = await fetch(`/api/admin/shopify/orders${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as OrdersResponse;
  if (!response.ok) {
    const error = new Error(data.error || "Shopify order lookup failed.") as ShopifyOrdersError;
    error.requiresConnection = Boolean(data.requiresConnection);
    throw error;
  }
  return Array.isArray(data.orders) ? data.orders : [];
}

function formatMoney(order: ShopifyOrder) {
  const amount = Number(order.total?.amount);
  if (!Number.isFinite(amount)) return "";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: order.total?.currencyCode || "USD"
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${order.total?.currencyCode || "USD"}`;
  }
}

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatMatchTiming(secondsBeforeOrder: number) {
  const minutes = Math.max(1, Math.round(Math.abs(secondsBeforeOrder) / 60));
  return secondsBeforeOrder >= 0
    ? `Saved ${minutes} min before checkout`
    : `Saved ${minutes} min after checkout`;
}

function customFieldCount(order: ShopifyOrder) {
  return normalizeShopifyAttributes(order.customAttributes || []).length
    + order.lineItems.reduce((count, item) => count + normalizeShopifyAttributes(item.customAttributes || []).length, 0)
    + (order.note ? 1 : 0);
}

function isCustomOrderLine(attributes: ShopifyAttribute[] = []) {
  const summary = customOrderSummary(attributes);
  return Boolean(
    summary.teamName
    || summary.teamLogo
    || summary.sport
    || summary.bannerType
    || summary.expectedPlayers
    || summary.playerNameCount
    || summary.playerPhotoCount
  );
}

function fieldLabel(value: string | null | undefined) {
  const clean = String(value || "")
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "Custom field";
}

function nestedHttpUrl(value: unknown): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value.trim().replace(/&amp;/g, "&"));
      if (/^https?:$/.test(url.protocol)) return url.toString();
    } catch {
      return "";
    }
  }
  if (Array.isArray(value)) {
    return value.map(nestedHttpUrl).find(Boolean) || "";
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(nestedHttpUrl).find(Boolean) || "";
  }
  return "";
}

export function httpUrl(value: string | undefined) {
  const raw = String(value || "").trim();
  const direct = nestedHttpUrl(raw);
  if (direct) return direct;
  try {
    const parsed = nestedHttpUrl(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {}
  const match = raw.match(/https?:\/\/[^\s"'<>\\]+/i);
  return match ? nestedHttpUrl(match[0]) : "";
}

function isImageField(attribute: ShopifyAttribute, url: string) {
  return /\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(url)
    || /(?:image|photo|logo|proof|artwork)/i.test(String(attribute.key || ""));
}

export function CustomField({ attribute }: { attribute: ShopifyAttribute }) {
  const value = String(attribute.value || "").trim();
  const url = httpUrl(value);
  const showImage = Boolean(url && isImageField(attribute, url));

  return (
    <div className="grid gap-2 border-t py-3 first:border-t-0 sm:grid-cols-[180px_minmax(0,1fr)]">
      <dt className="text-xs font-black uppercase text-slate-500">{fieldLabel(attribute.key)}</dt>
      <dd className="min-w-0">
        {showImage ? (
          <div className="mb-2 flex items-start gap-3">
            <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-md border bg-slate-100">
              <NextImage
                src={url}
                alt={fieldLabel(attribute.key)}
                fill
                sizes="128px"
                className="object-contain"
                unoptimized
              />
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={url} target="_blank" rel="noreferrer">
                <FileImage className="h-4 w-4" />
                Open uploaded file
              </a>
            </Button>
          </div>
        ) : url ? (
          <a className="inline-flex items-center gap-1 break-all text-sm font-bold text-primary underline" href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4 shrink-0" />
            {value}
          </a>
        ) : (
          <p className="break-words text-sm font-semibold text-slate-900">{value || "Not provided"}</p>
        )}
      </dd>
    </div>
  );
}

export function CustomOrderCoverage({ attributes }: { attributes: ShopifyAttribute[] }) {
  const summary = customOrderSummary(attributes);
  if (!summary.fieldCount) return null;
  const namesComplete = summary.expectedPlayers > 0
    ? summary.playerNameCount >= summary.expectedPlayers
    : summary.playerNameCount > 0;
  const detail = [summary.teamName ? `Team: ${summary.teamName}` : "", summary.sport, summary.bannerType, summary.svgLayout]
    .filter(Boolean)
    .join(" / ");

  return (
    <div className="mt-3 border-y bg-slate-50 py-3">
      <p className="text-xs font-black uppercase text-slate-500">Fulfillment check</p>
      {detail ? <p className="mt-1 break-words text-sm font-bold text-slate-950">{detail}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant={summary.teamName ? "success" : "warning"}>
          {summary.teamName ? "Team name present" : "Team name missing"}
        </Badge>
        <Badge variant={namesComplete ? "success" : "warning"}>
          {summary.playerNameCount}{summary.expectedPlayers ? `/${summary.expectedPlayers}` : ""} player names
        </Badge>
        <Badge variant={summary.teamLogo ? "success" : "warning"}>
          {summary.teamLogo ? "Team logo uploaded" : "Team logo missing"}
        </Badge>
        <Badge variant={summary.playerPhotoCount ? "success" : "secondary"}>
          {summary.playerPhotoCount} player photos
        </Badge>
      </div>
    </div>
  );
}

export function ShopifyOrdersClient() {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [status, setStatus] = useState("Loading Shopify orders...");
  const [busy, setBusy] = useState(true);
  const [requiresConnection, setRequiresConnection] = useState(false);
  const [lookupInput, setLookupInput] = useState("");
  const [activeLookup, setActiveLookup] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [emailStatuses, setEmailStatuses] = useState<Record<string, string>>({});
  const [emailBusyOrderId, setEmailBusyOrderId] = useState("");
  const [testDesignId, setTestDesignId] = useState("");
  const [testEmailStatus, setTestEmailStatus] = useState("");
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [generatedDesigns, setGeneratedDesigns] = useState<Record<string, GeneratedDesign>>({});
  const [generationStatuses, setGenerationStatuses] = useState<Record<string, string>>({});
  const [generationBusyLineId, setGenerationBusyLineId] = useState("");

  const loadOrders = useCallback(async (lookup = "") => {
    const cleanLookup = lookup.trim();
    setBusy(true);
    setStatus(cleanLookup ? `Looking up ${cleanLookup}...` : "Loading Shopify orders...");
    try {
      const nextOrders = await fetchShopifyOrders(cleanLookup);
      setOrders(nextOrders);
      setActiveLookup(cleanLookup);
      setRequiresConnection(false);
      setStatus(cleanLookup
        ? (nextOrders.length ? `Found ${nextOrders.length} order for ${cleanLookup}.` : `No Shopify order found for ${cleanLookup}.`)
        : (nextOrders.length ? `${nextOrders.length} newest Shopify orders.` : "No Shopify orders found."));
    } catch (error) {
      setOrders([]);
      setRequiresConnection(Boolean((error as ShopifyOrdersError).requiresConnection));
      setStatus(error instanceof Error ? error.message : "Shopify order lookup failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  function onLookupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lookup = lookupInput.trim();
    if (!lookup) {
      setStatus("Enter an order number or Shopify order ID.");
      return;
    }
    void loadOrders(lookup);
  }

  async function sendOrderToFulfillment(order: ShopifyOrder) {
    if (customFieldCount(order) === 0) {
      setEmailStatuses((current) => ({
        ...current,
        [order.id]: "Blocked: this Shopify order has no saved custom order information."
      }));
      return;
    }
    setEmailBusyOrderId(order.id);
    setEmailStatuses((current) => ({ ...current, [order.id]: "Preparing production designs..." }));
    try {
      const customLines = order.lineItems.filter((item) => isCustomOrderLine(item.customAttributes || []));
      const productionDesignIds: string[] = [];
      for (const item of customLines) {
        const existing = generatedDesigns[item.id] || item.generatedDesign;
        if (existing?.id) {
          productionDesignIds.push(existing.id);
          continue;
        }
        const generated = await requestCustomOrderDesign(order.id, item.id);
        productionDesignIds.push(generated.id);
        recordGeneratedDesign(order, item.id, generated);
      }
      setEmailStatuses((current) => ({ ...current, [order.id]: "Sending order details and production files..." }));
      const response = await fetch("/api/admin/shopify/order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, designIds: productionDesignIds })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.alreadySent) {
        setEmailStatuses((current) => ({
          ...current,
          [order.id]: `Already sent to ${result.to || "fulfillment"}${result.sentAt ? ` on ${formatDate(result.sentAt)}` : ""}.`
        }));
        return;
      }
      if (!response.ok) throw new Error(result.error || "Fulfillment email failed.");
      setEmailStatuses((current) => ({
        ...current,
        [order.id]: `Sent to ${result.to || "info@tsbanners.com"}.`
      }));
    } catch (error) {
      setEmailStatuses((current) => ({
        ...current,
        [order.id]: error instanceof Error ? error.message : "Fulfillment email failed."
      }));
    } finally {
      setEmailBusyOrderId("");
    }
  }

  async function sendFulfillmentTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const designId = testDesignId.trim();
    if (!/^design_[0-9]+_[a-z0-9]+$/i.test(designId)) {
      setTestEmailStatus("Enter a valid saved Design ID.");
      return;
    }

    setTestEmailBusy(true);
    setTestEmailStatus("Sending labeled test order to fulfillment...");
    try {
      const response = await fetch("/api/admin/shopify/order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testDesignId: designId, confirmTest: true })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.alreadySent) {
        setTestEmailStatus(`Test already sent to ${result.to || "info@tsbanners.com"}${result.sentAt ? ` on ${formatDate(result.sentAt)}` : ""}.`);
        return;
      }
      if (!response.ok) throw new Error(result.error || "Fulfillment test email failed.");
      setTestEmailStatus(`TEST order ${designId} sent to ${result.to || "info@tsbanners.com"}.`);
    } catch (error) {
      setTestEmailStatus(error instanceof Error ? error.message : "Fulfillment test email failed.");
    } finally {
      setTestEmailBusy(false);
    }
  }

  async function generateCustomOrderDesign(order: ShopifyOrder, lineItemId: string) {
    setGenerationBusyLineId(lineItemId);
    setGenerationStatuses((current) => ({ ...current, [lineItemId]: "Generating editable layers and print SVG..." }));
    try {
      const result = await requestCustomOrderDesign(order.id, lineItemId);
      recordGeneratedDesign(order, lineItemId, result);
      setGenerationStatuses((current) => ({
        ...current,
        [lineItemId]: result.reused
          ? `Existing Design ID ${result.id} loaded.`
          : `Design ID ${result.id} created with layered SVG and backup.`
      }));
    } catch (error) {
      setGenerationStatuses((current) => ({
        ...current,
        [lineItemId]: error instanceof Error ? error.message : "Custom-order design generation failed."
      }));
    } finally {
      setGenerationBusyLineId("");
    }
  }

  async function requestCustomOrderDesign(orderId: string, lineItemId: string) {
    const response = await fetch("/api/admin/shopify/custom-order-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, lineItemId })
    });
    const result = await response.json().catch(() => ({})) as GeneratedDesign & { error?: string };
    if (!response.ok || !result.id) throw new Error(result.error || "Custom-order design generation failed.");
    return result;
  }

  function recordGeneratedDesign(order: ShopifyOrder, lineItemId: string, result: GeneratedDesign) {
    setGeneratedDesigns((current) => ({ ...current, [lineItemId]: result }));
    setOrders((current) => current.map((candidate) => candidate.id === order.id ? {
      ...candidate,
      designIds: candidate.designIds.includes(result.id) ? candidate.designIds : [...candidate.designIds, result.id],
      lineItems: candidate.lineItems.map((item) => item.id === lineItemId ? {
        ...item,
        generatedDesign: result
      } : item)
    } : candidate));
  }

  useEffect(() => {
    let cancelled = false;
    void fetchShopifyOrders()
      .then((nextOrders) => {
        if (cancelled) return;
        setOrders(nextOrders);
        setRequiresConnection(false);
        setStatus(nextOrders.length ? `${nextOrders.length} newest Shopify orders.` : "No Shopify orders found.");
      })
      .catch((error: ShopifyOrdersError) => {
        if (cancelled) return;
        setOrders([]);
        setRequiresConnection(Boolean(error.requiresConnection));
        setStatus(error.message || "Shopify order lookup failed.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Shopify Orders</CardTitle>
            <CardDescription>Live orders from the Shopify Admin API. Design IDs link directly to fulfillment files.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {requiresConnection ? (
              <Button asChild size="sm">
                <Link href="/admin/settings">
                  <Link2 className="h-4 w-4" />
                  Connect Shopify
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void loadOrders(activeLookup)}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-semibold text-muted-foreground">{status}</p>

        <form className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={onLookupSubmit}>
          <Input
            value={lookupInput}
            onChange={(event) => setLookupInput(event.target.value)}
            placeholder="Order number #1450 or Shopify order ID"
            aria-label="Shopify order number or ID"
            autoComplete="off"
          />
          <Button type="submit" disabled={busy}>
            <Search className="h-4 w-4" />
            Find order
          </Button>
          {activeLookup ? (
            <Button variant="outline" type="button" disabled={busy} onClick={() => {
              setLookupInput("");
              void loadOrders("");
            }}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          ) : null}
        </form>

        <div className="mt-4 border-t pt-4">
          <p className="text-xs font-black uppercase text-slate-500">Fulfillment email QA</p>
          <form className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={sendFulfillmentTest}>
            <Input
              value={testDesignId}
              onChange={(event) => setTestDesignId(event.target.value)}
              placeholder="Saved Design ID: design_..."
              aria-label="Saved Design ID for fulfillment test email"
              autoComplete="off"
            />
            <Button
              variant="outline"
              type="submit"
              disabled={testEmailBusy || !/^design_[0-9]+_[a-z0-9]+$/i.test(testDesignId.trim())}
            >
              <Mail className="h-4 w-4" />
              Send TEST email
            </Button>
          </form>
          {testEmailStatus ? <p className="mt-2 text-sm font-semibold text-muted-foreground">{testEmailStatus}</p> : null}
        </div>

        {orders.length ? (
          <div className="mt-4 divide-y rounded-lg border">
            {orders.map((order) => (
              <article key={order.id} className="p-4">
                <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(180px,auto)_160px] lg:items-center">
                  <div>
                    <p className="text-lg font-black text-slate-950">{order.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    {order.adminUrl ? (
                      <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                        <a href={order.adminUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open in Shopify
                        </a>
                      </Button>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {order.lineItems.map((item) => `${item.quantity}x ${item.name}`).join(", ") || "No line items"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="mt-2"
                      aria-expanded={expandedOrderId === order.id}
                      onClick={() => setExpandedOrderId((current) => current === order.id ? "" : order.id)}
                    >
                      {expandedOrderId === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      View custom order ({customFieldCount(order)})
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {order.designIds.length ? order.designIds.map((id) => (
                      <Button key={id} asChild variant="outline" size="sm">
                        <Link href={`/admin/orders?designId=${encodeURIComponent(id)}`}>{id}</Link>
                      </Button>
                    )) : order.likelyDesign ? (
                      <div className="min-w-0 space-y-2">
                        <Badge variant="warning">Likely saved design</Badge>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/orders?designId=${encodeURIComponent(order.likelyDesign.id)}`}>
                            Open recovered design
                          </Link>
                        </Button>
                        <p className="break-all text-xs font-semibold text-slate-700">{order.likelyDesign.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.likelyDesign.matchReason || "Product and time match"}. {formatMatchTiming(order.likelyDesign.secondsBeforeOrder)}. Verify before print.
                        </p>
                      </div>
                    ) : (
                      <Badge variant="warning">No Design ID</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Badge variant={/paid/i.test(order.financialStatus) ? "success" : "secondary"}>
                      {order.financialStatus || "Unknown"}
                    </Badge>
                    <Badge variant={/fulfilled/i.test(order.fulfillmentStatus) ? "success" : "secondary"}>
                      {order.fulfillmentStatus || "Unfulfilled"}
                    </Badge>
                    <span className="font-black">{formatMoney(order)}</span>
                  </div>
                </div>

                {expandedOrderId === order.id ? (
                  <div className="mt-4 border-t pt-4">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-black text-slate-950">Custom order information</h3>
                        {emailStatuses[order.id] ? (
                          <p className="mt-1 text-sm font-semibold text-muted-foreground">{emailStatuses[order.id]}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={emailBusyOrderId === order.id || customFieldCount(order) === 0}
                        onClick={() => void sendOrderToFulfillment(order)}
                      >
                        <Mail className="h-4 w-4" />
                        {customFieldCount(order) === 0 ? "Order info missing" : "Send to fulfillment"}
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-black uppercase text-slate-500">Customer</p>
                        <p className="mt-1 text-sm font-bold">{order.customer?.name || "Not provided"}</p>
                        {order.customer?.email ? <p className="break-all text-sm text-muted-foreground">{order.customer.email}</p> : null}
                      </div>
                      {order.note ? (
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Order note</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold">{order.note}</p>
                        </div>
                      ) : null}
                    </div>

                    {normalizeShopifyAttributes(order.customAttributes || []).length ? (
                      <dl className="mt-4 border-y">
                        {normalizeShopifyAttributes(order.customAttributes || []).map((attribute, index) => (
                          <CustomField key={`${attribute.key}-${index}`} attribute={attribute} />
                        ))}
                      </dl>
                    ) : null}

                    <div className="mt-4 divide-y border-y">
                      {order.lineItems.map((item) => (
                        <section key={item.id} className="py-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h4 className="font-black text-slate-950">{item.quantity}x {item.name}</h4>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {[item.variantTitle, item.sku ? `SKU ${item.sku}` : ""].filter(Boolean).join(" · ") || "Custom product"}
                              </p>
                            </div>
                            <Badge variant={normalizeShopifyAttributes(item.customAttributes || []).length ? "success" : "secondary"}>
                              {normalizeShopifyAttributes(item.customAttributes || []).length} custom fields
                            </Badge>
                          </div>
                          {normalizeShopifyAttributes(item.customAttributes || []).length ? (
                            <>
                              <CustomOrderCoverage attributes={item.customAttributes || []} />
                              {isCustomOrderLine(item.customAttributes || []) ? (() => {
                                const generated = generatedDesigns[item.id] || item.generatedDesign || null;
                                const downloadUrl = generated?.sourceSvgDownloadUrl
                                  || (generated?.id ? `/api/admin/design-svg?id=${encodeURIComponent(generated.id)}&download=1` : "");
                                return (
                                  <div className="mt-3 border-y bg-emerald-50/40 py-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div>
                                        <p className="text-xs font-black uppercase text-emerald-800">Production design</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-700">
                                          Create an editable Design ID from this item&apos;s saved team, staff, player, logo, and photo fields.
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={generationBusyLineId === item.id}
                                        onClick={() => void generateCustomOrderDesign(order, item.id)}
                                      >
                                        <WandSparkles className="h-4 w-4" />
                                        {generationBusyLineId === item.id
                                          ? "Generating..."
                                          : generated ? "Load Design ID" : "Generate Design ID"}
                                      </Button>
                                    </div>
                                    {generationStatuses[item.id] ? (
                                      <p className="mt-2 text-sm font-bold text-slate-700">{generationStatuses[item.id]}</p>
                                    ) : null}
                                    {generated ? (
                                      <div className="mt-3 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                                        {generated.sourceSvgUrl ? (
                                          <a
                                            className="relative block aspect-[5/3] overflow-hidden rounded-md border bg-white"
                                            href={generated.sourceSvgUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <NextImage
                                              src={generated.sourceSvgUrl}
                                              alt={`Generated design ${generated.id}`}
                                              fill
                                              sizes="180px"
                                              className="object-contain"
                                              unoptimized
                                            />
                                          </a>
                                        ) : null}
                                        <div className="min-w-0">
                                          <p className="break-all text-sm font-black text-slate-950">{generated.id}</p>
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            <Button asChild variant="outline" size="sm">
                                              <Link href={`/admin/orders?designId=${encodeURIComponent(generated.id)}`}>
                                                <FileImage className="h-4 w-4" />
                                                Preview files
                                              </Link>
                                            </Button>
                                            {generated.designerUrl ? (
                                              <Button asChild variant="outline" size="sm">
                                                <a href={generated.designerUrl} target="_blank" rel="noreferrer">
                                                  <FilePenLine className="h-4 w-4" />
                                                  Edit layers
                                                </a>
                                              </Button>
                                            ) : null}
                                            {downloadUrl ? (
                                              <Button asChild variant="outline" size="sm">
                                                <a href={downloadUrl} download={`${generated.id}.svg`}>
                                                  <Download className="h-4 w-4" />
                                                  Download SVG
                                                </a>
                                              </Button>
                                            ) : null}
                                          </div>
                                          {generated.warnings?.length ? (
                                            <p className="mt-2 text-xs font-bold text-amber-800">
                                              {generated.warnings.length} uploaded image{generated.warnings.length === 1 ? "" : "s"} could not be embedded. Open the order fields before printing.
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })() : null}
                              <dl className="mt-3">
                              {normalizeShopifyAttributes(item.customAttributes || []).map((attribute, index) => (
                                <CustomField key={`${attribute.key}-${index}`} attribute={attribute} />
                              ))}
                              </dl>
                            </>
                          ) : (
                            <p className="mt-3 text-sm font-semibold text-muted-foreground">No custom order information was saved on this Shopify item. Shopify cannot recover fields that were never stored; check the original form email or ask the customer to resubmit.</p>
                          )}
                        </section>
                      ))}
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
