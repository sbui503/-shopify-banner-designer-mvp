import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminBuildVersion } from "@/lib/admin-build-version";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AdminShell buildVersion={adminBuildVersion()}>{children}</AdminShell>;
}
