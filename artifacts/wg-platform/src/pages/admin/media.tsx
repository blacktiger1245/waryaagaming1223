import { AdminEntityManager } from "@/components/admin/admin-entity-manager";

export default function AdminMediaPage() {
  return (
    <AdminEntityManager
      endpoint="media"
      title="Media Item"
      columns={[
        { name: "title", label: "Title" },
        { name: "platform", label: "Platform" },
        { name: "publishedAt", label: "Published" },
      ]}
      fields={[
        { name: "title", label: "Title", required: true },
        { name: "platform", label: "Platform (YouTube/TikTok)", required: true },
        { name: "url", label: "URL", required: true },
        { name: "embedUrl", label: "Embed URL", required: true },
        { name: "thumbnailUrl", label: "Thumbnail URL" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "publishedAt", label: "Published At" },
      ]}
    />
  );
}
