import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { ACCESS_ROLES, ACCESS_ROLE_LABEL, DEFAULT_PERMISSIONS, PERMISSION_GROUPS } from "@/features/access/permissions";
import { requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { saveRoleAccessAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles & access" };

const EDITABLE = ACCESS_ROLES.filter((r) => r !== "admin");

export default async function RolesAccessPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireStaff();
  if (me.accessRole !== "admin") redirect("/?error=forbidden");
  const sp = await searchParams;
  const [matrix, team] = await Promise.all([app().access.matrix(), app().staff.list()]);
  const counts = Object.fromEntries(ACCESS_ROLES.map((r) => [r, team.filter((s) => s.active && s.accessRole === r).length]));

  return (
    <>
      <PageHeader
        title="Roles & access"
        subtitle="What each role can see and do. Give each person a role on their staff page. Admins always have everything."
      />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th className="min-w-[16rem]">Permission</th>
              {EDITABLE.map((r) => (
                <th key={r} className="text-center">
                  <span className="block">{ACCESS_ROLE_LABEL[r]}</span>
                  <span className="block text-[11px] font-normal text-zinc-500">{counts[r]} {counts[r] === 1 ? "person" : "people"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <PermissionGroup key={g.title} title={g.title}>
                {g.items.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <span className="block font-medium">{item.label}</span>
                      {item.hint && <span className="block text-xs text-zinc-500">{item.hint}</span>}
                    </td>
                    {EDITABLE.map((r) => {
                      const on = matrix[r].has(item.key);
                      const changed = on !== DEFAULT_PERMISSIONS[r].has(item.key);
                      return (
                        <td key={r} className="text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-black"
                            form={`role-${r}`}
                            name="permissions"
                            value={item.key}
                            defaultChecked={on}
                            aria-label={`${ACCESS_ROLE_LABEL[r]}: ${item.label}`}
                          />
                          {changed && <span className="ml-1 align-middle text-[10px] text-amber-700" title="Changed from the default">●</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </PermissionGroup>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="text-xs text-zinc-500"><span className="text-amber-700">●</span> changed from the default</td>
              {EDITABLE.map((r) => (
                <td key={r} className="text-center">
                  <button className="btn px-3 py-1.5 text-sm" type="submit" form={`role-${r}`}>Save</button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {/* One form per role, so each column saves on its own; the checkboxes above belong to them through form=. */}
      {EDITABLE.map((r) => <form key={r} id={`role-${r}`} action={saveRoleAccessAction.bind(null, r)} />)}
    </>
  );
}

function PermissionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-zinc-50">
        <td colSpan={EDITABLE.length + 1} className="py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{title}</td>
      </tr>
      {children}
    </>
  );
}
