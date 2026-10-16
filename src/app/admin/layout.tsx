import { requireStaff } from "@/lib/session";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  return <Shell me={me}>{children}</Shell>;
}
