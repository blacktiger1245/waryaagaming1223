import { AdminEntityManager } from "@/components/admin/admin-entity-manager";

export default function AdminHallOfFamePage() {
  return (
    <AdminEntityManager
      endpoint="hall-of-fame"
      title="Hall of Fame Entry"
      columns={[
        { name: "playerId", label: "Player ID" },
        { name: "achievement", label: "Achievement" },
        { name: "year", label: "Year" },
      ]}
      fields={[
        { name: "playerId", label: "Player ID", type: "number", required: true },
        { name: "achievement", label: "Achievement", required: true },
        { name: "year", label: "Year", type: "number", required: true },
        { name: "description", label: "Description", type: "textarea" },
      ]}
    />
  );
}
