import { PageHeader } from "@/components/admin/page-header";
import { TemplateGeneratorAdminClient } from "@/components/admin/template-generator-admin-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/lib/admin-data";
import {
  ADMIN_TEMPLATE_BANNER_TYPES,
  ADMIN_TEMPLATE_SPORTS,
  mergeAdminTemplates
} from "@/lib/admin-template";
import { listAdminTemplates } from "@/lib/admin-template-storage";

export const dynamic = "force-dynamic";

export default async function AdminTemplateGeneratorPage() {
  const data = await getAdminData();
  const uploadedTemplates = await listAdminTemplates();
  const templates = mergeAdminTemplates(data.templates, uploadedTemplates);
  const photoFrameTemplates = templates.filter((template) => template.photoFrame).length;
  const editableTemplates = templates.filter((template) => template.editable).length;

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
            <div className="text-2xl font-black">{templates.length}</div>
          </CardContent>
        </Card>
      </div>

      <TemplateGeneratorAdminClient
        templates={templates}
        sports={[...ADMIN_TEMPLATE_SPORTS]}
        bannerTypes={[...ADMIN_TEMPLATE_BANNER_TYPES]}
      />
    </>
  );
}
