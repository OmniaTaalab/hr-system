
import { AppLayout } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle2 } from "lucide-react";

// Mock user data
const userProfile = {
  name: "HR User",
  email: "user@example.com",
  role: "HR Manager",
  department: "Human Resources",
  joinedDate: "2023-01-15",
  avatarUrl: "https://placehold.co/100x100.png",
  bio: "Dedicated HR professional with a passion for fostering positive workplace environments and streamlining HR processes.",
};

interface ProfileDetailItemProps {
  label: string;
  value: string;
}

function ProfileDetailItem({ label, value }: ProfileDetailItemProps) {
  return (
    <div className="grid grid-cols-3 gap-2 py-3">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-foreground">{value}</dd>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center space-x-4 pb-4 border-b">
          <UserCircle2 className="h-10 w-10 text-primary flex-shrink-0" />
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
              User Profile
            </h1>
            <p className="text-muted-foreground">
              View and manage your profile information.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          <div className="md:col-span-1">
            <Card className="shadow-lg">
              <CardContent className="pt-6 flex flex-col items-center text-center">
                <Avatar className="h-24 w-24 mb-4 border-2 border-primary shadow-md">
                  <AvatarImage src={userProfile.avatarUrl} alt={userProfile.name} data-ai-hint="profile picture" />
                  <AvatarFallback>{userProfile.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <h2 className="text-xl font-semibold font-headline mt-2">{userProfile.name}</h2>
                <p className="text-sm text-primary font-medium">{userProfile.role}</p>
                <p className="mt-4 text-xs text-muted-foreground px-4 leading-relaxed">{userProfile.bio}</p>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Account Details</CardTitle>
                <CardDescription>Your personal and professional information.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border">
                  <ProfileDetailItem label="Full Name" value={userProfile.name} />
                  <ProfileDetailItem label="Email Address" value={userProfile.email} />
                  <ProfileDetailItem label="Role" value={userProfile.role} />
                  <ProfileDetailItem label="Department" value={userProfile.department} />
                  <ProfileDetailItem label="Joined Date" value={userProfile.joinedDate} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
