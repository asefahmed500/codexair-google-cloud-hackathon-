
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Determine the API key to use: prioritize GEMINI_API_KEY, then GOOGLE_API_KEY.
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

const googleAiPlugin = apiKey
  ? googleAI({ apiKey: apiKey })
  : googleAI(); // Relies on GOOGLE_API_KEY or other auth methods if specific key isn't found under GEMINI_API_KEY

if (!apiKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn(
    '[Genkit Setup] Neither GEMINI_API_KEY, GOOGLE_API_KEY, nor GOOGLE_APPLICATION_CREDENTIALS found in environment. ' +
    'Google AI features may not work unless another authentication method is configured for the environment.'
  );
}


export const ai = genkit({
  plugins: [googleAiPlugin],
  model: 'googleai/gemini-1.5-flash-latest', 
});

