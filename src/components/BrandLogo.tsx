import React from 'react';

export function MediQLogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="10" className="fill-emerald-500/15 dark:fill-emerald-500/15" />
      <rect
        x="0.75"
        y="0.75"
        width="34.5"
        height="34.5"
        rx="9.25"
        className="stroke-emerald-600/35 dark:stroke-emerald-400/35"
        strokeWidth="1.5"
      />
      {/* Clinical Cross + Pulse Node */}
      <path
        d="M15.5 8.5C15.5 7.94772 15.9477 7.5 16.5 7.5H19.5C20.0523 7.5 20.5 7.94772 20.5 8.5V15.5H27.5C28.0523 15.5 28.5 15.9477 28.5 16.5V19.5C28.5 20.0523 28.0523 20.5 27.5 20.5H20.5V27.5C20.5 28.0523 20.0523 28.5 19.5 28.5H16.5C15.9477 28.5 15.5 28.0523 15.5 27.5V20.5H8.5C7.94772 20.5 7.5 20.0523 7.5 19.5V16.5C7.5 15.9477 7.94772 15.5 8.5 15.5H15.5V8.5Z"
        className="fill-emerald-600 dark:fill-emerald-400"
      />
      {/* Electric Cyan AI Spark Node */}
      <circle cx="26.5" cy="9.5" r="3" className="fill-cyan-500 dark:fill-cyan-400" />
    </svg>
  );
}

export function MediQAssistantAvatar({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="12" className="fill-cyan-500/15 dark:fill-cyan-400/15" />
      <rect
        x="0.75"
        y="0.75"
        width="38.5"
        height="38.5"
        rx="11.25"
        className="stroke-cyan-600/35 dark:stroke-cyan-400/35"
        strokeWidth="1.5"
      />
      <path
        d="M11 20H14.5L17 14L20.5 26L23.5 17.5L25.5 20H29"
        className="stroke-cyan-600 dark:stroke-cyan-300"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="29" cy="12" r="2.2" className="fill-emerald-500 dark:fill-emerald-400" />
    </svg>
  );
}
