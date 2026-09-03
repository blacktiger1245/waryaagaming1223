import { useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  ImagePlus,
  Trash2,
  Pencil,
  Rocket,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  X,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { storageUrl } from "@/lib/api";
import { ProductCard } from "@/components/shop/product-card";
import {
  fetchManagerProducts,
  createManagerProduct,
  updateManagerProduct,
  deleteManagerProduct,
  uploadShopImage,
  SHOP_CATEGORY_META,
  EFOOTBALL_TIER_META,
  formatPrice,
  type ShopCategory,
  type EfootballTier,
  type ShopProduct,
} from "@/lib/shop";

const TIERS: EfootballTier[] = ["cheap", "medium", "expensive"];

function isCategory(value: string | undefined): value is ShopCategory {
  return value === "efootball" || value === "coins" || value === "nitro";
}

/** Drag & drop upload area (click to browse, drop to upload). */
function DropZone({
  multiple,
  onUploaded,
  label,
  disabled,
}: {
  multiple: boolean;
  onUploaded: (paths: string[]) => void;
  label: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      toast({ title: "Images only", description: "Please drop image files.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const paths: string[] = [];
      for (const file of multiple ? images : images.slice(0, 1)) {
        paths.push(await uploadShopImage(file));
      }
      onUploaded(paths);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload the image.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && !uploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled && !uploading) inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !uploading) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled && !uploading) handleFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-card"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      data-testid={multiple ? "dropzone-gallery" : "dropzone-profile"}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : (
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
      )}
      <p className="text-sm font-bold">{uploading ? "Uploading…" : label}</p>
      <p className="text-xs text-muted-foreground">Drag & drop or click to upload {multiple ? "images" : "one image"}</p>
    </div>
  );
}

/** Yes / No segmented selector for the account link questions. */
function YesNo({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex gap-1 rounded-lg border border-border bg-muted p-0.5">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-md px-3 py-1 text-xs font-black uppercase transition-colors ${
            value ? "bg-green-500 text-white" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`button-yes-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-lg px-3 py-1 text-xs font-black uppercase transition-colors ${
            !value ? "bg-red-500 text-white" : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`button-no-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        >
          No
        </button>
      </div>
    </div>
  );
}

