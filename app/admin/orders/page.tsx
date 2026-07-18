import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FulfillmentLookupClient } from "@/components/admin/fulfillment-lookup-client";
import { getAdminData } from "@/lib/admin-data";

export default async function OrdersPage() {
  const data = await getAdminData();
  const selectedOrder = data.orders[0];

  return (
    <>
      <PageHeader
        title="Order Management"
        description="Track customer orders, proof status, design source status, cart preview state, and fulfillment lookup."
        badge="Fulfillment"
      />

      <div className="grid gap-4">
        <FulfillmentLookupClient />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Customer Orders</CardTitle>
            <CardDescription>Preview order rows. Production lookup uses Shopify order number and saved design IDs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>

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
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">PNG proof</span>
                <Badge variant="success">Ready</Badge>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Layered SVG source</span>
                <Badge variant="success">Saved</Badge>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Editable JSON</span>
                <Badge variant="success">Saved</Badge>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Cart preview</span>
                <Badge variant="success">Visible</Badge>
              </div>
            </div>
            <Button className="w-full" asChild>
              <a href="/fulfillment.html" target="_blank" rel="noreferrer">Open fulfillment package</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
