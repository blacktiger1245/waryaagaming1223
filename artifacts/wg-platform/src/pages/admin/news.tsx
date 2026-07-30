import { AdminEntityManager } from "@/components/admin/admin-entity-manager";

export default function AdminNewsPage() {
  return (
    <AdminEntityManager
      endpoint="news"
      title="News Article"
      columns={[
        { name: "title", label: "Title" },
        { name: "category", label: "Category" },
        { name: "isFeatured", label: "Featured", render: (r) => (r.isFeatured ? "Yes" : "No") },
      ]}
      fields={[
        { name: "title", label: "Title", required: true },
        { name: "slug", label: "Slug", required: true },
        { name: "category", label: "Category" },
        { name: "content", label: "Content", type: "textarea", required: true },
        { name: "excerpt", label: "Excerpt", type: "textarea" },
        { name: "imageUrl", label: "Image URL" },
        { name: "authorId", label: "Author ID", type: "number" },
        { name: "authorName", label: "Author Name" },
        { name: "isFeatured", label: "Featured", type: "boolean" },
      ]}
    />
  );
}
