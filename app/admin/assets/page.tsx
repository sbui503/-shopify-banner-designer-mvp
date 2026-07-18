import { PageHeader } from "@/components/admin/page-header";
import { AssetManagementClient } from "@/components/admin/asset-management-client";
import { getAdminData } from "@/lib/admin-data";

export default async function AssetsPage() {
  const data = await getAdminData();

  return (
    <>
      <PageHeader
        title="Asset Management"
        description="Upload, preview, filter, and audit background, SVG, clipart, logo, player icon, and photo-frame assets."
        badge={`${data.system.assetCount} assets indexed`}
      />
      <AssetManagementClient assets={data.assets} sports={data.sports} bannerTypes={data.bannerTypes} />
    </>
  );
}