/** Create / edit product form with drag & drop uploads. */
function ProductForm({
  category,
  subcategory,
  editing,
  onClose,
}: {
  category: ShopCategory;
  subcategory: EfootballTier | null;
  editing: ShopProduct | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isEfootball = category === "efootball";

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [priceDollars, setPriceDollars] = useState(editing ? String(editing.priceCents / 100) : "");
  const [teamStrength, setTeamStrength] = useState(
    editing?.teamStrength != null ? String(editing.teamStrength) : "",
  );
  const [coinAmount, setCoinAmount] = useState(editing?.coinAmount ?? "");
  const [nitroPlan, setNitroPlan] = useState(editing?.nitroPlan ?? "");
  const [konami, setKonami] = useState(editing?.konamiIdLinked ?? false);
  const [gplay, setGplay] = useState(editing?.googlePlayLinked ?? false);
  const [gcenter, setGcenter] = useState(editing?.gameCenterLinked ?? false);
  const [profilePath, setProfilePath] = useState<string | null>(editing?.profileImagePath ?? null);
  const [extras, setExtras] = useState<string[]>(
    editing ? editing.galleryPaths.filter((p) => p !== editing.profileImagePath) : [],
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const priceCents = Math.round(parseFloat(priceDollars) * 100);
      if (!title.trim()) throw new Error("Title is required");
      if (!Number.isFinite(priceCents) || priceCents <= 0) throw new Error("Enter a valid price");
      if (isEfootball && !editing && !profilePath && extras.length === 0)
        throw new Error("Upload a profile picture first");

      const dedupedExtras = extras.filter((p) => p !== profilePath);
      const galleryPaths = [profilePath, ...dedupedExtras].filter((p): p is string => !!p);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        priceCents,
        profileImagePath: profilePath ?? galleryPaths[0] ?? null,
        galleryPaths,
        teamStrength: isEfootball && teamStrength.trim() ? parseInt(teamStrength, 10) : null,
        coinAmount: category === "coins" ? coinAmount.trim() || null : null,
        nitroPlan: category === "nitro" ? nitroPlan.trim() || null : null,
        konamiIdLinked: isEfootball ? konami : false,
        googlePlayLinked: isEfootball ? gplay : false,
        gameCenterLinked: isEfootball ? gcenter : false,
      };
      if (editing) {
        return updateManagerProduct(editing.id, payload);
      }
      return createManagerProduct({
        category,
        subcategory: isEfootball ? subcategory : null,
        ...payload,
        published: true,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-shop-products"] });
      qc.invalidateQueries({ queryKey: ["shop", "products"] });
      toast({
        title: editing ? "Product updated" : "Product published!",
        description: editing ? "Changes are live on the storefront." : "It is now visible in the storefront category.",
      });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const moveExtra = (index: number, dir: -1 | 1) => {
    const next = [...extras];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setExtras(next);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-product-form"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-border bg-card px-5 py-4">
          <h3 className="font-black uppercase tracking-widest">
            {editing ? "Edit product" : isEfootball ? "Add Account" : "Add Product"}
            <span className="ml-2 text-xs font-bold text-muted-foreground normal-case tracking-normal">
              {SHOP_CATEGORY_META[category].label}
              {subcategory ? ` · ${EFOOTBALL_TIER_META[subcategory].label}` : ""}
            </span>
          </h3>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* 1 — Account profile picture (single, becomes the card main image) */}
          <div className="space-y-2">
            <Label>1 · Account Profile Picture</Label>
            {profilePath ? (
              <div className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/5 p-3">
                <img
                  src={storageUrl(profilePath)}
                  alt="Profile"
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-green-400">Profile picture set</p>
                  <p className="text-xs text-muted-foreground">Used as the main image on the storefront card.</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setProfilePath(null)}>
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            ) : (
              <DropZone
                multiple={false}
                label="Account profile picture"
                onUploaded={(paths) => setProfilePath(paths[0] ?? null)}
              />
            )}
          </div>

          {/* 2 — Full account pictures (multi, reorderable) */}
          <div className="space-y-2">
            <Label>2 · Full Account Pictures (gallery)</Label>
            <DropZone multiple label="Full account pictures" onUploaded={(paths) => setExtras((prev) => [...prev, ...paths])} />
            {extras.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {extras.map((path, idx) => (
                  <div key={`${path}-${idx}`} className="group relative overflow-hidden rounded-lg border border-border">
                    <img src={storageUrl(path)} alt="" className="aspect-square w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/70 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                          onClick={() => moveExtra(idx, -1)}
                          disabled={idx === 0}
                          aria-label="Move earlier"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-30"
                          onClick={() => moveExtra(idx, 1)}
                          disabled={idx === extras.length - 1}
                          aria-label="Move later"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="rounded p-1 text-red-400 hover:bg-red-500/30"
                        onClick={() => setExtras((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-bold text-white">
                      {idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* 3+ — Product fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-title">3 · Title</Label>
              <Input
                id="product-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isEfootball ? "e.g. Elite Div 1 Account" : category === "coins" ? "e.g. 30M Coins Pack" : "e.g. Nitro 1 Month"}
                data-testid="input-product-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-price">4 · Price (USD)</Label>
              <Input
                id="product-price"
                type="number"
                min="0.5"
                step="0.01"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="e.g. 12.99"
                data-testid="input-product-price"
              />
            </div>
            {isEfootball ? (
              <div className="space-y-1.5">
                <Label htmlFor="product-strength">5 · Team Strength</Label>
                <Input
                  id="product-strength"
                  type="number"
                  min="1"
                  value={teamStrength}
                  onChange={(e) => setTeamStrength(e.target.value)}
                  placeholder="e.g. 3500"
                  data-testid="input-product-strength"
                />
              </div>
            ) : null}
            {category === "coins" ? (
              <div className="space-y-1.5">
                <Label htmlFor="product-amount">Coin amount</Label>
                <Input
                  id="product-amount"
                  value={coinAmount}
                  onChange={(e) => setCoinAmount(e.target.value)}
                  placeholder="e.g. 30M Coins"
                />
              </div>
            ) : null}
            {category === "nitro" ? (
              <div className="space-y-1.5">
                <Label htmlFor="product-plan">Plan / duration</Label>
                <Input
                  id="product-plan"
                  value={nitroPlan}
                  onChange={(e) => setNitroPlan(e.target.value)}
                  placeholder="e.g. 1 Month"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what the buyer gets…"
            />
          </div>

          {isEfootball ? (
            <div className="space-y-2">
              <Label>Account links</Label>
              <YesNo label="Konami ID Linked" value={konami} onChange={setKonami} />
              <YesNo label="Google Play Account" value={gplay} onChange={setGplay} />
              <YesNo label="Game Center" value={gcenter} onChange={setGcenter} />
            </div>
          ) : null}

          {error ? <p className="text-sm font-bold text-destructive">{error}</p> : null}

          <Button
            className="w-full font-black uppercase tracking-wide"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            data-testid="button-publish-product"
          >
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            {editing ? "Save changes" : "Publish"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * WG-SHOP Manager — per-category product management.
 * /admin/shop/efootball (tier tabs: Cheap / Medium / Expensive),
 * /admin/shop/coins, /admin/shop/nitro.
 */
export default function AdminShopProductsPage() {
  const [match, params] = useRoute("/admin/shop/:category");
  const category = match && params ? params.category : undefined;
  const { toast } = useToast();
  const qc = useQueryClient();

  const valid = isCategory(category);
  const [activeTier, setActiveTier] = useState<EfootballTier>("cheap");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShopProduct | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["manager-shop-products", category, activeTier],
    queryFn: () =>
      fetchManagerProducts(
        valid ? { category, subcategory: category === "efootball" ? activeTier : undefined } : undefined,
      ),
    enabled: valid,
  });

  const togglePublish = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) =>
      updateManagerProduct(id, { published }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["manager-shop-products"] });
      qc.invalidateQueries({ queryKey: ["shop", "products"] });
      toast({ title: updated.published ? "Product published" : "Product unpublished" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const removeProduct = useMutation({
    mutationFn: (id: number) => deleteManagerProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-shop-products"] });
      qc.invalidateQueries({ queryKey: ["shop", "products"] });
      toast({ title: "Product deleted" });
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  if (!valid || !category) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black uppercase tracking-wide">WG-SHOP Products</h1>
        <p className="text-sm text-muted-foreground">Pick a category from the sidebar: eFootball Accounts, Coins or Discord Nitro.</p>
      </div>
    );
  }

  const meta = SHOP_CATEGORY_META[category];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide" style={{ color: meta.accent }}>
            {meta.label}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {category === "efootball"
              ? `Manage the ${EFOOTBALL_TIER_META[activeTier].label.toLowerCase()} inventory shown on the storefront.`
              : "Products shown in this storefront category."}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="font-black uppercase tracking-wide"
          data-testid="button-add-product"
        >
          <Plus className="mr-1 h-4 w-4" />
          {category === "efootball" ? "Add Account" : "Add Product"}
        </Button>
      </div>

      {/* eFootball tier tabs — exactly Cheap / Medium / Expensive */}
      {category === "efootball" ? (
        <div className="flex flex-wrap gap-2">
          {TIERS.map((tier) => (
            <button
              key={tier}
              onClick={() => setActiveTier(tier)}
              data-testid={`tab-tier-${tier}`}
              className={`rounded-lg border px-4 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                activeTier === tier
                  ? "border-green-500 bg-green-500/15 text-green-400"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {EFOOTBALL_TIER_META[tier].label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Products */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading products…
        </div>
      ) : !products || products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <ImagePlus className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing here yet — click{" "}
            <span className="font-bold text-foreground">
              {category === "efootball" ? "Add Account" : "Add Product"}
            </span>{" "}
            to publish the first one.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <div key={product.id} className="space-y-2">
              <ProductCard
                product={product}
                onBuy={() => toast({ title: "Preview only", description: "Customers buy from the storefront." })}
              />
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${
                    product.published
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {product.published ? "Published" : "Draft"}
                </span>
                <span className="text-xs text-muted-foreground">{formatPrice(product.priceCents)}</span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title={product.published ? "Unpublish" : "Publish"}
                    onClick={() => togglePublish.mutate({ id: product.id, published: !product.published })}
                  >
                    {product.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Edit"
                    onClick={() => {
                      setEditing(product);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Delete"
                    onClick={() => {
                      if (window.confirm(`Delete “${product.title}” permanently?`)) removeProduct.mutate(product.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen ? (
        <ProductForm
          category={category}
          subcategory={category === "efootball" ? activeTier : null}
          editing={editing}
          onClose={() => setFormOpen(false)}
        />
      ) : null}
    </div>
  );
}
