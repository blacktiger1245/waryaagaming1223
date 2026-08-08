import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/api";

export type AdminField = {
  name: string;
  label: string;
  type?: "text" | "number" | "boolean" | "textarea" | "array";
  required?: boolean;
};

export type AdminColumn = {
  name: string;
  label: string;
  render?: (row: Record<string, unknown>) => React.ReactNode;
};

type Props = {
  endpoint: string;
  title: string;
  fields: AdminField[];
  columns: AdminColumn[];
  hideAddButton?: boolean;
};

type Row = Record<string, unknown> & { id: number };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

function buildDefaults(fields: AdminField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "boolean") defaults[f.name] = false;
    else if (f.type === "number") defaults[f.name] = "";
    else if (f.type === "array") defaults[f.name] = "";
    else defaults[f.name] = "";
  }
  return defaults;
}

export function AdminEntityManager({ endpoint, title, fields, columns, hideAddButton }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(buildDefaults(fields));

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", endpoint],
    queryFn: () => api<Row[]>(`/api/admin/${endpoint}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", endpoint] });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api(`/api/admin/${endpoint}`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: `${title} created` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      api(`/api/admin/${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: `${title} updated` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api(`/api/admin/${endpoint}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: `${title} deleted` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm(buildDefaults(fields));
    setDialogOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    const next: Record<string, unknown> = {};
    for (const f of fields) {
      const value = row[f.name];
      if (f.type === "array") next[f.name] = Array.isArray(value) ? value.join(", ") : "";
      else next[f.name] = value ?? (f.type === "boolean" ? false : "");
    }
    setForm(next);
    setDialogOpen(true);
  }

  function handleSubmit() {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = form[f.name];
      if (f.type === "number") {
        payload[f.name] = raw === "" ? undefined : Number(raw);
      } else if (f.type === "boolean") {
        payload[f.name] = !!raw;
      } else if (f.type === "array") {
        payload[f.name] = String(raw ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        payload[f.name] = raw === "" ? undefined : raw;
      }
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black uppercase tracking-wide">{title}</h2>
        {!hideAddButton && (
          <Button size="sm" className="gap-2 font-bold" onClick={openCreate} data-testid={`button-add-${endpoint}`}>
            <Plus className="w-4 h-4" /> Add {title}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.name}>{col.label}</TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading...
                </TableCell>
              </TableRow>
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">
                  No {title.toLowerCase()} yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-testid={`row-${endpoint}-${row.id}`}>
                  {columns.map((col) => (
                    <TableCell key={col.name}>
                      {col.render ? col.render(row) : String(row[col.name] ?? "—")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(row)}
                      data-testid={`button-edit-${endpoint}-${row.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete this ${title.toLowerCase()}?`)) deleteMutation.mutate(row.id);
                      }}
                      data-testid={`button-delete-${endpoint}-${row.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title}` : `Add ${title}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </label>
                {f.type === "boolean" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      checked={!!form[f.name]}
                      onCheckedChange={(checked) => setForm({ ...form, [f.name]: !!checked })}
                      data-testid={`input-${f.name}`}
                    />
                  </div>
                ) : f.type === "textarea" ? (
                  <Textarea
                    value={String(form[f.name] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                    data-testid={`input-${f.name}`}
                  />
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    value={String(form[f.name] ?? "")}
                    onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                    placeholder={f.type === "array" ? "comma, separated, values" : undefined}
                    data-testid={`input-${f.name}`}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving} className="gap-2" data-testid="button-save">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
