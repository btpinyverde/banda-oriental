// frontend/app/ui/Icon.tsx
const ICON_PATHS = {
  play: "m9 5 11 7-11 7Z",
  pause: "M8 5v14M16 5v14",
  reset: "M4 9a8 8 0 1 1 0 7M4 3v6h6",
  search: "M20 20l-5-5m2-6a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  lock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4",
} as const;

export type IconName = keyof typeof ICON_PATHS;

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 22 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === "play" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
