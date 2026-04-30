import Image, { type ImageProps } from "next/image";

import { cn } from "@/lib/utils";
import { BRAND_LOGO_HORIZONTAL_SRC, BRAND_LOGO_ICON_SRC, BRAND_NAME } from "@/lib/brand";

type BrandLogoProps = Omit<ImageProps, "alt" | "height" | "src" | "width"> & {
  alt?: string;
  aboveTheFold?: boolean;
  variant?: "horizontal" | "icon";
};

export default function BrandLogo({
  aboveTheFold,
  alt = `${BRAND_NAME} Logo`,
  className,
  fetchPriority,
  loading,
  preload,
  priority,
  sizes,
  variant = "icon",
  ...props
}: BrandLogoProps) {
  const isHorizontal = variant === "horizontal";
  const isCritical = aboveTheFold ?? priority ?? preload ?? false;
  const effectiveLoading = loading ?? (isCritical ? "eager" : "lazy");
  const effectivePreload = effectiveLoading === "lazy" ? false : (preload ?? isCritical);
  const effectiveFetchPriority =
    fetchPriority ?? (effectiveLoading === "eager" && isCritical ? "high" : undefined);

  return (
    <Image
      alt={alt}
      className={cn(isHorizontal ? "h-10 w-auto object-contain" : "size-10 object-contain", className)}
      fetchPriority={effectiveFetchPriority}
      height={isHorizontal ? 219 : 1024}
      loading={effectiveLoading}
      preload={effectivePreload}
      sizes={sizes ?? (isHorizontal ? "295px" : "56px")}
      src={isHorizontal ? BRAND_LOGO_HORIZONTAL_SRC : BRAND_LOGO_ICON_SRC}
      width={isHorizontal ? 295 : 1024}
      {...props}
    />
  );
}
