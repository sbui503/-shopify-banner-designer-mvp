import { PageHeader } from "@/components/admin/page-header";
import { FulfillmentLookupClient } from "@/components/admin/fulfillment-lookup-client";
import { ShopifyDraftOrdersClient } from "@/components/admin/shopify-draft-orders-client";
import { ShopifyOrdersClient } from "@/components/admin/shopify-orders-client";

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
        <ShopifyOrdersClient />
        <ShopifyDraftOrdersClient />
        <FulfillmentLookupClient
          initialDesignId={initialDesignId}
          initialOrderNumber={initialOrderNumber}
        />
      </div>
    </>
  );
}
