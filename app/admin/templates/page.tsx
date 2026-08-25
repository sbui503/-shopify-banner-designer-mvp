import { PageHeader } from "@/components/admin/page-header";
import { TemplateUploadClient } from "@/components/admin/template-upload-client";
import { TemplatesClient } from "@/components/admin/templates-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/lib/admin-data";
import {
  ADMIN_TEMPLATE_BANNER_TYPES,
  ADMIN_TEMPLATE_SPORTS,
  mergeAdminTemplates
} from "@/lib/admin-template";
import { listAdminTemplates } from "@/lib/admin-template-storage";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const data = await getAdminData();
  const uploadedTemplates = await listAdminTemplates();
  const templates = mergeAdminTemplates(data.templates, uploadedTemplates);
  const families = ["Hem & Grommet", "Pole Pocket", "Triangle", "Home Plate"].map((shape) => ({
    shape,
    count: templates.filter((template) => template.bannerType === shape).length,
    photoFrames: templates.filter((template) => template.bannerType === shape && template.photoFrame).length
  }));

  return (
    <>
      <PageHeader
        title="Product Templates"
        description="Audit product template coverage across banner types, player-count layouts, and photo-frame generators."
        badge={`${templates.length} templates`}
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-4">
        {families.map((family) => (
          <Card key={family.shape}>
            <CardHeader>
              <CardTitle>{family.shape}</CardTitle>
              <CardDescription>Template coverage</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black">{family.count}</div>
              <p className="mt-1 text-sm text-muted-foreground">{family.photoFrames} photo-frame templates</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mb-5">
        <TemplateUploadClient />
      </div>
      <TemplatesClient
        templates={templates}
        sports={[...ADMIN_TEMPLATE_SPORTS]}
        bannerTypes={[...ADMIN_TEMPLATE_BANNER_TYPES]}
      />
    </>
  );
}
