import {
  Baby,
  Banknote,
  Beer,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Bus,
  Car,
  CircleDollarSign,
  Coffee,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  Heart,
  HeartPulse,
  House,
  HousePlug,
  PiggyBank,
  Plane,
  Send,
  ShoppingBag,
  Smartphone,
  Tag,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const CATEGORY_ICON_OPTIONS: ReadonlyArray<{ key: string; label: string; icon: LucideIcon }> = [
  { key: 'utensils', label: 'Ăn uống', icon: Utensils },
  { key: 'coffee', label: 'Cà phê', icon: Coffee },
  { key: 'fuel', label: 'Xăng xe', icon: Fuel },
  { key: 'car', label: 'Ô tô', icon: Car },
  { key: 'bus', label: 'Di chuyển', icon: Bus },
  { key: 'house', label: 'Nhà cửa', icon: House },
  { key: 'house-plug', label: 'Điện nước', icon: HousePlug },
  { key: 'shopping-bag', label: 'Mua sắm', icon: ShoppingBag },
  { key: 'heart', label: 'Gia đình', icon: Heart },
  { key: 'baby', label: 'Con cái', icon: Baby },
  { key: 'gift', label: 'Quà tặng', icon: Gift },
  { key: 'heart-pulse', label: 'Sức khỏe', icon: HeartPulse },
  { key: 'dumbbell', label: 'Thể thao', icon: Dumbbell },
  { key: 'beer', label: 'Tụ tập', icon: Beer },
  { key: 'film', label: 'Giải trí', icon: Film },
  { key: 'gamepad-2', label: 'Game', icon: Gamepad2 },
  { key: 'plane', label: 'Du lịch', icon: Plane },
  { key: 'book-open', label: 'Học tập', icon: BookOpen },
  { key: 'smartphone', label: 'Viễn thông', icon: Smartphone },
  { key: 'bot', label: 'Công nghệ / AI', icon: BrainCircuit },
  { key: 'briefcase', label: 'Công việc', icon: Briefcase },
  { key: 'banknote', label: 'Thu nhập', icon: Banknote },
  { key: 'piggy-bank', label: 'Tiết kiệm', icon: PiggyBank },
  { key: 'circle-dollar-sign', label: 'Đầu tư', icon: CircleDollarSign },
  { key: 'send', label: 'Chuyển khoản', icon: Send },
  { key: 'zap', label: 'Tiện ích', icon: Zap },
  { key: 'tag', label: 'Khác', icon: Tag },
];

export const CATEGORY_COLOR_OPTIONS = [
  '#00B878',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F43F5E',
  '#F97316',
  '#F59E0B',
  '#14B8A6',
  '#84CC16',
  '#64748B',
] as const;

const ICON_BY_KEY: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((item) => [item.key, item.icon]),
);

const iconByCategory: Record<string, LucideIcon> = {
  'đào góp': CircleDollarSign,
  'nhà thuê': House,
  'ăn uống': Utensils,
  'xe & xăng': Fuel,
  'xe, xăng': Fuel,
  'di chuyển': Bus,
  vợ: Heart,
  'chuyển về nhà': Send,
  'thể thao': Dumbbell,
  nhậu: Beer,
  ai: BrainCircuit,
  'mua sắm': ShoppingBag,
  'giải trí': Film,
  'hóa đơn': HousePlug,
  'sức khỏe': HeartPulse,
  'giáo dục': BookOpen,
  'tiết kiệm': PiggyBank,
  'thu nhập': Banknote,
  'chưa phân loại': Tag,
  khác: Tag,
};

interface CategoryIconProps {
  name?: string;
  icon?: string | null;
  color?: string;
  className?: string;
  iconClassName?: string;
}

export function CategoryIcon({
  name = 'Khác',
  icon,
  color = '#64748B',
  className,
  iconClassName,
}: CategoryIconProps) {
  const normalizedIcon = (icon ?? '').trim().toLowerCase();
  const explicitIcon = normalizedIcon && ICON_BY_KEY[normalizedIcon] ? ICON_BY_KEY[normalizedIcon] : null;
  const normalizedName = name.trim().toLocaleLowerCase('vi');
  const matchedKey = Object.keys(iconByCategory).find((key) =>
    normalizedName.includes(key),
  );
  const Icon = explicitIcon ?? (matchedKey ? iconByCategory[matchedKey] : Tag);

  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-[14px]',
        className,
      )}
      style={{ backgroundColor: `${color}18`, color }}
      aria-hidden="true"
    >
      <Icon className={cn('size-[18px]', iconClassName)} strokeWidth={1.9} />
    </span>
  );
}
