import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FulfillmentLookupClient } from "@/components/admin/fulfillment-lookup-client";
import { getAdminData } from "@/lib/admin-data";

type OrdersPageProps = {
  searchParams: Promise<{
    designId?: string | string[];
    order?: string | string[];
    orderNumber?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const data = await getAdminData();
  const selectedOrder = data.orders[0] ?? null;
  const initialDesignId = firstParam(params.designId).trim();
  const initialOrderNumber = firstParam(params.order || params.orderNumber).trim();

  return (
    <>
      <PageHeader
        title="Order Management"
        description="Track customer orders, proof status, design source status, cart preview state, and fulfillment lookup."
        badge="Fulfillment"
      />

      <div className="grid gap-4">
        <FulfillmentLookupClient
          initialDesignId={initialDesignId}
          initialOrderNumber={initialOrderNumber}
        />
      </div>

      <div className={`mt-4 grid gap-4 ${selectedOrder ? "xl:grid-cols-[1fr_360px]" : ""}`}>
        <Card>
          <CardHeader>
            <CardTitle>Customer Orders</CardTitle>
            <CardDescription>Live Shopify orders appear here after an order feed is connected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.orders.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-sm text-muted-foreground">
                No live order feed is connected. Use the fulfillment lookup above to retrieve a real Shopify order by order number or load its Design ID directly.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Proof</TableHead>
                      <TableHead>Design</TableHead>
                      <TableHead>Cart Preview</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orders.map((order) => (
                      <TableRow key={order.order}>
                        <TableCell className="font-black">{order.order}</TableCell>
                        <TableCell>{order.customer}</TableCell>
                        <TableCell>
                          <Badge variant={/sent|fulfillment/i.test(order.proofStatus) ? "success" : "warning"}>{order.proofStatus}</Badge>
                        </TableCell>
                        <TableCell>{order.designStatus}</TableCell>
                        <TableCell>
                          <Badge variant={order.cartPreviewStatus === "Ready" ? "success" : "warning"}>{order.cartPreviewStatus}</Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{order.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedOrder ? (
          <Card>
            <CardHeader>
              <CardTitle>Order Detail View</CardTitle>
              <CardDescription>Fulfillment source package summary.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Selected order</p>
                <p className="mt-2 text-2xl font-black">{selectedOrder.order}</p>
                <p className="text-sm text-muted-foreground">{selectedOrder.customer}</p>
              </div>
              <Button className="w-full" asChild>
                <a href="/fulfillment.html" target="_blank" rel="noreferrer">Open fulfillment package</a>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
