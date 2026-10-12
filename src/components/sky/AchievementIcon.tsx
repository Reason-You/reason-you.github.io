import { Binary, Compass, Eclipse, Flame, GraduationCap, Infinity as InfinityIcon, Orbit, PieChart, Plus, Sun, Utensils, Waypoints, type LucideIcon } from 'lucide-react';
import type { ACHIEVEMENTS } from '@/lib/achievements/definitions';

type IconName = typeof ACHIEVEMENTS[number]['icon'];
const icons: Record<IconName, LucideIcon> = {
  flame: Flame,
  utensils: Utensils,
  graduation: GraduationCap,
  orbit: Orbit,
  eclipse: Eclipse,
  binary: Binary,
  pie: PieChart,
  waypoints: Waypoints,
  plus: Plus,
  infinity: InfinityIcon,
  compass: Compass,
  sun: Sun,
};

export default function AchievementIcon({ icon, size = 14 }: { icon: IconName; size?: number }) {
  const Icon = icons[icon];
  return <Icon className="achievement-icon" size={size} strokeWidth={1.25} aria-hidden="true" />;
}
