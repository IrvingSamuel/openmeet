import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={18}
      height={18}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconVideo = (p: IconProps) => (
  <Base {...p}>
    <path d="M22 8.5 16 12l6 3.5v-7Z" />
    <rect x="2" y="6" width="14" height="12" rx="3" />
  </Base>
);

export const IconVideoOff = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 10.5 22 7v10l-4-2.3" />
    <path d="M14.5 18H5a3 3 0 0 1-3-3V9a3 3 0 0 1 2.2-2.9" />
    <path d="m2 2 20 20" />
  </Base>
);

export const IconMic = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </Base>
);

export const IconMicOff = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 5a3 3 0 0 0-6 0v5" />
    <path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a6.9 6.9 0 0 1-.6 2.8M12 18v4" />
    <path d="m2 2 20 20" />
  </Base>
);

export const IconScreen = (p: IconProps) => (
  <Base {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2.5" />
    <path d="M8 21h8M12 17v4M12 7v6M9.5 9.5 12 7l2.5 2.5" />
  </Base>
);

export const IconPhoneOff = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 14.5c-1-1-1.3-2.6-.6-3.8C5 7.4 9 5.6 12 5.6s7 1.8 9.1 5.1c.7 1.2.4 2.8-.6 3.8l-1.4 1.3a2 2 0 0 1-2.6.1l-1.4-1.1a2 2 0 0 1-.7-1.9l.2-1a9 9 0 0 0-5.2 0l.2 1a2 2 0 0 1-.7 1.9l-1.4 1.1a2 2 0 0 1-2.6-.1Z" />
  </Base>
);

export const IconChat = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.2-4A8 8 0 1 1 21 12Z" />
    <path d="M8.5 11h7M8.5 14.5h4" />
  </Base>
);

export const IconCaptions = (p: IconProps) => (
  <Base {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="3" />
    <path d="M9 10.5a2.5 2.5 0 1 0 0 3M17 10.5a2.5 2.5 0 1 0 0 3" />
  </Base>
);

export const IconGrid = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </Base>
);

export const IconSpotlight = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="13" height="16" rx="2.5" />
    <rect x="18" y="4" width="3" height="4.8" rx="1" />
    <rect x="18" y="9.6" width="3" height="4.8" rx="1" />
    <rect x="18" y="15.2" width="3" height="4.8" rx="1" />
  </Base>
);

export const IconUsers = (p: IconProps) => (
  <Base {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.2A6.5 6.5 0 0 1 21.5 20" />
  </Base>
);

export const IconSparkles = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.2 13.6 8 18.4 9.6 13.6 11.2 12 16l-1.6-4.8L5.6 9.6 10.4 8 12 3.2Z" />
    <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
  </Base>
);

export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2.8 20 6v6c0 4.5-3.2 8-8 9.2C8 20 4.8 16.5 4.8 12V6L12 2.8Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Base>
);

export const IconPalette = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-1.8 0-1.3-1.3-1.6-1.3-2.7 0-.8.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5C21 6 17 3 12 3Z" />
    <circle cx="7.8" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="11" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.6" cy="9.2" r="1.1" fill="currentColor" stroke="none" />
  </Base>
);

export const IconBolt = (p: IconProps) => (
  <Base {...p}>
    <path d="M13.2 2.5 4.8 13.4h5.6L10 21.5l8.6-11h-5.7l.3-8Z" />
  </Base>
);

export const IconLink = (p: IconProps) => (
  <Base {...p}>
    <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
    <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.3-1.3" />
  </Base>
);

export const IconCalendar = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconArrowRight = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5.5 15A2.5 2.5 0 0 1 3 12.5v-7A2.5 2.5 0 0 1 5.5 3h7A2.5 2.5 0 0 1 15 5.5" />
  </Base>
);

export const IconSettings = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Base>
);

export const IconLogout = (p: IconProps) => (
  <Base {...p}>
    <path d="M15 17l5-5-5-5M20 12H9M11 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
  </Base>
);

export const IconPin = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 3h6l-.7 5.2 3 3.1-4.3.9V21l-1 .5-1-.5v-8.8l-4.3-.9 3-3.1L9 3Z" />
  </Base>
);

export const IconFileText = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5-6Z" />
    <path d="M14 3v6h6M9 13h6M9 17h6" />
  </Base>
);

export const IconPencil = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </Base>
);

export const IconMore = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </Base>
);

export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v11M8 11l4 4 4-4M5 19h14" />
  </Base>
);
