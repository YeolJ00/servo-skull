// The servo-skull mark, as an inline SVG that takes its color from `currentColor`.
// Same geometry as public/icon.svg. Sockets are true holes (evenodd), so it sits on any background.
interface Props {
  size?: number | string;
  class?: string | undefined;
  title?: string | undefined;
}

export function SkullIcon({ size = 24, class: cls, title }: Props) {
  return (
    <svg
      viewBox="4 4 56 58"
      width={size}
      height={size}
      class={cls}
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path
        fill-rule="evenodd"
        d="M12 30C11 13 20 5 32 5C44 5 53 13 52 30C52 34 54 36 53 40C52 44 48 45 46 49L46 53L18 53L18 49C16 45 12 44 11 40C10 36 12 34 12 30ZM14.5 33a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0ZM16.5 33a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0ZM19 33a4 4 0 1 0 8 0a4 4 0 1 0-8 0ZM21.4 33a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0ZM33 31L47.5 27L48.5 33L43 37.5L34 36.5ZM32 40L35.5 47L28.5 47Z"
      />
      <g transform="rotate(45 23 33)">
        <rect x="22.1" y="24.5" width="1.8" height="2.6" />
        <rect x="22.1" y="38.9" width="1.8" height="2.6" />
        <rect x="14.5" y="32.1" width="2.6" height="1.8" />
        <rect x="28.9" y="32.1" width="2.6" height="1.8" />
      </g>
      <rect x="19" y="53" width="4" height="5.5" />
      <rect x="24.5" y="53" width="4" height="6.5" />
      <rect x="30" y="53" width="4" height="6.5" />
      <rect x="35.5" y="53" width="4" height="6.5" />
      <rect x="41" y="53" width="4" height="5.5" />
    </svg>
  );
}
