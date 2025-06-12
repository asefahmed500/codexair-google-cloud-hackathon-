
# codexair

This is a NextJS starter in Firebase Studio.

codexair is an AI-Powered Code Review Intelligence Platform designed to help developers and teams enhance code quality, identify security vulnerabilities, and gain actionable insights from their codebase.

## Features

*   **AI-Powered Analysis:** Leverages generative AI to review pull requests for quality, complexity, and maintainability.
*   **Security Scanning:** Identifies potential security issues and common weaknesses (CWEs).
*   **Semantic Code Search:** Find similar code patterns and past fixes using vector search.
*   **Code Explanation:** Get AI-generated explanations for code snippets.
*   **Comprehensive Dashboards:** Track trends, view recent analyses, identify hotspots, and monitor contributor metrics.
*   **Admin Panel:** Manage users, view system-wide reports, and access audit logs.
*   **GitHub & Google OAuth:** Secure authentication using familiar providers.

## Tech Stack

*   **Next.js:** React framework for building user interfaces.
*   **React:** JavaScript library for building UIs.
*   **ShadCN UI:** Re-usable UI components.
*   **Tailwind CSS:** Utility-first CSS framework.
*   **Genkit (with Google AI):** For integrating generative AI features.
*   **MongoDB:** Database for storing application data.
*   **NextAuth.js:** Authentication for Next.js applications.
*   **TypeScript:** Typed superset of JavaScript.

## Local Setup

Follow these steps to run codexair locally:

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd codexair
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Set Up Environment Variables:**
    *   This project uses an `.env` file for environment variables. The file `.env` in the root of the project contains a template with all necessary variables.
    *   **Important:** You MUST fill in the following critical variables:
        *   `MONGODB_URI`: Your MongoDB connection string.
        *   `NEXTAUTH_URL`: The URL where your app will run locally (e.g., `http://localhost:9002` if you use the default port in `package.json`).
        *   `NEXTAUTH_SECRET`: A strong, random string for session encryption (you can generate one using `openssl rand -base64 32`).
    *   **Optional OAuth Credentials:**
        *   For GitHub login, set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
        *   For Google login, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
    *   **Optional AI Key:**
        *   For AI features powered by Genkit and Google AI, set `GOOGLE_API_KEY`.
    *   If you don't have a `.env` file, you can copy the contents of the template provided in the root `.env` file and then fill in your values.

4.  **Run the Development Servers:**
    *   You'll need two terminal windows.
    *   **Terminal 1: Next.js Development Server**
        ```bash
        npm run dev
        ```
        This will typically start the Next.js app on `http://localhost:9002` (as configured in `package.json`).
    *   **Terminal 2: Genkit Development Server (for AI flows)**
        ```bash
        npm run genkit:dev
        ```
        This will start the Genkit development server, usually on `http://localhost:4000`.

5.  **Access the Application:**
    *   Open your browser and navigate to `http://localhost:9002` (or the `NEXTAUTH_URL` you configured).

## Available Scripts

In the project directory, you can run:

*   `npm run dev`: Runs the app in development mode with Turbopack.
*   `npm run genkit:dev`: Starts the Genkit development server.
*   `npm run genkit:watch`: Starts the Genkit development server with watch mode.
*   `npm run build`: Builds the app for production.
*   `npm run start`: Starts the production server.
*   `npm run lint`: Lints the codebase.
*   `npm run typecheck`: Performs TypeScript type checking.

To get started, take a look at `src/app/page.tsx`.
