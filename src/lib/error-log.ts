
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

/**
 * @fileOverview Utility to log system-wide errors to Firestore.
 */

export interface ErrorLogDetails {
    message: string;
    stack?: string | null;
    componentName?: string;
    actionName?: string;
    userId?: string;
    userEmail?: string;
    context?: any;
}

/**
 * Logs an error to the 'system_errors' collection.
 * @param error The error object or message.
 * @param details Additional context about where the error occurred.
 */
export async function logSystemError(error: any, details: Partial<ErrorLogDetails> = {}) {
    try {
        const errorData = {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null,
            timestamp: serverTimestamp(),
            ...details,
        };

        await addDoc(collection(db, "system_errors"), errorData);
    } catch (e) {
        // Fallback to console if Firestore logging fails
        console.error("Failed to log error to Firestore:", e);
        console.error("Original error:", error);
    }
}
