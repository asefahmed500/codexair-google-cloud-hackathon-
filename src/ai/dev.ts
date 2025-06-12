import { config } from 'dotenv';
config();

import '@/ai/flows/generate-code-descriptions.ts';
import '@/ai/flows/pull-request-insights.ts';
import '@/ai/flows/code-quality-analysis.ts';