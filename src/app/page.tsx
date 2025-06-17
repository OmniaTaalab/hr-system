import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react"; // Keep direct import for icons used directly
import Link from "next/link";
import { iconMap } from "@/components/icon-map"; // Import the icon map

interface DashboardCardProps {
  title: string;
  description: string;
  iconName: string; // Changed from icon: React.ElementType
  href: string;
  linkText: string;
}

function DashboardCard({ title, description, iconName, href, linkText }: DashboardCardProps) {
  const IconComponent = iconMap[iconName]; // Get icon component from map
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="font-headline text-xl">{title}</CardTitle>
          {IconComponent ? <IconComponent className="h-8 w-8 text-primary" /> : <span className="h-8 w-8" /> /* Fallback */}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-end">
        <Button asChild variant="outline" className="w-full mt-auto group">
          <Link href={href}>
            {linkText}
            <ArrowRight className="ml-2 h-4 w-4 transform transition-transform group-hover:translate-x-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function HRDashboardPage() {
  const dashboardCards: DashboardCardProps[] = [
    {
      title: "Leave Management",
      description: "Submit and track leave requests.",
      iconName: "CalendarPlus",
      href: "/leave/request",
      linkText: "Request Leave",
    },
    {
      title: "Attendance Records",
      description: "View employee attendance and history.",
      iconName: "CheckCircle2",
      href: "/attendance",
      linkText: "View Attendance",
    },
    {
      title: "Job Board",
      description: "Explore current job openings.",
      iconName: "Briefcase",
      href: "/jobs",
      linkText: "See Openings",
    },
    {
      title: "AI Career Advisor",
      description: "Get personalized career development suggestions.",
      iconName: "Lightbulb",
      href: "/career-advisor",
      linkText: "Get Suggestions",
    },
     {
      title: "Employee Management",
      description: "Manage employee details and records.",
      iconName: "Users",
      href: "#", // Placeholder, not implemented
      linkText: "Manage Employees",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            HR Dashboard
          </h1>
          <p className="text-muted-foreground">
            Welcome to the Streamlined HR Assistant. Access key HR functions below.
          </p>
        </header>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {dashboardCards.map((card) => (
            <DashboardCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
