import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    // Class card color themes (dynamic index-based assignment)
    "bg-violet-600", "bg-violet-50", "text-violet-700", "border-violet-200", "from-violet-700", "to-violet-800",
    "bg-emerald-600", "bg-emerald-50", "text-emerald-700", "border-emerald-200", "from-emerald-700", "to-emerald-800",
    "bg-blue-600",   "bg-blue-50",   "text-blue-700",   "border-blue-200",   "from-blue-700",   "to-blue-800",
    "bg-rose-600",   "bg-rose-50",   "text-rose-700",   "border-rose-200",   "from-rose-700",   "to-rose-800",
    "bg-amber-500",  "bg-amber-50",  "text-amber-700",  "border-amber-200",  "from-amber-600",  "to-amber-700",
  ],
  theme: {
    extend: {
      colors: {
        // Teacher dashboard design system — royal-blue primary + navy accent.
        primary: {
          DEFAULT: "#2952E3",   // sidebar background, primary CTA buttons
          hover:   "#4569E8",   // hover states, active nav icons
          light:   "#E5EAFB",   // active menu item backgrounds, subtle highlights
        },
        navy: "#162D7C",         // high-contrast text, active sidebar text, deep borders
        surface: {
          bg:   "#F4F6F9",       // main dashboard background behind white cards
          card: "#FFFFFF",       // white cards, modally raised surfaces
        },
        paper: {
          DEFAULT: "#FFFFFF",   // card surface
          soft:    "#F8FAFC",   // slate-50 card tint
          line:    "#E2E8F0",   // slate-200 hairline border
        },
        // Sage canvas + forest-green nav/accent — the redesign palette.
        sage: {
          DEFAULT: "#A9C4A2",
          soft:    "#B7CEB0",
          deep:    "#95B48D",
        },
        // Teacher portal brand/primary — alias of `primary` above, kept because
        // most existing components (SideNav, BottomNav, .paper-btn-primary)
        // already reference `forest`/`var(--forest)`.
        forest: {
          DEFAULT: "#2952E3",   // == primary
          soft:    "#4569E8",   // == primary-hover
          bright:  "#E5EAFB",   // == primary-light
        },
        ink: {
          DEFAULT: "#0F172A",   // slate-900 — headings / primary text
          soft:    "#64748B",   // slate-500 — secondary text (time slots, labels)
          faint:   "#94A3B8",   // slate-400 — tertiary / disabled text
        },
        sticker: {
          blue:      "#AACDEA",
          blueDark:  "#5B87AD",
          green:     "#AAD6A0",
          greenDark: "#5C8F52",
          coral:     "#F0A491",
          coralDark: "#C46B54",
          gold:      "#EAC968",
          goldDark:  "#AD8A2C",
          violet:    "#C7B7E8",
          violetDark:"#8069B0",
          pink:      "#F0AFC6",
          pinkDark:  "#BD6D8B",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "var(--font-jakarta)", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        body: ["var(--font-jakarta)", "-apple-system", "sans-serif"],
        kid: ["var(--font-kid)", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        "card": "0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)",
        "card-md": "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
        "nav": "0 -4px 16px 0 rgba(0,0,0,0.06)",
      },
      minHeight: { touch: "48px" },
      minWidth:  { touch: "48px" },
      fontWeight: { black: '800' },
      fontSize: {
        base: ["16px", { lineHeight: "1.5" }],
        lg:   ["18px", { lineHeight: "1.5" }],
        xl:   ["20px", { lineHeight: "1.4" }],
        "2xl":["24px", { lineHeight: "1.3" }],
      },
    },
  },
  plugins: [],
};

export default config;
