/**
 * Centralized Icon Set
 * Exports optimized SVG icons with consistent sizes and styling
 * Usage: <Icons.Plus className="h-4 w-4" />
 */

import React from "react";

interface IconProps {
  className?: string;
  "aria-hidden"?: boolean;
  title?: string;
}

const iconDefaults = {
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icons = {
  // Navigation & UI
  Menu: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),

  Close: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),

  X: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),

  ChevronDown: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M19 9l-7 7-7-7" />
    </svg>
  ),

  ChevronRight: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  ),

  ChevronUp: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M5 15l7-7 7 7" />
    </svg>
  ),

  // Actions
  Plus: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M12 4.5v15m7.5-7.5h-15" strokeWidth={2} />
    </svg>
  ),

  Check: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M5 13l4 4L19 7" strokeWidth={3} />
    </svg>
  ),

  CheckCircle: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M9 12.75 11.25 15 15 9.75" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  ),

  Clock: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),

  Trash: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  ),

  Edit: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  ),

  Download: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 10.5 12 15m0 0 4.5-4.5M12 15V3" />
    </svg>
  ),

  Copy: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 1.375a9.06 9.06 0 0 0-1.5-.125H9.375" />
    </svg>
  ),

  Search: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  ),

  // Forms & Input
  Document: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M4.5 4.5A2.25 2.25 0 0 1 6.75 2.25h8.25a2.25 2.25 0 0 1 2.25 2.25v15A2.25 2.25 0 0 1 15 21.75H6.75A2.25 2.25 0 0 1 4.5 19.5v-15Z" />
      <path d="M8.25 6.75h7.5M8.25 10.5h7.5M8.25 14.25H12" />
    </svg>
  ),

  Expand: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M8.25 3.75H4.5A.75.75 0 0 0 3.75 4.5v3.75M15.75 3.75h3.75a.75.75 0 0 1 .75.75v3.75M20.25 15.75V19.5a.75.75 0 0 1-.75.75h-3.75M3.75 15.75V19.5a.75.75 0 0 0 .75.75h3.75" />
    </svg>
  ),

  Fullscreen: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  ),

  // Content
  Music: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M12 3v10.5M19.5 8.25a3 3 0 11-3-3M6.75 6.75a3 3 0 11-3 3" />
    </svg>
  ),

  Calendar: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  ),

  GridView: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25v-2.25Zm9-9.75A2.25 2.25 0 0 1 15 3.75H17.25a2.25 2.25 0 0 1 2.25 2.25V6A2.25 2.25 0 0 1 17.25 8.25H15a2.25 2.25 0 0 1-2.25-2.25V6Zm0 9.75A2.25 2.25 0 0 1 15 13.5H17.25a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 17.25 20.25H15a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  ),

  ListView: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  ),

  People: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  ),

  // Status
  Settings: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M10.5 6h3M8.12 7.12l2.121 2.121M7 10.5v3M8.12 15.88l2.121-2.121M13.5 18h-3M15.88 16.88l-2.121-2.121M17 13.5v-3M15.88 8.12l-2.121 2.121" />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  ),

  // Analytics
  Analytics: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 6.75c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75ZM16.5 6.75c0-.621.504-1.125 1.125-1.125h2.25C20.496 5.625 21 6.129 21 6.75v13.5c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V6.75Z" />
    </svg>
  ),

  ChartLine: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M3 3v18h18M7.5 14.25 10.5 11l2.25 2.25 4.5-5.25" />
    </svg>
  ),

  // Finance
  Wallet: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M2.25 9.75A3.75 3.75 0 0 1 6 6h12a3.75 3.75 0 0 1 3.75 3.75v5.25A3.75 3.75 0 0 1 18 18.75H6A3.75 3.75 0 0 1 2.25 15V9.75Z" />
      <path d="M6 9h12M7.5 13.5h3" />
    </svg>
  ),

  TrendingUp: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M2.25 18 9 11.25l4.306 4.306a11.25 11.25 0 015.814 5.814L21.75 7.5M5.25 7.5H21m0 0V21.75" />
    </svg>
  ),

  // Alerts
  AlertTriangle: (props: IconProps) => (
    <svg {...iconDefaults} {...props} fill="currentColor">
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),

  AlertCircle: (props: IconProps) => (
    <svg {...iconDefaults} {...props} fill="currentColor">
      <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),

  InfoCircle: (props: IconProps) => (
    <svg {...iconDefaults} {...props} fill="currentColor">
      <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),

  // Animations
  Spinner: (props: IconProps) => (
    <svg
      {...props}
      className={`animate-spin ${props.className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  ),

  // Empty states
  Music2: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
    </svg>
  ),

  // Brand icons
  GitHub: (props: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.262.82-.582 0-.288-.01-1.05-.016-2.06-3.338.726-4.042-1.61-4.042-1.61-.546-1.388-1.333-1.758-1.333-1.758-1.09-.746.083-.73.083-.73 1.205.085 1.84 1.238 1.84 1.238 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.76-1.605-2.665-.304-5.467-1.332-5.467-5.93 0-1.31.468-2.382 1.235-3.222-.124-.303-.535-1.524.117-3.176 0 0 1.008-.323 3.3 1.23.957-.266 1.98-.399 3-.405 1.02.006 2.043.139 3 .405 2.29-1.553 3.296-1.23 3.296-1.23.654 1.653.243 2.874.12 3.176.77.84 1.233 1.913 1.233 3.222 0 4.61-2.807 5.624-5.48 5.92.43.37.817 1.096.817 2.21 0 1.596-.014 2.883-.014 3.276 0 .322.216.699.825.58C20.565 21.796 24 17.297 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),

  Phone: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M4.5 4.5A2.25 2.25 0 0 1 6.75 2.25h8.25a2.25 2.25 0 0 1 2.25 2.25v15A2.25 2.25 0 0 1 15 21.75H6.75A2.25 2.25 0 0 1 4.5 19.5v-15Z" />
      <path d="M8.25 6.75h7.5M8.25 10.5h7.5M8.25 14.25H12" />
    </svg>
  ),

  Link: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M7.5 8.25h9m-9 3h5.25m4.173 6.951 1.202-.601a2.25 2.25 0 0 0 1.244-2.012V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v8.838a2.25 2.25 0 0 0 1.244 2.012l1.202.601a2.25 2.25 0 0 0 2.012 0l1.202-.601a2.25 2.25 0 0 1 2.012 0l1.202.601a2.25 2.25 0 0 0 2.012 0Z" />
    </svg>
  ),

  Keyboard: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13h.01M10 13h.01M13 13h4" />
    </svg>
  ),

  Sparkles: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  ),

  Brain: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M12 4.5v15m-4-13.5a3.5 3.5 0 0 0-3.5 3.5c0 1.37.79 2.55 1.93 3.12A3.5 3.5 0 0 0 7 19.5h1m8-13.5a3.5 3.5 0 0 1 3.5 3.5c0 1.37-.79 2.55-1.93 3.12A3.5 3.5 0 0 1 17 19.5h-1" />
    </svg>
  ),

  Lightbulb: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M12 18v-1.5m0-12a6 6 0 0 0-6 6c0 2.22 1.21 4.16 3 5.2V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.3c1.79-1.04 3-2.98 3-5.2a6 6 0 0 0-6-6Zm-3 18h6" />
    </svg>
  ),



  Sliders: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M6 13.5V3.75m0 9.75a2.25 2.25 0 1 0 0 4.5m0-4.5a2.25 2.25 0 1 1 0 4.5m0 0V20.25m6-16.5v4.5m0 0a2.25 2.25 0 1 0 0 4.5m0-4.5a2.25 2.25 0 1 1 0 4.5m0 0V20.25m6-16.5v10.5m0 0a2.25 2.25 0 1 0 0 4.5m0-4.5a2.25 2.25 0 1 1 0 4.5m0 0V20.25" />
    </svg>
  ),

  HelpCircle: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.451 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
  ),

  ExternalLink: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  ),

  MapPin: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),

  Lock: (props: IconProps) => (
    <svg {...iconDefaults} {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
};

// For backward compatibility with common patterns
export const LoadingSpinner = (props: IconProps) => Icons.Spinner(props);
