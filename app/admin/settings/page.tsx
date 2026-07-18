import { PageHeader } from "@/components/admin/page-header";
import { ShopifyCredentialForm } from "@/components/admin/shopify-credential-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/lib/admin-data";
import { getShopifyCredentialStatus } from "@/lib/shopify-admin-credentials";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getAdminData();
  const shopifyCredentialStatus = await getShopifyCredentialStatus();
  const settings = [
    ["Team Banner API key", shopifyCredentialStatus.configured],
    ["Vercel Blob storage", data.system.blobConfigured],
    ["Proof email service", data.system.proofEmailConfigured],
    ["Protected admin login", true],
    ["Require SVG source before production", true],
    ["Cart preview proof enabled", true]
  ] as const;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure the Team Banner API key, platform safety, proof delivery, source-file rules, and production promotion controls."
        badge="QA First"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <ShopifyCredentialForm initialStatus={shopifyCredentialStatus} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Environment Readiness</CardTitle>
            <CardDescription>Secrets are read server-side and never exposed to the browser.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.map(([label, enabled]) => (
              <div key={label} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="font-semibold">{label}</span>
                <Badge variant={enabled ? "success" : "warning"}>{enabled ? "Enabled" : "Missing"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Production Guardrails</CardTitle>
            <CardDescription>Current admin defaults protect the live Shopify store.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "QA branch before production",
              "Preview deployment required",
              "Backup required before product import",
              "No production deploy without explicit approval",
              "Block import when SVG source is missing"
            ].map((item) => (
              <div key={item} className="rounded-lg border bg-slate-50 p-3 text-sm font-semibold">
                {item}
              </div>
            ))}
            <Button variant="outline" className="w-full" disabled>Settings audit download not connected</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
