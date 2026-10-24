import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { getCloudSession } from "@/lib/server/session";
import { StoreProvider, type CloudIdentity } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Application routes are private workspaces: never indexed.
export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};

/** Signed in → the organisation's server-side workspace. Otherwise the browser-only demo. */
async function identity(): Promise<CloudIdentity | null> {
  if (!isSupabaseConfigured()) return null;
  const s = await getCloudSession();
  if (!s) return null;
  if (!s.active) redirect("/onboarding");
  return {
    userId: s.userId,
    email: s.email,
    name: s.active.displayName,
    role: s.active.role,
    organisation: { id: s.active.organisationId, name: s.active.organisationName },
    memberships: s.memberships.map(({ organisationId, organisationName, role }) => ({ organisationId, organisationName, role })),
  };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  return (
    <StoreProvider cloud={await identity()}>
      <Shell>{children}</Shell>
    </StoreProvider>
  );
}
