import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CloudUpload,
  FileImage,
  CircleX,
  LoaderCircle,
  Check,
  ShieldCheck,
  Monitor,
  Shield,
  X,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface TeamDeviceModalProps {
  open: boolean;
  onClose: () => void;
  teamId: number;
  teamName: string;
  onSaved?: () => void;
}

interface Submission {
  id: number;
  teamId: number;
  serialNumber: string;
  screenshotPath: string;
  submittedAt: string;
}

interface DetailsResponse {
  deviceName: string | null;
  gamingDevice?: string | null;
  team: { id: number; name: string } | null;
  submission: Submission | null;
}

export default function TeamDeviceModal({
  open,
  onClose,
  teamId,
  teamName,
  onSaved,
}: TeamDeviceModalProps) {
  const [details, setDetails] = useState<DetailsResponse | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [serial, setSerial] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  // Revoke the object URL when it changes / on unmount.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function reset() {
    setDetails(null);
    setLoadingDetails(true);
    setDetailsError(null);
    setSerial("");
    setFile(null);
    setDragOver(false);
    setSubmitting(false);
    setError(null);
    setDone(false);
  }

  useEffect(() => {
    if (!open) return;
    reset();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    try {
      const res = await fetch(apiUrl("/api/member-device/details"), { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailsError(data.error ?? "Could not load your details.");
        return;
      }
      setDetails(data);
      setDone(!!data.submission);
    } catch {
      setDetailsError("Could not load your details.");
    } finally {
      setLoadingDetails(false);
    }
  }

  function acceptFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please upload an image file (PNG or JPG).");
      return;
    }
    setError(null);
    setFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer?.files?.[0]);
  }

  function onSelectFile(e: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0]);
    if (e.target.value) e.target.value = "";
  }

  function validate(): string | null {
    if (!serial.trim()) return "Serial number is required.";
    if (!file) return "Please add a screenshot of your serial number.";
    return null;
  }

  async function submit() {
    setError(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    if (!file) return;
    setSubmitting(true);
    try {
      // 1) Upload the proof screenshot through the API upload pipeline.
      const uploadRes = await fetch(apiUrl("/api/storage/uploads/serial-screenshot/direct"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        setError(uploadData.error ?? "Could not upload the screenshot.");
        return;
      }
      const screenshotPath = `/api/storage${uploadData.objectPath}`;

      // 2) Save the device details to the database.
      const res = await fetch(apiUrl("/api/member-device"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, serialNumber: serial.trim(), screenshotPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save your device details.");
        return;
      }
      setDone(true);
      onSaved?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }
const readOnly = done || loadingDetails || !!detailsError;
  const missingDevice = !!details && !details.deviceName;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-primary/20 bg-zinc-950 shadow-[0_0_60px_rgba(56,189,248,0.18)] sm:max-w-lg sm:rounded-3xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-primary/15 bg-zinc-950/95 px-6 py-4 backdrop-blur">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-black uppercase tracking-tight text-white">
                    Add Your Details
                  </h2>
                  <p className="text-[11px] text-zinc-500">Team member registration</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-6">
              {loadingDetails ? (
                <div className="flex items-center justify-center gap-3 py-14 text-zinc-400">
                  <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                  Loading your details…
                </div>
              ) : detailsError ? (
                <div className="py-10 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                    <X className="h-6 w-6" />
                  </span>
                  <p className="mt-4 text-sm font-bold text-white">{detailsError}</p>
                  <Button variant="outline" className="mt-5" onClick={onClose}>
                    Close
                  </Button>
                </div>
              ) : done ? (
                <SuccessPanel
                  submittedAt={details?.submission?.submittedAt}
                  serial={details?.submission?.serialNumber ?? serial}
                  onClose={onClose}
                />
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit();
                  }}
                  className="space-y-5"
                >
                  <Field label="Device Name" hint="Automatically from your registered device. You can't change this.">
                    <div className="relative">
                      <Monitor className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                      <input
                        value={details?.deviceName ?? ""}
                        readOnly
                        disabled
                        className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-zinc-200 outline-none"
                        placeholder="—"
                      />
                    </div>
                  </Field>

                  <Field label="Team Name" hint="Your current team. You can't change this.">
                    <div className="relative">
                      <Shield className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                      <input
                        value={teamName || details?.team?.name || ""}
                        readOnly
                        disabled
                        className="w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-zinc-200 outline-none"
                        placeholder="—"
                      />
                    </div>
                  </Field>

                  <Field label="Serial Number" hint="Enter the serial number of your device." required>
                    <input
                      value={serial}
                      onChange={(e) => setSerial(e.target.value)}
                      disabled={readOnly || submitting}
                      placeholder="e.g. SN-2026-XXXX"
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-primary/60 disabled:opacity-50"
                    />
                  </Field>
<Field
                    label="Screenshot of Serial Number"
                    hint="Drag &amp; drop an image, or click to browse."
                    required
                  >
                    {file ? (
                      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Screenshot preview"
                            className="h-16 w-16 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-400">
                            <FileImage className="h-7 w-7" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{file.name}</p>
                          <p className="text-xs text-zinc-500">{Math.round(file.size / 1024)} KB</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                          aria-label="Remove screenshot"
                        >
                          <CircleX className="h-5 w-5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        disabled={readOnly || submitting}
                        className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors disabled:opacity-50 ${
                          dragOver
                            ? "border-primary bg-primary/10"
                            : "border-white/15 bg-black/20 hover:border-primary/50 hover:bg-primary/5"
                        }`}
                      >
                        <CloudUpload className="h-8 w-8 text-primary" />
                        <p className="mt-3 text-sm font-bold text-white">Drop your screenshot here</p>
                        <p className="mt-1 text-xs text-zinc-500">or click to browse · PNG, JPG</p>
                      </button>
                    )}
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onSelectFile}
                    />
                  </Field>

                  {missingDevice && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                      No registered device was found on your profile. Complete your profile
                      (onboarding) to register your device name before submitting.
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onClose}
                      disabled={submitting}
                      className="border border-white/10 text-zinc-300 hover:text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting || missingDevice}
                      className="gap-2 font-bold uppercase tracking-wide disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" /> Saving…
                        </>
                      ) : (
                        "Submit Details"
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function SuccessPanel({
  submittedAt,
  serial,
  onClose,
}: {
  submittedAt?: string;
  serial?: string;
  onClose: () => void;
}) {
  return (
    <div className="py-8 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="h-7 w-7" />
      </span>
      <h3 className="mt-4 text-lg font-black uppercase tracking-tight text-white">
        Details Submitted
      </h3>
      <p className="mt-2 text-sm text-zinc-400">
        Your device details have been saved.
        {serial && (
          <>
            {" "}Serial: <span className="font-bold text-primary">{serial}</span>
          </>
        )}
        {submittedAt && (
          <>
            {" "}Submitted{" "}
            {new Date(submittedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            .
          </>
        )}
      </p>
      <Button className="mt-6 font-bold uppercase tracking-wide" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}