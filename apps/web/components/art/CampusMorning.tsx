/**
 * "First morning" — the hero illustration.
 *
 * A photograph would be better if one existed; a *stock* photograph would be
 * worse than this. So the hero is drawn: dawn over the block, the path in, and
 * five students walking away from you toward it. Everyone who sees this page
 * has been the person at the back of that group.
 *
 * Drawn in the brand palette only — navy shield, amber flame, violet, sky.
 * When Communications supplies real photography, swap this component for an
 * <Image> inside the same `.brush` frame; nothing else needs to change.
 */

/** One student, seen from behind. Origin is between the feet. */
function Student({
  x,
  scale = 1,
  coat,
  bag,
}: {
  x: number
  scale?: number
  coat: string
  bag: string
}) {
  return (
    <g transform={`translate(${x} 0) scale(${scale})`}>
      {/* shadow pooled at the feet */}
      <ellipse cx="0" cy="2" rx="19" ry="5" fill="#001b44" opacity="0.13" />
      {/* legs */}
      <path d="M-8 0v-48h6v48z" fill={coat} />
      <path d="M2 0v-48h6v48z" fill={coat} opacity="0.82" />
      {/* torso */}
      <path d="M-17-48v-40a17 17 0 0 1 34 0v40z" fill={coat} />
      {/* arms */}
      <path d="M-17-84c-6 4-8 14-7 26" stroke={coat} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M17-84c6 4 8 14 7 26" stroke={coat} strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* backpack */}
      <rect x="-13" y="-84" width="26" height="34" rx="9" fill={bag} />
      <path d="M-13-72h26" stroke="#001b44" strokeWidth="2" opacity="0.25" />
      {/* head */}
      <circle cx="0" cy="-102" r="12.5" fill="#2a2118" />
      <path d="M-12-104a12 12 0 0 1 24 0z" fill="#1a140e" />
    </g>
  )
}

export function CampusMorning({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 620"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Five students walking a tree-lined path toward the Amity University Patna academic block at sunrise."
    >
      <defs>
        <linearGradient id="cm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d8e2ff" />
          <stop offset="52%" stopColor="#f0e6ff" />
          <stop offset="100%" stopColor="#ffdcc4" />
        </linearGradient>
        <radialGradient id="cm-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb77f" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#ff8a00" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#ff8a00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cm-lawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfe4d6" />
          <stop offset="100%" stopColor="#eef3ee" />
        </linearGradient>
        <linearGradient id="cm-block" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d2a5c" />
          <stop offset="100%" stopColor="#001b44" />
        </linearGradient>
        <linearGradient id="cm-path" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8eaf2" />
          <stop offset="100%" stopColor="#f8f9fd" />
        </linearGradient>
      </defs>

      {/* ---- sky ---------------------------------------------------------- */}
      <rect width="800" height="620" fill="url(#cm-sky)" />
      <circle cx="612" cy="132" r="150" fill="url(#cm-sun)" />
      <circle cx="612" cy="132" r="46" fill="#ffb77f" opacity="0.85" />

      {/* birds */}
      <g stroke="#001b44" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.4">
        <path d="M158 96c7-7 12-7 18 0 6-7 11-7 18 0" />
        <path d="M212 62c5-5 9-5 13 0 4-5 8-5 13 0" />
        <path d="M120 142c4-4 8-4 11 0 3-4 7-4 11 0" />
      </g>

      {/* ---- far skyline -------------------------------------------------- */}
      <g fill="#001b44" opacity="0.14">
        <rect x="24" y="262" width="96" height="82" />
        <rect x="128" y="286" width="62" height="58" />
        <rect x="688" y="248" width="88" height="96" />
      </g>

      {/* ---- left teaching block ------------------------------------------ */}
      <rect x="48" y="214" width="248" height="130" fill="url(#cm-block)" opacity="0.92" />
      <g fill="#ffdcc4" opacity="0.6">
        {[0, 1, 2, 3].map((r) =>
          [0, 1, 2, 3, 4, 5].map((c) => (
            <rect key={`l${r}-${c}`} x={68 + c * 38} y={232 + r * 28} width="22" height="16" rx="2" />
          )),
        )}
      </g>

      {/* ---- main academic block ------------------------------------------ */}
      <rect x="368" y="158" width="392" height="186" fill="url(#cm-block)" />
      {/* roof line + flag */}
      <rect x="360" y="150" width="408" height="12" rx="4" fill="#001b44" />
      <path d="M556 150v-52" stroke="#001b44" strokeWidth="4" strokeLinecap="round" />
      <path d="M558 100h44l-10 12 10 12h-44z" fill="#ff8a00" />
      {/* windows */}
      <g fill="#ffdcc4" opacity="0.78">
        {[0, 1, 2, 3, 4].map((r) =>
          [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
            <rect key={`m${r}-${c}`} x={390 + c * 41} y={178 + r * 32} width="26" height="20" rx="2.5" />
          )),
        )}
      </g>
      {/* entrance */}
      <path d="M534 344v-58a30 30 0 0 1 60 0v58z" fill="#ffb77f" opacity="0.9" />
      <path d="M534 286h60" stroke="#001b44" strokeWidth="3" opacity="0.3" />
      {/* the university name band */}
      <rect x="410" y="122" width="112" height="18" rx="4" fill="#001b44" opacity="0.55" />

      {/* ---- ground ------------------------------------------------------- */}
      <rect y="344" width="800" height="276" fill="url(#cm-lawn)" />
      <path d="M338 344h124l204 276H140z" fill="url(#cm-path)" />
      <path
        d="M338 344h124l204 276H140z"
        fill="none"
        stroke="#c5c6d0"
        strokeWidth="2"
        opacity="0.7"
      />

      {/* ---- trees -------------------------------------------------------- */}
      <g>
        <path d="M296 344v-52" stroke="#7a5230" strokeWidth="9" strokeLinecap="round" />
        <circle cx="296" cy="272" r="44" fill="#0d7a4f" opacity="0.82" />
        <circle cx="272" cy="292" r="28" fill="#0d7a4f" opacity="0.62" />
        <circle cx="322" cy="290" r="26" fill="#0d7a4f" opacity="0.7" />
      </g>
      <g>
        <path d="M752 372v-64" stroke="#7a5230" strokeWidth="11" strokeLinecap="round" />
        <circle cx="752" cy="286" r="56" fill="#0d7a4f" opacity="0.86" />
        <circle cx="710" cy="312" r="34" fill="#0d7a4f" opacity="0.66" />
      </g>
      <g opacity="0.55">
        <path d="M74 358v-34" stroke="#7a5230" strokeWidth="7" strokeLinecap="round" />
        <circle cx="74" cy="312" r="30" fill="#0d7a4f" opacity="0.8" />
      </g>

      {/* planter beds either side of the path */}
      <ellipse cx="250" cy="470" rx="86" ry="18" fill="#0d7a4f" opacity="0.16" />
      <ellipse cx="576" cy="500" rx="104" ry="20" fill="#0d7a4f" opacity="0.14" />

      {/* ---- the batch, walking in ---------------------------------------- */}
      <g transform="translate(0 604)">
        <Student x={252} scale={0.82} coat="#5b3cdd" bag="#ffb77f" />
        <Student x={330} scale={0.9} coat="#001b44" bag="#e5deff" />
        <Student x={412} scale={1} coat="#ca6c00" bag="#d8e2ff" />
        <Student x={498} scale={0.94} coat="#0d2a5c" bag="#ffdcc4" />
        <Student x={572} scale={0.84} coat="#7459f7" bag="#ffb77f" />
      </g>
    </svg>
  )
}
