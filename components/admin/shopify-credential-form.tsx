"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Link2, Loader2, ShieldAlert } from "lucide-react";
import type { ShopifyCredentialStatus } from "@/lib/shopify-admin-credentials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SaveResponse = ShopifyCredentialStatus & {
  error?: string;
  validation?: {
    shopName?: string;
    myshopifyDomain?: string;
    canReadOrders?: boolean;
  };
};

type ShopifyCredentialFormProps = {
  initialStatus: ShopifyCredentialStatus;
};

export function ShopifyCredentialForm({ initialStatus }: ShopifyCredentialFormProps) {
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState("");
  const [storeDomain, setStoreDomain] = useState(initialStatus.storeDomain || "tsbanners.myshopify.com");
  const [adminKey, setAdminKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const statusLabel = useMemo(() => {
    if (!status.configured) return "Missing";
    return status.source === "admin-storage" ? "Saved in admin dashboard" : "Configured in Vercel";
  }, [status.configured, status.source]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);

    try {
      const response = await fetch("/api/admin/settings/team-banner-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, storeDomain, adminKey })
      });
      const result = (await response.json()) as SaveResponse;
      if (!response.ok) throw new Error(result.error || "Unable to save Team Banner API key.");

      setStatus({
        configured: true,
        source: "admin-storage",
        storeDomain: result.storeDomain,
        updatedAt: result.updatedAt,
        storageConfigured: initialStatus.storageConfigured,
        requiresAdminKey: initialStatus.requiresAdminKey,
        appCredentialsConfigured: initialStatus.appCredentialsConfigured
      });
      setToken("");
      setMessage(`Connected to ${result.validation?.shopName || result.validation?.myshopifyDomain || result.storeDomain}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save Team Banner API key.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-700" />
              Shopify Admin API
            </CardTitle>
            <CardDescription>
              Connect Shopify automatically for live orders and fulfillment. Manual token entry remains available as a fallback.
            </CardDescription>
          </div>
          <Badge variant={status.configured ? "success" : "warning"}>{statusLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-slate-50 p-3 text-sm sm:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-950">Store</p>
            <p className="break-all text-slate-600">{status.storeDomain}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-950">Source</p>
            <p className="capitalize text-slate-600">{status.source.replace("-", " ")}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-950">Last updated</p>
            <p className="text-slate-600">{status.updatedAt ? new Date(status.updatedAt).toLocaleString() : "Not saved"}</p>
          </div>
        </div>

        {!status.storageConfigured && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" />
            Vercel Blob storage is required before the admin panel can save credentials.
          </div>
        )}

        {!status.requiresAdminKey && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-none" />
            Set ADMIN_SETTINGS_KEY in Vercel to require an admin passcode before saving production credentials.
          </div>
        )}

        {!status.configured ? (
          <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-slate-950">Automatic Shopify connection</p>
              <p className="mt-1 text-sm text-slate-600">
                {status.appCredentialsConfigured
                  ? "Authorize read-only order access. Shopify returns the connection directly to this protected admin."
                  : "The store owner must first grant app-development access and configure the Shopify app credentials in Vercel."}
              </p>
            </div>
            {status.appCredentialsConfigured ? (
              <Button asChild>
                <a href="/api/shopify/oauth/start">
                  <Link2 className="h-4 w-4" />
                  Connect Shopify
                </a>
              </Button>
            ) : (
              <Button disabled>
                <Link2 className="h-4 w-4" />
                Connect Shopify
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="font-semibold text-emerald-900">Shopify is connected</p>
              <p className="mt-1 text-sm text-emerald-800">Live order lookup is enabled for {status.storeDomain}.</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          </div>
        )}

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Shopify store domain</span>
            <Input
              value={storeDomain}
              onChange={(event) => setStoreDomain(event.target.value)}
              placeholder="tsbanners.myshopify.com"
              autoComplete="off"
            />
          </label>

          <label className="block space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Manual Admin API access token</span>
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste a Shopify Admin API token"
              type="password"
              autoComplete="new-password"
              required
            />
          </label>

          {status.requiresAdminKey && (
            <label className="block space-y-1.5 text-sm font-semibold text-slate-800">
              <span>Admin settings key</span>
              <Input
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="Required by ADMIN_SETTINGS_KEY"
                type="password"
                autoComplete="one-time-code"
                required
              />
            </label>
          )}

          {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          {message && (
            <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {message}
            </p>
          )}

          <Button className="w-full sm:w-auto" disabled={saving || !status.storageConfigured} type="submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Validate and save API key
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
