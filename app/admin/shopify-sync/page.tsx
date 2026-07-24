import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminData } from "@/lib/admin-data";
import { getShopifyCredentialStatus } from "@/lib/shopify-admin-credentials";

export const dynamic = "force-dynamic";

export default async function ShopifySyncPage() {
  const data = await getAdminData();
  const shopifyCredentialStatus = await getShopifyCredentialStatus();

  return (
    <>
      <PageHeader
        title="Shopify Sync"
        description="Import/export product data, review product-template mapping, and isolate failed sync rows before production."
        badge={data.metrics.shopifySyncStatus}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Import Products</CardTitle>
            <CardDescription>Bring Shopify CSV/product data into QA.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Import CSV</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Export Products</CardTitle>
            <CardDescription>Generate reviewed Shopify CSV exports.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">Export mapping</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Shopify Admin API access is required for live order lookup.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Shopify Admin API</span>
            <Badge variant={shopifyCredentialStatus.configured ? "success" : "warning"}>
              {shopifyCredentialStatus.configured ? "Configured" : "Missing API key"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Product Mapping Table</CardTitle>
          <CardDescription>First rows from the current product manifest.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.syncRows.map((row) => (
                <TableRow key={`${row.handle}-${row.product}`}>
                  <TableCell className="font-semibold">{row.product}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">{row.handle}</TableCell>
                  <TableCell>{row.template}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "Synced" ? "success" : "warning"}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>{row.issue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Failed Sync Logs</CardTitle>
          <CardDescription>Rows that must be fixed before product import or production publish.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.failedSyncRows.length ? (
            <div className="space-y-3">
              {data.failedSyncRows.map((row) => (
                <div key={row.product} className="rounded-lg border p-3">
                  <div className="font-semibold">{row.product}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{row.issue}</div>
                  <div className="mt-2 text-sm font-semibold text-primary">{row.action}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">No failed sync rows found.</div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
