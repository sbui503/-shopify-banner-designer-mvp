import { PageHeader } from "@/components/admin/page-header";
import { ProgressBar } from "@/components/admin/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminData } from "@/lib/admin-data";

const ROLE_LABELS: Record<string, string> = {
  background: "Background",
  teamLogo: "Team logo",
  teamName: "Team name",
  text: "Text",
  clipArt: "Clip art",
  accessory: "Accessory"
};

export default async function LayoutsPage() {
  const data = await getAdminData();
  const coverage = data.productLayerCoverage;

  return (
    <>
      <PageHeader
        title="Banner Layouts"
        description="Validate true product-layer readiness: owned background, team logo, team name, text, clip art, accessory, and no external tile fallback."
        badge="No-Tile QA"
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>True Editable No-Tile Coverage</CardTitle>
            <CardDescription>
              Products are ready only when every required customer layer resolves to owned source/object assets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-3xl font-black">{coverage.readyRate}%</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {coverage.readyCount.toLocaleString()} of {coverage.productCount.toLocaleString()} products ready
                </p>
              </div>
              <Badge variant={coverage.readyRate >= 80 ? "success" : "warning"}>
                {coverage.readyRate >= 80 ? "80% target met" : "Below 80% target"}
              </Badge>
            </div>
            <div className="mt-4">
              <ProgressBar value={coverage.readyRate} />
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="font-semibold">{coverage.notReadyCount.toLocaleString()}</div>
                <div className="text-muted-foreground">Need asset work</div>
              </div>
              <div>
                <div className="font-semibold">{coverage.target80Remaining.toLocaleString()}</div>
                <div className="text-muted-foreground">More products to 80%</div>
              </div>
              <div>
                <div className="font-semibold">{coverage.target90Remaining.toLocaleString()}</div>
                <div className="text-muted-foreground">More products to 90%</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {coverage.bannerTypes.slice(0, 2).map((shape) => (
          <Card key={shape.bannerType}>
            <CardHeader>
              <CardTitle>{shape.bannerType}</CardTitle>
              <CardDescription>{shape.productCount.toLocaleString()} products</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between gap-3">
                <div className="text-2xl font-black">{shape.readyRate}%</div>
                <Badge variant={shape.readyRate >= 80 ? "success" : "warning"}>
                  {shape.readyRate >= 80 ? "Ready" : "Build assets"}
                </Badge>
              </div>
              <div className="mt-3">
                <ProgressBar value={shape.readyRate} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Weakest: {ROLE_LABELS[shape.weakestRole] || shape.weakestRole} ({shape.weakestRoleRate}%)
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        {coverage.bannerTypes.map((shape) => {
          return (
            <Card key={shape.bannerType}>
              <CardHeader>
                <CardTitle>{shape.bannerType}</CardTitle>
                <CardDescription>{shape.readyCount.toLocaleString()} no-tile ready</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black">{shape.readyRate}%</div>
                <div className="mt-3">
                  <ProgressBar value={shape.readyRate} />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {shape.notReadyCount.toLocaleString()} need work. Add {shape.target80Remaining.toLocaleString()} to hit 80%.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>80-90% True Editable Checklist</CardTitle>
          <CardDescription>
            Prioritize the weakest unresolved roles first. These are the layers most likely to fall back to tile/image behavior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Banner Type</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Ready</TableHead>
                <TableHead>No-Tile Rate</TableHead>
                <TableHead>To 80%</TableHead>
                <TableHead>To 90%</TableHead>
                <TableHead>Weakest Layer</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverage.bannerTypes.map((shape) => (
                <TableRow key={shape.bannerType}>
                  <TableCell className="font-semibold">{shape.bannerType}</TableCell>
                  <TableCell>{shape.productCount.toLocaleString()}</TableCell>
                  <TableCell>{shape.readyCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="min-w-32">
                      <div className="mb-1 font-semibold">{shape.readyRate}%</div>
                      <ProgressBar value={shape.readyRate} />
                    </div>
                  </TableCell>
                  <TableCell>{shape.target80Remaining.toLocaleString()}</TableCell>
                  <TableCell>{shape.target90Remaining.toLocaleString()}</TableCell>
                  <TableCell>
                    {ROLE_LABELS[shape.weakestRole] || shape.weakestRole} ({shape.weakestRoleRate}%)
                  </TableCell>
                  <TableCell>
                    <Badge variant={shape.readyRate >= 80 ? "success" : "warning"}>
                      {shape.readyRate >= 90 ? "90% ready" : shape.readyRate >= 80 ? "80% ready" : "Needs asset packs"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Template Layout Matrix</CardTitle>
          <CardDescription>
            Secondary check for designer dropdown coverage. This does not replace the product-layer no-tile metric above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sport</TableHead>
                <TableHead>Banner Type</TableHead>
                <TableHead>Player Count</TableHead>
                <TableHead>Total Layouts</TableHead>
                <TableHead>Editable</TableHead>
                <TableHead>Photo Frame</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.layouts.slice(0, 40).map((layout) => (
                <TableRow key={`${layout.sport}-${layout.bannerType}-${layout.playerCount}`}>
                  <TableCell className="font-semibold">{layout.sport}</TableCell>
                  <TableCell>{layout.bannerType}</TableCell>
                  <TableCell>{layout.playerCount || "Auto"}</TableCell>
                  <TableCell>{layout.count}</TableCell>
                  <TableCell>{layout.editableCount}</TableCell>
                  <TableCell>{layout.photoFrameCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
