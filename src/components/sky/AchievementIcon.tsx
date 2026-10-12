import { Binary, Compass, Flame, GraduationCap, Infinity as InfinityIcon, Orbit, PieChart, Plus, Sparkles, Utensils, Waypoints, type LucideIcon } from 'lucide-react';
import type { ACHIEVEMENTS } from '@/lib/achievements/definitions';

type IconName = typeof ACHIEVEMENTS[number]['icon'];
const icons: Record<Exclude<IconName, 'comet'>, LucideIcon> = {
  flame: Flame,
  utensils: Utensils,
  graduation: GraduationCap,
  orbit: Orbit,
  binary: Binary,
  pie: PieChart,
  waypoints: Waypoints,
  plus: Plus,
  infinity: InfinityIcon,
  compass: Compass,
  sparkles: Sparkles,
};

export default function AchievementIcon({ icon, size = 14 }: { icon: IconName; size?: number }) {
  if (icon === 'comet') return <svg className="achievement-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true">
    <path d="m2 2 6.5 6.5M2 6l5 5M6 2l5 5" /><circle cx="11.5" cy="11.5" r="2.7" />
  </svg>;
  const Icon = icons[icon];
  return <Icon className="achievement-icon" size={size} strokeWidth={1.25} aria-hidden="true" />;
}
