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

  You can only answer questions about the following topics:
  1. How to submit a leave request.
  2. How to get the link for creating an online job application.

  For submitting a leave request, the page is at '/leave/request'.
  For the online application link, the page is at '/applications/create'.

  Keep your answers short, friendly, and to the point. If the user asks about anything else, politely decline and state that you can only help with leave requests and application links.

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
