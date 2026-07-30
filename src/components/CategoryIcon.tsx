import {
  Banknote,
  Beer,
  BookOpen,
  Bus,
  CircleEllipsis,
  CircleDollarSign,
  Dumbbell,
  Film,
  Fuel,
  HeartPulse,
  Heart,
  HousePlug,
  House,
  Bot,
  PiggyBank,
  Send,
  ShoppingBag,
  Utensils,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const iconByCategory = {
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
  ai: Bot,
  'mua sắm': ShoppingBag,
  'giải trí': Film,
  'hóa đơn': HousePlug,
  'sức khỏe': HeartPulse,
  'giáo dục': BookOpen,
  'tiết kiệm': PiggyBank,
  'thu nhập': Banknote,
  khác: CircleEllipsis,
} as const;

interface CategoryIconProps {
  name?: string;
  color?: string;
  className?: string;
  iconClassName?: string;
}

export function CategoryIcon({
  name = 'Khác',
  color = '#8493a3',
  className,
  iconClassName,
}: CategoryIconProps) {
  const normalizedName = name.trim().toLocaleLowerCase('vi');
  const matchedKey = Object.keys(iconByCategory).find((key) =>
    normalizedName.includes(key),
  ) as keyof typeof iconByCategory | undefined;
  const Icon = matchedKey ? iconByCategory[matchedKey] : CircleEllipsis;

  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-[14px]',
        className,
      )}
      style={{ backgroundColor: `${color}16`, color }}
      aria-hidden="true"
    >
      <Icon className={cn('size-[18px]', iconClassName)} strokeWidth={2} />
    </span>
  );
}
