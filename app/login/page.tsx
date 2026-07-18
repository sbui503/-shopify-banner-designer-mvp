import type { Metadata } from "next";
import Image from "next/image";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata: Metadata = {
  title: "Admin Login | Team Sport Banners",
  robots: { index: false, follow: false }
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/admin") ? params.next : "/admin";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border bg-white p-6 shadow-admin sm:p-8" aria-labelledby="login-title">
        <div className="mb-7 flex items-center gap-4 border-b pb-5">
          <Image src="/team-sport-banners-logo.svg" alt="Team Sport Banners" width={62} height={62} className="object-contain" priority />
          <div>
            <h1 id="login-title" className="text-xl font-black text-slate-950">TSBanner Admin</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Authorized access only</p>
          </div>
        </div>
        <AdminLoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
