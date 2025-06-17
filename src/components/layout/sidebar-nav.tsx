
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/config/site";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Icons } from "@/components/icons";
import { siteConfig } from "@/config/site";
import { iconMap } from "@/components/icon-map"; // Import the icon map

interface SidebarNavProps {
  items: NavItem[];
}

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();

  if (!items?.length) {
    return null;
  }

  return (
    <nav className="grid items-start gap-2">
      <SidebarMenu>
        {items.map((item, index) => {
          const IconComponent = iconMap[item.iconName]; // Get icon component from map
          return (
            item.href && (
              <SidebarMenuItem key={index}>
                <Link href={item.disabled ? "/" : item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    variant="default"
                    size="default"
                    className={cn(
                      "w-full justify-start",
                      pathname === item.href
                        ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      item.disabled && "cursor-not-allowed opacity-80"
                    )}
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    {IconComponent ? <IconComponent className="mr-2 h-4 w-4" /> : <span className="mr-2 h-4 w-4" /> /* Fallback or empty span */}
                    <span className="truncate">{item.title}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            )
          );
        })}
      </SidebarMenu>
    </nav>
  );
}

export function AppLogo() {
  return (
    <Link href="/" className="flex items-center space-x-2 px-2 py-4" aria-label={siteConfig.name}>
      <Icons.Logo className="h-8 w-8 text-sidebar-foreground" /> {/* Changed h-6 w-6 to h-8 w-8 */}
      <span className="font-headline text-lg font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
        {siteConfig.name}
      </span>
    </Link>
  );
}
