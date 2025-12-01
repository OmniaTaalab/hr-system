
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
    i18nKey: 'sidebar.employees_chart',
    href: '/employees-chart',
    iconName: 'GitBranch',
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
    i18nKey: 'sidebar.tpi',
    href: '/tpi',
    iconName: 'Trophy',
  },
  {
    i18nKey: 'sidebar.kpis',
    href: '/kpis',
    iconName: 'BarChartBig',
  },
  {
    i18nKey: 'sidebar.attendance_logs',
    href: '/attendance-logs',
    iconName: 'Logs',
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
    i18nKey: 'sidebar.system_log',
    href: '/system-logs',
    iconName: 'Eye',
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
