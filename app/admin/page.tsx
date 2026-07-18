import Link from "next/link";
import { Activity, ClipboardCheck, DollarSign, KeyRound, RefreshCw, ShoppingCart, Shapes } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ProgressBar } from "@/components/admin/progress-bar";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/lib/admin-data";
import { getShopifyCredentialStatus } from "@/lib/shopify-admin-credentials";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getAdminData();
  const shopifyCredentialStatus = await getShopifyCredentialStatus();
  const apiKeyStatusLabel = shopifyCredentialStatus.configured
    ? shopifyCredentialStatus.source === "admin-storage"
      ? "Saved in dashboard"
      : shopifyCredentialStatus.source === "client-credentials"
        ? "Shopify app connected"
        : "Configured in Vercel"
    : "Missing";

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational overview for product templates, customer proof packages, Shopify sync, and fulfillment readiness."
        badge="Live Source"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total orders" value={data.metrics.totalOrders} detail="No live order feed connected" icon={ShoppingCart} tone="blue" />
        <StatCard
          label="Active templates"
          value={formatNumber(data.metrics.activeTemplates)}
          detail={`${formatNumber(data.system.templateCount)} templates indexed`}
          icon={Shapes}
          tone="green"
        />
        <StatCard label="Pending proofs" value={data.metrics.pendingProofs} detail="Available after live order sync" icon={ClipboardCheck} tone="amber" />
        <StatCard label="Revenue summary" value={data.metrics.revenue} detail="Connect Shopify reporting" icon={DollarSign} tone="green" />
      </div>

      <Card className="mt-6 border-blue-200 bg-blue-50/40">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-700" />
              <h2 className="text-base font-black text-slate-950">Team Banner API Key</h2>
              <Badge variant={shopifyCredentialStatus.configured ? "success" : "warning"}>{apiKeyStatusLabel}</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Required for Shopify order lookup and fulfillment design recovery. Keys are validated server-side, encrypted, and never displayed after saving.
            </p>
          </div>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/admin/settings">{shopifyCredentialStatus.configured ? "Manage API key" : "Add API key"}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Shopify Sync Status</CardTitle>
            <CardDescription>Current product/template mapping health from the deployed customer-tool snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Products</p>
                <p className="mt-2 text-2xl font-black">{formatNumber(data.system.productCount)}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Assets</p>
                <p className="mt-2 text-2xl font-black">{formatNumber(data.system.assetCount)}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Layouts</p>
                <p className="mt-2 text-2xl font-black">{formatNumber(data.system.layoutCount)}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  {data.metrics.shopifySyncStatus}
                </div>
                <Badge variant={data.metrics.shopifySyncStatus === "Healthy" ? "success" : "warning"}>{data.metrics.shopifySyncStatus}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                The snapshot is read-only in admin. The deployed customer manifest remains the source for product mappings.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>Live customer-flow analytics after a reporting feed is connected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.analytics.funnel.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-sm text-muted-foreground">
                No live conversion feed is connected. Sample funnel data is not shown.
              </div>
            ) : (
              data.analytics.funnel.map((step) => (
                <div key={step.step} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">{step.step}</span>
                    <span className="text-muted-foreground">{step.rate}%</span>
                  </div>
                  <ProgressBar value={step.rate} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest platform changes and QA state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.activity.map((item) => (
              <div key={item.label} className="flex gap-3 rounded-lg border p-3">
                <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{item.label}</p>
                    <Badge variant={/verified|synced|healthy/i.test(item.status) ? "success" : "secondary"}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">{item.time}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue / Order Summary</CardTitle>
            <CardDescription>Live Shopify order totals after reporting is connected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.orders.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-sm text-muted-foreground">
                No live orders are connected. Sample customers and revenue are not shown.
              </div>
            ) : (
              data.orders.slice(0, 4).map((order) => (
                <div key={order.order} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <p className="font-semibold">{order.order}</p>
                    <p className="text-sm text-muted-foreground">{order.customer}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black">{order.total}</p>
                    <p className="text-xs text-muted-foreground">{order.items} item(s)</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
