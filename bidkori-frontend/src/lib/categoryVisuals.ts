import {
  Activity,
  BookOpen,
  Camera,
  Gamepad2,
  Gem,
  Home,
  Laptop,
  Shirt,
  Smartphone,
  Watch,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type CategoryVisual = {
  icon: LucideIcon;
  color: string;
};

// Curated Lucide icon & style mapping for dynamic backend categories
export function getCategoryVisual(name: string): CategoryVisual {
  const lower = name.toLowerCase();
  if (lower.includes('smart') || lower.includes('phone')) {
    return { icon: Smartphone, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' };
  }
  if (lower.includes('laptop') || lower.includes('computer') || lower.includes('pc')) {
    return { icon: Laptop, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' };
  }
  if (lower.includes('camera')) {
    return { icon: Camera, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  }
  if (lower.includes('game') || lower.includes('gaming')) {
    return { icon: Gamepad2, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' };
  }
  if (lower.includes('watch')) {
    return { icon: Watch, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
  }
  if (lower.includes('fashion') || lower.includes('sneaker') || lower.includes('clothing')) {
    return { icon: Shirt, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
  }
  if (lower.includes('home') || lower.includes('living')) {
    return { icon: Home, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' };
  }
  if (lower.includes('book') || lower.includes('media')) {
    return { icon: BookOpen, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
  }
  if (lower.includes('collect') || lower.includes('art')) {
    return { icon: Gem, color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' };
  }
  if (lower.includes('sport')) {
    return { icon: Activity, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' };
  }
  return { icon: Zap, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
}
