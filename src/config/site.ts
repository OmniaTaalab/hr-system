
export interface NavItem {
  title: string;
  href: string;
  iconName: string; // Changed from icon: LucideIcon
  disabled?: boolean;
}

export const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    iconName: 'LayoutDashboard',
  },
  {
    title: 'Employee Management', 
    href: '/employees',
    iconName: 'Users',
  },
  {
    title: 'Submit Leave Request',
    href: '/leave/request',
    iconName: 'CalendarPlus',
  },
  {
    title: 'ملخص الإجازات والعمل للموظف', // Changed from 'Leave Request Details'
    href: '/leave/my-requests',
    iconName: 'ClipboardList', 
  },
  {
    title: 'All Leave Requests',
    href: '/leave/all-requests',
    iconName: 'ListChecks', 
  },
  {
    title: 'Attendance',
    href: '/attendance',
    iconName: 'CheckCircle2',
  },
  {
    title: 'Job Board',
    href: '/jobs',
    iconName: 'Briefcase',
  },
  {
    title: 'Career Advisor',
    href: '/career-advisor',
    iconName: 'Lightbulb',
  },
];

export const siteConfig = {
  name: "NIS HR System",
  description: "A modern Human Resource Management System.",
  navItems,
};

export type SiteConfig = typeof siteConfig;
