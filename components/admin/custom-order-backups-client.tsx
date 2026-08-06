"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, FileImage, Mail, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CustomField, CustomOrderCoverage, formatDate } from "@/components/admin/shopify-orders-client";
import type { CustomOrderBackupManifest } from "@/lib/custom-order-backup";

type BackupsResponse = {
  submissions?: CustomOrderBackupManifest[];
  error?: string;
};

async function fetchBackups(lookup = "") {
  const params = new URLSearchParams();
  if (lookup.trim()) params.set("lookup", lookup.trim());
  const response = await fetch(`/api/admin/custom-order-backups${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({})) as BackupsResponse;
  if (!response.ok) throw new Error(data.error || "Custom-order backup lookup failed.");
  return Array.isArray(data.submissions) ? data.submissions : [];
}

export function CustomOrderBackupsClient({ initialLookup = "" }: { initialLookup?: string }) {
  const [submissions, setSubmissions] = useState<CustomOrderBackupManifest[]>([]);
  const [lookupInput, setLookupInput] = useState(initialLookup);
  const [activeLookup, setActiveLookup] = useState(initialLookup);
  const [status, setStatus] = useState("Loading custom-order backups...");
  const [busy, setBusy] = useState(true);
  const [expandedId, setExpandedId] = useState(initialLookup);
  const [emailBusyId, setEmailBusyId] = useState("");
  const [emailStatus, setEmailStatus] = useState<Record<string, string>>({});

  const load = useCallback(async (lookup = "") => {
    const clean = lookup.trim();
    setBusy(true);
    setStatus(clean ? `Looking up ${clean}...` : "Loading custom-order backups...");
    try {
      const next = await fetchBackups(clean);
      setSubmissions(next);
      setActiveLookup(clean);
      if (clean && next.length === 1) setExpandedId(next[0].id);
      setStatus(clean
        ? (next.length ? `Found ${next.length} stored submission.` : `No stored submission found for ${clean}.`)
        : `${next.length} newest recoverable custom-order submissions.`);
    } catch (error) {
      setSubmissions([]);
      setStatus(error instanceof Error ? error.message : "Custom-order backup lookup failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function sendEmail(submission: CustomOrderBackupManifest) {
    const alreadySent = submission.notification?.status === "sent";
    setEmailBusyId(submission.id);
    setEmailStatus((current) => ({ ...current, [submission.id]: alreadySent ? "Resending all order details..." : "Sending all order details..." }));
    try {
      const response = await fetch("/api/admin/custom-order-backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-email", submissionId: submission.id, force: alreadySent })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Fulfillment email failed.");
      setEmailStatus((current) => ({ ...current, [submission.id]: `Sent all details and file links to ${result.to || "info@tsbanners.com"}.` }));
      await load(activeLookup);
    } catch (error) {
      setEmailStatus((current) => ({ ...current, [submission.id]: error instanceof Error ? error.message : "Fulfillment email failed." }));
    } finally {
      setEmailBusyId("");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lookup = lookupInput.trim();
    if (!lookup) {
      setStatus("Enter a Submission ID, team name, player name, or product title.");
      return;
    }
    void load(lookup);
  }

  useEffect(() => {
    void load(initialLookup);
  }, [initialLookup, load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Custom Order Backups</CardTitle>
            <CardDescription>Independent storefront submissions saved before Shopify checkout. Search and recover every field and uploaded original.</CardDescription>
          </div>
          <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void load(activeLookup)}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-semibold text-muted-foreground">{status}</p>
        <form className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={onSubmit}>
          <Input
            value={lookupInput}
            onChange={(event) => setLookupInput(event.target.value)}
            placeholder="Submission ID, team, player, or product"
            aria-label="Custom-order backup lookup"
            autoComplete="off"
          />
          <Button type="submit" disabled={busy}><Search className="h-4 w-4" />Find backup</Button>
          {activeLookup ? (
            <Button variant="outline" type="button" disabled={busy} onClick={() => {
              setLookupInput("");
              void load("");
            }}><X className="h-4 w-4" />Clear</Button>
          ) : null}
        </form>

        {submissions.length ? (
          <div className="mt-4 divide-y rounded-lg border">
            {submissions.map((submission) => {
              const expanded = expandedId === submission.id;
              const sent = submission.notification?.status === "sent";
              return (
                <article key={submission.id} className="p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="break-all font-black text-slate-950">{submission.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(submission.createdAt)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-950">{submission.productTitle || "Custom product"}</p>
                      <p className="mt-1 text-sm font-semibold text-muted-foreground">{submission.fields.length} fields / {submission.files.length} uploaded files</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Badge variant={submission.status === "ready" ? "success" : "warning"}>{submission.status === "ready" ? "Backup ready" : "Upload pending"}</Badge>
                      <Badge variant={sent ? "success" : submission.notification?.status === "failed" ? "warning" : "secondary"}>
                        {sent ? "Email sent" : submission.notification?.status === "failed" ? "Email failed" : "Email pending"}
                      </Badge>
                      <Button variant="outline" size="sm" type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? "" : submission.id)}>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {expanded ? "Hide details" : "View all details"}
                      </Button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 border-t pt-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Recovery source</p>
                          <p className="mt-1 text-sm font-bold">Encrypted manifest and original uploads in Vercel Blob</p>
                          {emailStatus[submission.id] ? <p className="mt-1 text-sm font-semibold text-muted-foreground">{emailStatus[submission.id]}</p> : null}
                        </div>
                        <Button type="button" size="sm" disabled={emailBusyId === submission.id || submission.status !== "ready"} onClick={() => void sendEmail(submission)}>
                          <Mail className="h-4 w-4" />{sent ? "Resend all details" : "Email all details"}
                        </Button>
                      </div>

                      {submission.notification ? (
                        <div className="mt-4 grid gap-3 rounded-md border bg-slate-50 p-4 sm:grid-cols-3">
                          <div>
                            <p className="text-xs font-black uppercase text-slate-500">Email recipient</p>
                            <p className="mt-1 break-all text-sm font-bold text-slate-950">{submission.notification.to || "Not recorded"}</p>
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase text-slate-500">Delivery receipt</p>
                            <p className="mt-1 text-sm font-bold text-slate-950">
                              {submission.notification.sentAt ? formatDate(submission.notification.sentAt) : submission.notification.status}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase text-slate-500">Resend message ID</p>
                            <p className="mt-1 break-all text-sm font-bold text-slate-950">{submission.notification.resendId || "Not returned"}</p>
                          </div>
                        </div>
                      ) : null}

                      <CustomOrderCoverage attributes={submission.fields} />
                      <dl className="mt-4 border-y">
                        {submission.fields.map((field, index) => <CustomField key={`${field.key}-${index}`} attribute={field} />)}
                      </dl>

                      {submission.files.length ? (
                        <div className="mt-4 divide-y border-y">
                          {submission.files.map((file) => (
                            <div key={file.pathname} className="py-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-black uppercase text-slate-500">{file.fieldKey}</p>
                                  <p className="mt-1 break-all font-bold text-slate-950">{file.name}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">{file.contentType || "Uploaded file"}{file.size ? ` / ${(file.size / 1024 / 1024).toFixed(2)} MB` : ""}</p>
                                </div>
                                <Button asChild variant="outline" size="sm"><a href={file.downloadUrl || file.url} target="_blank" rel="noreferrer"><FileImage className="h-4 w-4" />Open original<ExternalLink className="h-4 w-4" /></a></Button>
                              </div>
                              {String(file.contentType || "").startsWith("image/") ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={file.url} alt={file.name} className="mt-3 max-h-72 max-w-full border object-contain" />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : <p className="mt-4 text-sm font-semibold text-muted-foreground">No uploaded files were included in this submission.</p>}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
