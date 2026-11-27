import Image from "next/image";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductVisualProps {
  image?: string | null;
  images?: string[];
  description?: string | null;
  category?: string | null;
  sizes: string;
  priority?: boolean;
  className?: string;
  showLabel?: boolean;
}

const gradients: Record<string, string> = {
  "Almacén": "from-amber-100 via-orange-50 to-yellow-50 text-amber-700",
  "Bebidas": "from-sky-100 via-cyan-50 to-blue-50 text-sky-700",
  "Lácteos y Huevos": "from-blue-100 via-indigo-50 to-white text-blue-700",
  "Fiambres y Quesos": "from-rose-100 via-red-50 to-orange-50 text-rose-700",
  "Panadería": "from-orange-100 via-amber-50 to-yellow-50 text-orange-700",
  "Congelados": "from-cyan-100 via-sky-50 to-blue-50 text-cyan-700",
  "Limpieza": "from-emerald-100 via-teal-50 to-cyan-50 text-emerald-700",
  "Perfumería e Higiene": "from-fuchsia-100 via-pink-50 to-rose-50 text-fuchsia-700",
  "Golosinas": "from-purple-100 via-fuchsia-50 to-pink-50 text-purple-700",
  "Kiosco y Cigarrillos": "from-slate-200 via-zinc-100 to-stone-50 text-slate-700",
};

function gradientFor(category?: string | null) {
  return gradients[category ?? ""] ?? "from-slate-100 via-gray-50 to-white text-slate-600";
}

function initialsFor(description?: string | null) {
  const words = (description ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}

export function ProductVisual({
  image,
  images,
  description,
  category,
  sizes,
  priority = false,
  className,
  showLabel = true,
}: ProductVisualProps) {
  const url = images?.[0] || image;
  const isUsableUrl = Boolean(url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")));

  if (isUsableUrl && url) {
    return (
      <Image
        src={url}
        alt={`Imagen de ${description ?? "producto"}`}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label="Imagen no disponible"
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-linear-to-br",
        gradientFor(category),
        "dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 dark:text-slate-300",
        className,
      )}
    >
      <span className="relative flex size-16 items-center justify-center rounded-2xl bg-white/45 shadow-sm ring-1 ring-white/50 backdrop-blur-sm dark:bg-white/5 dark:ring-white/10">
        <Package className="absolute size-8 opacity-20" aria-hidden="true" />
        <span className="text-xl font-black tracking-tight text-current">{initialsFor(description)}</span>
      </span>
      {showLabel && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">
          Sin foto
        </span>
      )}
    </div>
  );
}
