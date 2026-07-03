import React from 'react'

type P = { size?: number; className?: string }
const s = (n = 18) => ({ width: n, height: n, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })

export const Spark = ({ size = 18, className }: P) => (
  <svg {...s(size)} className={className} fill="currentColor" stroke="none">
    <path d="M12 2c.4 3.6 1.4 5.9 3 7.5C16.6 11 18.9 12 22 12c-3.1.4-5.4 1.4-7 3-1.6 1.6-2.6 3.9-3 7.5-.4-3.6-1.4-5.9-3-7.5C6.4 13.4 4.1 12.4 1 12c3.1-.4 5.4-1.4 7-3C9.6 7.4 10.6 5.1 12 2z" />
  </svg>
)
export const Plus = ({ size, className }: P) => (<svg {...s(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>)
export const Send = ({ size, className }: P) => (<svg {...s(size)} className={className}><path d="M12 19V5M5 12l7-7 7 7" /></svg>)
export const Stop = ({ size = 16, className }: P) => (<svg {...s(size)} className={className} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>)
export const Search = ({ size, className }: P) => (<svg {...s(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>)
export const Gear = ({ size, className }: P) => (<svg {...s(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 8 2.6h.1A1.7 1.7 0 0 0 10 1V.9a2 2 0 1 1 4 0V1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>)
export const Trash = ({ size = 16, className }: P) => (<svg {...s(size)} className={className}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg>)
export const Pin = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="M9 4v6l-2 4h10l-2-4V4M12 18v4M9 4h6" /></svg>)
export const Book = ({ size, className }: P) => (<svg {...s(size)} className={className}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>)
export const Layers = ({ size, className }: P) => (<svg {...s(size)} className={className}><path d="m12 2 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5" /></svg>)
export const Paperclip = ({ size = 18, className }: P) => (<svg {...s(size)} className={className}><path d="M21 12.5 12.5 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" /></svg>)
export const Copy = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>)
export const Edit = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>)
export const Refresh = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></svg>)
export const Brain = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.5a3 3 0 0 0-2 5.6A3 3 0 0 0 7 16v.5A2.5 2.5 0 0 0 12 16V4.5A2.5 2.5 0 0 0 9.5 2zM14.5 2A2.5 2.5 0 0 1 17 4.5v.5a3 3 0 0 1 2 5.6A3 3 0 0 1 17 16v.5a2.5 2.5 0 0 1-5 0" /></svg>)
export const Chevron = ({ size = 16, className }: P) => (<svg {...s(size)} className={className}><path d="m6 9 6 6 6-6" /></svg>)
export const Globe = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></svg>)
export const Code = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></svg>)
export const X = ({ size = 18, className }: P) => (<svg {...s(size)} className={className}><path d="M18 6 6 18M6 6l12 12" /></svg>)
export const Close = X
export const Logout = ({ size = 16, className }: P) => (<svg {...s(size)} className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>)
export const File = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>)
export const Eye = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>)
export const Folder = ({ size = 16, className }: P) => (<svg {...s(size)} className={className}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>)
export const Mic = ({ size = 18, className }: P) => (<svg {...s(size)} className={className}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>)
export const Shield = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" /></svg>)
export const Terminal = ({ size = 15, className }: P) => (<svg {...s(size)} className={className}><path d="m4 17 6-6-6-6M12 19h8" /></svg>)
export const Check = ({ size = 16, className }: P) => (<svg {...s(size)} className={className}><path d="M20 6 9 17l-5-5" /></svg>)
export const Sun = ({ size = 16, className }: P) => (<svg {...s(size)} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>)
export const Moon = ({ size = 16, className }: P) => (<svg {...s(size)} className={className}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>)
