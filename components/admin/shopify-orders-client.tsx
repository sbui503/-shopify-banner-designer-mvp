"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
  } | null;
  lineItems: Array<{
    id: string;
    name: string;
    quantity: number;
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

export function ShopifyOrdersClient() {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [status, setStatus] = useState("Loading Shopify orders...");
  const [busy, setBusy] = useState(true);
  const [requiresConnection, setRequiresConnection] = useState(false);

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
              <article key={order.id} className="grid gap-3 p-4 lg:grid-cols-[120px_minmax(0,1fr)_minmax(180px,auto)_140px] lg:items-center">
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
                        Product and time match. {formatMatchTiming(order.likelyDesign.secondsBeforeOrder)}. Verify before print.
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
              </article>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
