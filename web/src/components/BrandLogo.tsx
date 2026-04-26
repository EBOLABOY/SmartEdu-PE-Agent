import Image, { type ImageProps } from "next/image";

import { cn } from "@/lib/utils";
import { BRAND_LOGO_HORIZONTAL_SRC, BRAND_LOGO_ICON_SRC, BRAND_NAME } from "@/lib/brand";

type BrandLogoProps = Omit<ImageProps, "alt" | "height" | "src" | "width"> & {
  alt?: string;
  variant?: "horizontal" | "icon";
};

export default function BrandLogo({
  alt = `${BRAND_NAME} Logo`,
  className,
  priority,
  variant = "icon",
  ...props
}: BrandLogoProps) {
  const isHorizontal = variant === "horizontal";

  return (
    <Image
      alt={alt}
      className={cn(isHorizontal ? "h-10 w-auto object-contain" : "size-10 object-contain", className)}
      height={isHorizontal ? 219 : 1024}
      priority={priority}
      src={isHorizontal ? BRAND_LOGO_HORIZONTAL_SRC : BRAND_LOGO_ICON_SRC}
      width={isHorizontal ? 295 : 1024}
      {...props}
    />
  );
}
