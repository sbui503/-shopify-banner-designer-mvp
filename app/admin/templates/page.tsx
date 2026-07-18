import { PageHeader } from "@/components/admin/page-header";
import { TemplatesClient } from "@/components/admin/templates-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/lib/admin-data";

export default async function TemplatesPage() {
  const data = await getAdminData();
  const families = ["Hem & Grommet", "Pole Pocket", "Triangle", "Home Plate"].map((shape) => ({
    shape,
    count: data.templates.filter((template) => template.bannerType === shape).length,
    photoFrames: data.templates.filter((template) => template.bannerType === shape && template.photoFrame).length
  }));

  return (
    <>
      <PageHeader
        title="Product Templates"
        description="Audit product template coverage across banner types, player-count layouts, and photo-frame generators."
        badge={`${data.system.templateCount} templates`}
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
      <TemplatesClient templates={data.templates} sports={data.sports} bannerTypes={data.bannerTypes} />
    </>
  );
}
