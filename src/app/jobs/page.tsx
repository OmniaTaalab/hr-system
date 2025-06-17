import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, MapPin, DollarSign, ArrowRight } from "lucide-react";
import Link from "next/link";

interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  salaryRange?: string;
  description: string;
  shortRequirements: string[];
}

const mockJobOpenings: JobOpening[] = [
  {
    id: "1",
    title: "Senior Software Engineer",
    department: "Technology",
    location: "Remote",
    salaryRange: "$120,000 - $160,000",
    description: "Join our innovative tech team to build next-generation HR solutions. You'll work on challenging projects using modern technologies.",
    shortRequirements: ["5+ years experience", "React, Node.js", "Cloud (AWS/Azure)"],
  },
  {
    id: "2",
    title: "HR Business Partner",
    department: "Human Resources",
    location: "New York, NY",
    description: "We are seeking an experienced HR Business Partner to support our growing teams. You will act as a strategic partner to business leaders.",
    shortRequirements: ["Strong HR generalist background", "Excellent communication", "Problem-solving skills"],
  },
  {
    id: "3",
    title: "UX/UI Designer",
    department: "Design",
    location: "San Francisco, CA (Hybrid)",
    salaryRange: "$90,000 - $110,000",
    description: "Shape the user experience of our HRMS platform. Create intuitive and visually appealing interfaces for web and mobile.",
    shortRequirements: ["Portfolio of UX/UI work", "Figma/Sketch", "User research"],
  },
  {
    id: "4",
    title: "Marketing Specialist",
    department: "Marketing",
    location: "Remote",
    description: "Drive our marketing efforts by creating engaging content, managing campaigns, and analyzing performance.",
    shortRequirements: ["Digital marketing expertise", "Content creation", "SEO/SEM knowledge"],
  },
];

export default function JobBoardPage() {
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Job Openings
          </h1>
          <p className="text-muted-foreground">
            Find your next career opportunity with us. We are always looking for talented individuals.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {mockJobOpenings.map((job) => (
            <Card key={job.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="font-headline text-xl">{job.title}</CardTitle>
                  <Briefcase className="h-6 w-6 text-primary flex-shrink-0" />
                </div>
                <CardDescription className="text-sm text-muted-foreground">{job.department}</CardDescription>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground pt-1">
                  <MapPin className="h-3 w-3" />
                  <span>{job.location}</span>
                  {job.salaryRange && (
                    <>
                      <span className="mx-1">|</span>
                      <DollarSign className="h-3 w-3" />
                      <span>{job.salaryRange}</span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm mb-3">{job.description}</p>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Key Requirements:</h4>
                <ul className="list-disc list-inside text-sm space-y-0.5">
                  {job.shortRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button asChild variant="default" className="w-full group">
                  <Link href={`/jobs/${job.id}`}> {/* Placeholder link */}
                    View Details & Apply
                    <ArrowRight className="ml-2 h-4 w-4 transform transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
