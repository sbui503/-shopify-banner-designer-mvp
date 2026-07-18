import { PageHeader } from "@/components/admin/page-header";
import { TemplateGeneratorAdminClient } from "@/components/admin/template-generator-admin-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/lib/admin-data";

export default async function AdminTemplateGeneratorPage() {
  const data = await getAdminData();
  const photoFrameTemplates = data.templates.filter((template) => template.photoFrame).length;
  const editableTemplates = data.templates.filter((template) => template.editable).length;

  return (
    <>
      <PageHeader
        title="Template Generator"
        description="Admin workspace for testing SVG templates, staging bulk generation batches, importing helper AI manifests, and organizing design-tool assets before release."
        badge="Bulk QA"
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Editable templates</CardTitle>
            <CardDescription>Native SVG sources available to test.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{editableTemplates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Photo-frame templates</CardTitle>
            <CardDescription>Templates with player photo frame workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{photoFrameTemplates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bulk import/export</CardTitle>
            <CardDescription>JSON and CSV queue tools for QA and Shopify mapping.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{data.system.templateCount}</div>
          </CardContent>
        </Card>
      </div>

      <TemplateGeneratorAdminClient templates={data.templates} sports={data.sports} bannerTypes={data.bannerTypes} />
    </>
  );
}
