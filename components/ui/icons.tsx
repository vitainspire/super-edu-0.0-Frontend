// ── Icon set for the redesigned teacher-portal surfaces ─────────────────────
// The reference design uses a rounded, chunky outline icon style — Phosphor —
// rather than Lucide (the "default" set). To switch a redesigned file over,
// change its import from 'lucide-react' to '@/components/ui/icons' and keep the
// same names: each Lucide name below is aliased to its closest Phosphor icon.
// Global weight ("bold") is set via IconContext in the dashboard layout so these
// read as boldly as the reference. Icons on not-yet-redesigned pages keep Lucide.
export {
  House as Home,
  SquaresFour as LayoutGrid,
  GraduationCap,
  SignOut as LogOut,
  GearSix as Settings2,
  ClipboardText as ClipboardList,
  CalendarDots as CalendarDays,
  Megaphone,
  UserCircle as UserRound,
  Question as HelpCircle,
  DotsThree as MoreHorizontal,
  WifiHigh as Wifi,
  WifiSlash as WifiOff,
  Check,
  Sparkle as Sparkles,
  MagicWand as Wand2,
  UsersThree as Users,
  Database,
  Clock,
  BookOpen,
  Compass,
  Trophy,
  Flag,
  CaretRight as ChevronRight,
  CaretUp as ChevronUp,
  CaretDown as ChevronDown,
  ListBullets as LayoutList,
  Target,
  Warning as AlertTriangle,
  WarningCircle as AlertCircle,
  ArrowCounterClockwise as RotateCcw,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Pulse as Activity,
  ChartBar as BarChart3,
  MagnifyingGlass as Search,
  PencilSimple as Pencil,
  Plus,
  UserPlus,
  X,
  GameController,
  PlayCircle,
} from '@phosphor-icons/react'

// Phosphor's component type, aliased to the name the redesigned code used for
// Lucide's icon type.
export type { Icon as LucideIcon } from '@phosphor-icons/react'
