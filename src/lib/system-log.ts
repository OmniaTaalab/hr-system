
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface LogDetails {
    actorId?: string;
    actorEmail?: string;
    actorRole?: string;
    [key: string]: any; 
}

export async function logSystemEvent(action: string, details: LogDetails = {}) {
    try {
        await addDoc(collection(db, "system_logs"), {
            action,
            timestamp: serverTimestamp(),
            ...details,
        });
    } catch (error) {
        console.error("Failed to log system event:", error);
        // We typically don't want to throw here as logging failure
        // should not block the primary user action.
    }
}
