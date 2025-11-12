
import { config } from 'dotenv';
import { resolve } from 'path';

// Load the .env file from the root of the project
config({ path: resolve(process.cwd(), '.env') });
