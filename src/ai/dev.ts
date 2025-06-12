
import { config } from 'dotenv';
config();

import '@/ai/flows/generate-code-descriptions.ts';
import '@/ai/flows/pull-request-insights.ts';
import '@/ai/flows/code-quality-analysis.ts';
import '@/ai/flows/explain-code-flow.ts'; // Added new flow
// It's good practice to also "import" tool files if they define tools that need to be registered
// although Genkit usually discovers them if they are used by a flow.
// import '@/ai/tools/fetch-cve-details.ts'; // Optional: explicitly load tool definitions
