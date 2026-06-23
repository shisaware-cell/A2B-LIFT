export function getReleaseFingerprint(environment: Record<string, string | undefined> = process.env): string {
  return environment.RAILWAY_GIT_COMMIT_SHA || environment.GIT_COMMIT_SHA || "local";
}
