'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import { getHelpResponse } from '@/ai/flows/help-chat-flow';
import { Avatar, AvatarFallback } from './ui/avatar';
import { cn } from '@/lib/utils';
import { Icons } from './icons';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function HelpChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new messages are added
    if (scrollAreaViewportRef.current) {
      const viewport = scrollAreaViewportRef.current;
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);
  
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        { role: 'assistant', content: "Hello! How can I help you today?" }
      ]);
    }
  }, [isOpen, messages.length]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await getHelpResponse({ query: inputValue });
      const assistantMessage: Message = { role: 'assistant', content: response.response };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error getting help response:", error);
      const errorMessage: Message = { role: 'assistant', content: "Sorry, I'm having trouble connecting. Please try again later." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        <span className="sr-only">Toggle Help Chat</span>
      </Button>

      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-80 h-96 flex flex-col shadow-2xl z-50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Help Assistant</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow overflow-hidden p-0">
            <ScrollArea className="h-full p-4" viewportRef={scrollAreaViewportRef}>
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-start gap-2 text-sm",
                      message.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role === 'assistant' && (
                        <Avatar className="h-6 w-6">
                             <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                    )}
                     <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2",
                        message.role === 'user' 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      )}
                    >
                      {message.content}
                    </div>
                     {message.role === 'user' && (
                        <Avatar className="h-6 w-6">
                            <AvatarFallback>U</AvatarFallback>
                        </Avatar>
                     )}
                  </div>
                ))}
                 {isLoading && (
                    <div className="flex items-start gap-2 text-sm justify-start">
                         <Avatar className="h-6 w-6">
                             <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <div className="bg-muted rounded-lg px-3 py-2">
                           <Loader2 className="h-4 w-4 animate-spin"/>
                        </div>
                    </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter>
            <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask a question..."
                disabled={isLoading}
              />
              <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()}>
                <Send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </>
  );
}