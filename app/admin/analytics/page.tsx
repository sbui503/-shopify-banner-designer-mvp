import { PageHeader } from "@/components/admin/page-header";
import { ProgressBar } from "@/components/admin/progress-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminData } from "@/lib/admin-data";

export default async function AnalyticsPage() {
  const data = await getAdminData();
  const hasLiveAnalytics = data.analytics.mostUsedTemplates.length > 0
    || data.analytics.bestSellingBannerTypes.length > 0
    || data.analytics.funnel.length > 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Live template usage, banner sales mix, conversion funnel, and design completion rate."
        badge="Performance"
      />

      {!hasLiveAnalytics ? (
        <Card>
          <CardHeader>
            <CardTitle>Live Analytics Not Connected</CardTitle>
            <CardDescription>No sample or fabricated performance metrics are displayed.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-sm text-muted-foreground">
              Connect a Shopify reporting feed before using this page for product, revenue, or conversion decisions.
            </div>
          </CardContent>
        </Card>
      ) : (
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Most Used Templates</CardTitle>
            <CardDescription>Top template families from the indexed template set.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.analytics.mostUsedTemplates.map((template) => (
              <div key={template.name} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{template.name}</span>
                  <span className="text-muted-foreground">{template.count}</span>
                </div>
                <ProgressBar value={template.rate} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best-Selling Banner Types</CardTitle>
            <CardDescription>Sales-style view based on current product distribution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.analytics.bestSellingBannerTypes.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.count} products</p>
                </div>
                <div className="font-black">{item.revenue}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Design Completion Rate</CardTitle>
            <CardDescription>Funnel from product page through completed order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.analytics.funnel.map((step) => (
              <div key={step.step} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{step.step}</span>
                  <span className="text-muted-foreground">{step.count}</span>
                </div>
                <ProgressBar value={step.rate} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      )}
    </>
  );
}
