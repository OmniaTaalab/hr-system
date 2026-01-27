'use server';
/**
 * @fileOverview A simple help chat agent.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const HelpChatInputSchema = z.object({
  query: z.string().describe("The user's question."),
});
export type HelpChatInput = z.infer<typeof HelpChatInputSchema>;

const HelpChatOutputSchema = z.object({
  response: z.string().describe("The AI's helpful response."),
});
export type HelpChatOutput = z.infer<typeof HelpChatOutputSchema>;

export async function getHelpResponse(input: HelpChatInput): Promise<HelpChatOutput> {
  return helpChatFlow(input);
}

const prompt = ai.definePrompt({
  name: 'helpChatPrompt',
  input: { schema: HelpChatInputSchema },
  output: { schema: HelpChatOutputSchema },
  prompt: `You are a helpful assistant for an HR portal. Your goal is to answer user questions about how to use the portal.
Keep your answers friendly, professional, concise, and easy to understand.
If you are asked a question you don't know the answer to, just say that you are unable to help with that request.

Here is a list of pages in the application and their purpose:
- Dashboard (/): The main landing page with key statistics.
- Employee Management (/employees): View, add, and manage employee records.
- Organization Chart (/employees-chart): A visual representation of the company's reporting structure.
- Submit Leave Request (/leave/request): A form to request time off.
- Work & Leave Summary (/leave/my-requests): An employee's personal summary of their work hours and leave requests.
- All Leave Requests (/leave/all-requests): For managers to view and manage all employee leave requests.
- TPIs (/tpi): View Teacher Performance Indicators.
- KPIs (/kpis): View employee Key Performance Indicators.
- Attendance Logs (/attendance-logs): View employee attendance records.
- Job Board (/jobs): A public page listing available job openings.
- Job Applications (/jobs/applications): For HR to review submitted job applications.
- Create Application (/applications/create): A public link for external candidates to apply for jobs.
- System Log (/system-logs): An audit trail of system events.
- Settings (/settings): Manage company-wide settings.

When a user asks for help, use this information to guide them to the correct page. Always provide the page name and the URL.

User question: {{{query}}}`,
});

const helpChatFlow = ai.defineFlow(
  {
    name: 'helpChatFlow',
    inputSchema: HelpChatInputSchema,
    outputSchema: HelpChatOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
