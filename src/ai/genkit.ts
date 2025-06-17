
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Use only GEMINI_API_KEY.
const apiKey = process.env.GEMINI_API_KEY;

const googleAiPluginOptions = {
  apiKey: apiKey || undefined, // Pass undefined if no key, so plugin can use other auth methods
  apiVersion: 'v1', // Explicitly set API version to stable 'v1'
};

const googleAiPlugin = googleAI(googleAiPluginOptions);

if (!apiKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn(
    '[Genkit Setup] Neither GEMINI_API_KEY nor GOOGLE_APPLICATION_CREDENTIALS found in environment. ' +
    'Google AI features may not work unless another authentication method is configured for the environment. ' +
    'Please ensure GEMINI_API_KEY is set in your .env file.'
  );
}


export const ai = genkit({
  plugins: [googleAiPlugin],
  model: 'googleai/gemini-1.5-flash-latest', 
});

