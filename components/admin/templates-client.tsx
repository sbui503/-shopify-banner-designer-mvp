"use client";

import { useMemo, useState } from "react";
import type { AdminTemplate } from "@/lib/admin-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function TemplatesClient({
  templates,
  sports,
  bannerTypes
}: {
  templates: AdminTemplate[];
  sports: string[];
  bannerTypes: string[];
}) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [bannerType, setBannerType] = useState("all");
  const [photoFrame, setPhotoFrame] = useState("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesQuery = !needle || `${template.title} ${template.sourceUrl}`.toLowerCase().includes(needle);
      const matchesSport = sport === "all" || template.sport === sport;
      const matchesBanner = bannerType === "all" || template.bannerType === bannerType;
      const matchesPhotoFrame = photoFrame === "all" || (photoFrame === "photo" ? template.photoFrame : !template.photoFrame);
      return matchesQuery && matchesSport && matchesBanner && matchesPhotoFrame;
    });
  }, [bannerType, photoFrame, query, sport, templates]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Template Library</CardTitle>
        <CardDescription>Manage Hem & Grommet, Pole Pocket, Triangle, Home Plate, player-count, and photo-frame templates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Search templates..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select value={sport} onChange={(event) => setSport(event.target.value)} aria-label="Filter templates by sport">
            <option value="all">All sports</option>
            {sports.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select value={bannerType} onChange={(event) => setBannerType(event.target.value)} aria-label="Filter templates by banner type">
            <option value="all">All banner types</option>
            {bannerTypes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select value={photoFrame} onChange={(event) => setPhotoFrame(event.target.value)} aria-label="Filter photo frame templates">
            <option value="all">All template types</option>
            <option value="photo">Photo-frame templates</option>
            <option value="standard">Standard layouts</option>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>
              <TableHead>Sport</TableHead>
              <TableHead>Banner Type</TableHead>
              <TableHead>Players</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 32).map((template) => (
              <TableRow key={`${template.title}-${template.sourceUrl}`}>
                <TableCell>
                  <div className="font-semibold">{template.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {template.photoFrame ? <Badge variant="success">Photo frame</Badge> : null}
                    {template.editable ? <Badge variant="secondary">Editable SVG</Badge> : <Badge variant="warning">Needs source</Badge>}
                  </div>
                </TableCell>
                <TableCell>{template.sport}</TableCell>
                <TableCell>{template.bannerType}</TableCell>
                <TableCell>{template.playerCount || "Auto"}</TableCell>
                <TableCell>
                  <Badge variant={template.status === "passed" || template.status === "active" ? "success" : "secondary"}>
                    {template.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-muted-foreground">{template.sourceUrl || "Not mapped"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
