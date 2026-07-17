type PixelHouseIconProps = {
  size?: number;
  className?: string;
};

/** 16×16 pixel house drawn as crisp SVG rects. */
export default function PixelHouseIcon({
  size = 22,
  className,
}: PixelHouseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
      style={{ imageRendering: "pixelated" }}
    >
      {/* Roof */}
      <rect x="7" y="1" width="2" height="1" />
      <rect x="6" y="2" width="4" height="1" />
      <rect x="5" y="3" width="6" height="1" />
      <rect x="4" y="4" width="8" height="1" />
      <rect x="3" y="5" width="10" height="1" />
      <rect x="2" y="6" width="12" height="1" />

      {/* Chimney */}
      <rect x="11" y="2" width="2" height="4" opacity={0.7} />

      {/* Wall body (left of door / around windows) */}
      <rect x="3" y="7" width="4" height="2" />
      <rect x="9" y="7" width="4" height="2" />
      <rect x="3" y="9" width="1" height="2" />
      <rect x="6" y="9" width="1" height="2" />
      <rect x="9" y="9" width="1" height="2" />
      <rect x="12" y="9" width="1" height="2" />
      <rect x="3" y="11" width="4" height="3" />
      <rect x="9" y="11" width="4" height="3" />

      {/* Door posts + lintel */}
      <rect x="7" y="7" width="2" height="3" />
      <rect x="7" y="10" width="1" height="4" opacity={0.9} />
      <rect x="8" y="10" width="1" height="4" opacity={0.9} />

      {/* Window panes */}
      <rect x="4" y="9" width="2" height="2" opacity={0.35} />
      <rect x="10" y="9" width="2" height="2" opacity={0.35} />
    </svg>
  );
}
