import { redirect } from "next/navigation";

type LegacyFulfillmentPageProps = {
  searchParams: Promise<{
    designId?: string | string[];
    order?: string | string[];
    orderNumber?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function LegacyFulfillmentPage({ searchParams }: LegacyFulfillmentPageProps) {
  const params = await searchParams;
  const destination = new URLSearchParams();
  const designId = firstParam(params.designId).trim();
  const orderNumber = firstParam(params.order || params.orderNumber).trim();

  if (designId) destination.set("designId", designId);
  if (orderNumber) destination.set("order", orderNumber);

  redirect(`/admin/orders${destination.size ? `?${destination.toString()}` : ""}`);
}
