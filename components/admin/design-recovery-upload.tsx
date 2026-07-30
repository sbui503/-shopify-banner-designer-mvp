"use client";

import NextImage from "next/image";
import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Layers3, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { designIdFromPngFile } from "@/lib/png-design-id";

export type RecoveredDesignManifest = {
  id: string;
  savedAt?: string;
  previewUrl?: string;
  sourceSvgUrl?: string;
  manifestUrl?: string;
  lookupUrl?: string;
  designerUrl?: string;
  productTitle?: string;
  teamName?: string;
  orderNumber?: string;
  parentDesignId?: string;
  adminUploaded?: boolean;
  proofOnly?: boolean;
  sourceSvgStats?: {
    objectCount?: number;
    imageCount?: number;
    textCount?: number;
    layered?: boolean;
  };
};

function newDesignId() {
  const random = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
    : Math.random().toString(36).slice(2, 12);
  return `design_${Date.now()}_${random.toLowerCase()}`;
}

function fileIsPng(file: File) {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

function fileIsSvg(file: File) {
  return file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
}

export function DesignRecoveryUpload({
  orderNumber,
  onSaved
}: {
  orderNumber: string;
  onSaved: (manifest: RecoveredDesignManifest) => void;
}) {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState("");
  const [detectedDesignId, setDetectedDesignId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [teamName, setTeamName] = useState("");
  const [status, setStatus] = useState("Select the customer PNG proof. Add its SVG source to verify editable layers.");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (proofPreview) URL.revokeObjectURL(proofPreview);
    };
  }, [proofPreview]);

  async function selectProof(file: File | null) {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview("");
    setDetectedDesignId("");
    if (!file) {
      setProofFile(null);
      return;
    }
    if (!fileIsPng(file)) {
      setProofFile(null);
      setStatus("Proof must be a PNG file.");
      return;
    }
    setProofFile(file);
    setProofPreview(URL.createObjectURL(file));
    const embeddedId = await designIdFromPngFile(file).catch(() => "");
    setDetectedDesignId(embeddedId);
    setStatus(embeddedId
      ? `Original Design ID detected: ${embeddedId}.`
      : "PNG proof ready. Add the layered SVG when available.");
  }

  function selectSource(file: File | null) {
    if (file && !fileIsSvg(file)) {
      setSourceFile(null);
      setStatus("Layer source must be an SVG file.");
      return;
    }
    setSourceFile(file);
    if (file) setStatus("PNG proof and SVG source are ready to upload.");
  }

  async function saveRecovery() {
    if (!proofFile) {
      setStatus("Select a PNG proof first.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setStatus("Uploading PNG proof...");
    const designId = newDesignId();
    try {
      const proofPath = `team-banner-designs/${designId}/proof.png`;
      const proof = await upload(proofPath, proofFile, {
        access: "public",
        handleUploadUrl: "/api/admin/design-upload",
        clientPayload: JSON.stringify({ designId, kind: "proof" }),
        contentType: "image/png",
        multipart: proofFile.size > 4 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage * (sourceFile ? 0.6 : 0.9)))
      });

      let sourceSvg = null;
      if (sourceFile) {
        setStatus("Uploading layered SVG...");
        sourceSvg = await upload(`team-banner-designs/${designId}/source.svg`, sourceFile, {
          access: "public",
          handleUploadUrl: "/api/admin/design-upload",
          clientPayload: JSON.stringify({ designId, kind: "source" }),
          contentType: "image/svg+xml",
          multipart: sourceFile.size > 4 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setProgress(60 + Math.round(percentage * 0.3))
        });
      }

      setStatus("Verifying stored design files...");
      setProgress(94);
      const response = await fetch("/api/admin/design-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId,
          parentDesignId: detectedDesignId,
          proof,
          sourceSvg,
          orderNumber,
          productTitle,
          teamName
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save recovered design.");
      setProgress(100);
      setStatus(sourceSvg
        ? `Saved ${result.id}. Layer verification is ready.`
        : `Saved ${result.id}. This PNG is proof-only until an SVG source is added.`);
      onSaved(result as RecoveredDesignManifest);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Design upload failed.");
      setProgress(0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-y py-5" aria-labelledby="recover-design-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="recover-design-heading" className="font-black text-slate-950">Upload Missing Customer Design</h3>
          <p className="mt-1 text-sm text-muted-foreground">Store the print proof and source under one fulfillment Design ID.</p>
        </div>
        <Badge variant={sourceFile ? "success" : "warning"}>
          {sourceFile ? "Layer source included" : "PNG proof only"}
        </Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-white">
          {proofPreview ? (
            <NextImage src={proofPreview} alt="Selected customer proof" fill sizes="220px" className="object-contain" unoptimized />
          ) : (
            <ImagePlus className="h-10 w-10 text-slate-400" />
          )}
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            PNG proof
            <Input type="file" accept="image/png,.png" disabled={busy} onChange={(event) => void selectProof(event.target.files?.[0] || null)} />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Layered SVG
            <Input type="file" accept="image/svg+xml,.svg" disabled={busy} onChange={(event) => selectSource(event.target.files?.[0] || null)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={productTitle} onChange={(event) => setProductTitle(event.target.value)} placeholder="Product title" disabled={busy} />
            <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" disabled={busy} />
          </div>
          {orderNumber.trim() ? <p className="text-sm font-bold">Linked order: {orderNumber.trim()}</p> : null}
          {detectedDesignId ? <p className="break-all text-xs font-bold text-primary">Original: {detectedDesignId}</p> : null}

          {busy || progress ? (
            <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-label={`Upload ${progress}%`}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={busy || !proofFile} onClick={() => void saveRecovery()}>
              <Upload className="h-4 w-4" />
              Save to fulfillment
            </Button>
            {sourceFile ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                <Layers3 className="h-4 w-4" />
                Editable source selected
              </span>
            ) : null}
          </div>
          <p className="text-sm font-semibold text-muted-foreground" role="status">{status}</p>
        </div>
      </div>
    </section>
  );
}
