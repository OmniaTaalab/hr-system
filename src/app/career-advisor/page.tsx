import { AppLayout } from "@/components/layout/app-layout";
import { CareerSuggestionForm } from "@/components/career-suggestion-form";

export default function CareerAdvisorPage() {
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            AI Career Advisor
          </h1>
          <p className="text-muted-foreground">
            Leverage AI to get personalized career development suggestions for employees. 
            Fill in the details below to generate tailored advice.
          </p>
        </header>
        
        <CareerSuggestionForm />
      </div>
    </AppLayout>
  );
}
