"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useTransition } from "react";
import { getCareerSuggestions, type CareerSuggestionsInput, type CareerSuggestionsOutput } from "@/ai/flows/career-suggestion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, Loader2, AlertTriangle } from "lucide-react";

const careerSuggestionFormSchema = z.object({
  employeeRole: z.string().min(2, {
    message: "Role must be at least 2 characters.",
  }),
  employeeSkills: z.string().min(5, {
    message: "Skills must be at least 5 characters (e.g., 'React, Node').",
  }),
  companyNeeds: z.string().min(10, {
    message: "Company needs must be at least 10 characters.",
  }),
});

export function CareerSuggestionForm() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<CareerSuggestionsOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof careerSuggestionFormSchema>>({
    resolver: zodResolver(careerSuggestionFormSchema),
    defaultValues: {
      employeeRole: "",
      employeeSkills: "",
      companyNeeds: "",
    },
  });

  function onSubmit(values: z.infer<typeof careerSuggestionFormSchema>) {
    setError(null);
    setSuggestions(null);
    startTransition(async () => {
      try {
        const result = await getCareerSuggestions(values as CareerSuggestionsInput);
        setSuggestions(result);
      } catch (e) {
        console.error(e);
        setError("Failed to get career suggestions. Please try again.");
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch career suggestions.",
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="employeeRole"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Employee Role</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Software Engineer, Marketing Manager" {...field} />
                </FormControl>
                <FormDescription>
                  The current job title or role of the employee.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="employeeSkills"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employee Skills</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g., JavaScript, Python, Project Management, Communication"
                    className="resize-none"
                    {...field}
                    rows={3}
                  />
                </FormControl>
                <FormDescription>
                  A comma-separated list of the employee's current skills.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="companyNeeds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current Company Needs</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g., Expanding into new markets, Improving customer retention, Developing AI capabilities"
                    className="resize-none"
                    {...field}
                    rows={3}
                  />
                </FormControl>
                <FormDescription>
                  Describe the current strategic needs or goals of the company.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={isPending} className="w-full md:w-auto">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Lightbulb className="mr-2 h-4 w-4" />
                Get Suggestions
              </>
            )}
          </Button>
        </form>
      </Form>

      {isPending && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-pulse">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg font-medium">Generating career suggestions...</p>
          <p className="text-sm text-muted-foreground">This may take a few moments.</p>
        </div>
      )}

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive">
              <AlertTriangle className="mr-2 h-5 w-5" />
              An Error Occurred
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {suggestions && !error && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center">
              <Lightbulb className="mr-2 h-6 w-6 text-primary" />
              AI Career Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {suggestions.suggestions.split('\n').map((line, index) => {
                if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                  return <li key={index} className="ml-4">{line.substring(2)}</li>;
                }
                if (line.trim() === '') return null; // Skip empty lines
                return <p key={index}>{line}</p>;
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
