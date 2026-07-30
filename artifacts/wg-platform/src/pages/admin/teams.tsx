import { AdminEntityManager } from "@/components/admin/admin-entity-manager";

export default function AdminTeamsPage() {
  return (
    <AdminEntityManager
      endpoint="teams"
      title="Team"
      columns={[
        {
          name: "logoUrl",
          label: "Logo",
          render: (row) =>
            row["logoUrl"]
              ? <img src={String(row["logoUrl"])} alt="" className="w-9 h-9 rounded-lg object-cover border border-border" />
              : <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">—</div>,
        },
        { name: "name", label: "Name" },
        { name: "tag", label: "Tag" },
        { name: "wins", label: "Wins" },
        { name: "losses", label: "Losses" },
        { name: "points", label: "Points" },
      ]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "tag", label: "Tag" },
        { name: "logoUrl", label: "Logo URL" },
        { name: "captainId", label: "Captain ID (Player)", type: "number", required: true },
        { name: "wins", label: "Wins", type: "number" },
        { name: "losses", label: "Losses", type: "number" },
        { name: "points", label: "Points", type: "number" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "achievements", label: "Achievements", type: "array" },
      ]}
    />
  );
}
