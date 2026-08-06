"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, FileImage, Link2, Mail, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  customOrderSummary,
  normalizeShopifyAttributes,
  type ShopifyCustomAttribute
} from "@/lib/shopify-custom-order";

type ShopifyAttribute = ShopifyCustomAttribute;

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
    customAttributes?: ShopifyAttribute[];
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

async function fetchShopifyOrders() {
  const response = await fetch("/api/admin/shopify/orders", { cache: "no-store" });
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

function formatDate(value: string) {
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

function httpUrl(value: string | undefined) {
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

function CustomField({ attribute }: { attribute: ShopifyAttribute }) {
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

function CustomOrderCoverage({ attributes }: { attributes: ShopifyAttribute[] }) {
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
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [emailStatuses, setEmailStatuses] = useState<Record<string, string>>({});
  const [emailBusyOrderId, setEmailBusyOrderId] = useState("");

  const loadOrders = useCallback(async () => {
    setBusy(true);
    setStatus("Loading Shopify orders...");
    try {
      const nextOrders = await fetchShopifyOrders();
      setOrders(nextOrders);
      setRequiresConnection(false);
      setStatus(nextOrders.length ? `${nextOrders.length} newest Shopify orders.` : "No Shopify orders found.");
    } catch (error) {
      setOrders([]);
      setRequiresConnection(Boolean((error as ShopifyOrdersError).requiresConnection));
      setStatus(error instanceof Error ? error.message : "Shopify order lookup failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function sendOrderToFulfillment(order: ShopifyOrder) {
    setEmailBusyOrderId(order.id);
    setEmailStatuses((current) => ({ ...current, [order.id]: "Sending order details..." }));
    try {
      const response = await fetch("/api/admin/shopify/order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id })
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
            <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void loadOrders()}>
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-semibold text-muted-foreground">{status}</p>

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
                        disabled={emailBusyOrderId === order.id}
                        onClick={() => void sendOrderToFulfillment(order)}
                      >
                        <Mail className="h-4 w-4" />
                        Send to fulfillment
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
                              <dl className="mt-3">
                              {normalizeShopifyAttributes(item.customAttributes || []).map((attribute, index) => (
                                <CustomField key={`${attribute.key}-${index}`} attribute={attribute} />
                              ))}
                              </dl>
                            </>
                          ) : (
                            <p className="mt-3 text-sm font-semibold text-muted-foreground">No custom order information was attached to this item.</p>
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
