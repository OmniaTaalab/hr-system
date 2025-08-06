
export interface NavItem {
  i18nKey: string;
  href: string;
  iconName: string; 
  disabled?: boolean;
}

export const navItems: NavItem[] = [
  {
    i18nKey: 'sidebar.dashboard',
    href: '/',
    iconName: 'LayoutDashboard',
  },
  {
    i18nKey: 'sidebar.employee_management', 
    href: '/employees',
    iconName: 'Users',
  },
  {
    i18nKey: 'sidebar.users',
    href: '/users',
    iconName: 'UserCog',
  },
  {
    i18nKey: 'sidebar.submit_leave_request',
    href: '/leave/request',
    iconName: 'CalendarPlus',
  },
  {
    i18nKey: 'sidebar.employee_work_leave_summary', 
    href: '/leave/my-requests',
    iconName: 'ClipboardList', 
  },
  {
    i18nKey: 'sidebar.all_leave_requests',
    href: '/leave/all-requests',
    iconName: 'ListChecks', 
  },
  {
    i18nKey: 'sidebar.payroll_calculation',
    href: '/payroll',
    iconName: 'Calculator',
  },
  {
    i18nKey: 'sidebar.annual_payroll_report',
    href: '/reports/annual-payroll',
    iconName: 'Sheet',
  },
  {
    i18nKey: 'sidebar.tpi',
    href: '/tpi',
    iconName: 'Trophy',
  },
  {
    i18nKey: 'sidebar.attendance_log',
    href: '/omnia',
    iconName: 'BookOpenCheck',
  },
  {
    i18nKey: 'sidebar.job_board',
    href: '/jobs',
    iconName: 'Briefcase',
  },
   {
    i18nKey: 'sidebar.job_applications',
    href: '/jobs/applications',
    iconName: 'FileText',
  },
  {
    i18nKey: 'sidebar.career_advisor',
    href: '/career-advisor',
    iconName: 'Lightbulb',
  },
  {
    i18nKey: 'sidebar.settings',
    href: '/settings',
    iconName: 'Settings',
  },
];

export const siteConfig = {
  name: "HR Assistant",
  description: "A modern Human Resource Management System.",
  navItems,
};

export type SiteConfig = typeof siteConfig;
