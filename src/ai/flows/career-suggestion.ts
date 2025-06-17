'use server';

/**
 * @fileOverview Personalized career development suggestions AI agent.
 *
 * - getCareerSuggestions - A function that provides career suggestions.
 * - CareerSuggestionsInput - The input type for the getCareerSuggestions function.
 * - CareerSuggestionsOutput - The return type for the getCareerSuggestions function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CareerSuggestionsInputSchema = z.object({
  employeeRole: z.string().describe('The current role of the employee.'),
  employeeSkills: z
    .string()
    .describe('A comma-separated list of the employee\'s current skills.'),
  companyNeeds: z.string().describe('The current needs of the company.'),
});
export type CareerSuggestionsInput = z.infer<typeof CareerSuggestionsInputSchema>;

const CareerSuggestionsOutputSchema = z.object({
  suggestions: z
    .string()
    .describe(
      'A list of career development suggestions for the employee, tailored to their role, skills, and company needs.'
    ),
});
export type CareerSuggestionsOutput = z.infer<typeof CareerSuggestionsOutputSchema>;

export async function getCareerSuggestions(input: CareerSuggestionsInput): Promise<CareerSuggestionsOutput> {
  return careerSuggestionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'careerSuggestionsPrompt',
  input: {schema: CareerSuggestionsInputSchema},
  output: {schema: CareerSuggestionsOutputSchema},
  prompt: `You are a career development expert. Provide personalized career development suggestions for an employee based on their current role, skills, and the company's needs.

Current Role: {{{employeeRole}}}
Current Skills: {{{employeeSkills}}}
Company Needs: {{{companyNeeds}}}

Suggestions:`,
});

const careerSuggestionsFlow = ai.defineFlow(
  {
    name: 'careerSuggestionsFlow',
    inputSchema: CareerSuggestionsInputSchema,
    outputSchema: CareerSuggestionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
