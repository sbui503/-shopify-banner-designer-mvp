export function adminBuildVersion() {
  return String(
    process.env.VERCEL_DEPLOYMENT_ID
      || process.env.VERCEL_URL
      || process.env.VERCEL_GIT_COMMIT_SHA
      || "local"
  );
}
