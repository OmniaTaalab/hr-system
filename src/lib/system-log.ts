
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
        const cleanDetails: Record<string, any> = {};
        for (const [key, val] of Object.entries(details)) {
            if (val !== undefined) {
                cleanDetails[key] = val;
            }
        }
        await addDoc(collection(db, "system_logs"), {
            action,
            timestamp: serverTimestamp(),
            ...cleanDetails,
        });
    } catch (error) {
        console.error("Failed to log system event:", error);
        // We typically don't want to throw here as logging failure
        // should not block the primary user action.
    }
}
