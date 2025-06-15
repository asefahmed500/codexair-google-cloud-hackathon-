
# codexair: AI-Powered Code Review Intelligence Platform

**Elevate Your Code. AI-Powered Analysis for Superior Software Quality & Security.**

codexair is an advanced platform designed to help developers and teams enhance code quality, identify security vulnerabilities, and gain actionable insights from their codebase using the power of generative AI.

<!-- ## Live Demo
[Link to your live demo here, if applicable] -->

## Key Features

codexair offers a comprehensive suite of features for both individual developers and administrators:

### Core User Features

*   **Seamless Authentication:**
    *   Secure sign-up and login using **GitHub** or **Google OAuth**.
    *   Automatic account creation for new users.
*   **Insightful Dashboard:**
    *   **Analytics Overview:** At-a-glance summary of total analyses, average quality score, critical security issues, and quality trends.
    *   **Recent Analyses:** Quick access to the latest code reviews.
    *   **Quality Trends:** Visualize average code quality scores over time.
    *   **Top Security Issues:** Identify the most frequent security vulnerabilities found.
    *   **Top Improvement Suggestions:** Highlight common areas for code enhancement (performance, style, etc.).
    *   **Security Hotspots:** Pinpoint files with recurring critical or high-severity security issues.
    *   **Contributor Metrics:** Track analysis activity and quality scores by contributors.
    *   **Connected Repositories:** View your recently synced GitHub repositories for quick access.
*   **Repository Management & Sync:**
    *   **List Synced Repositories:** View and manage repositories connected from GitHub.
    *   **Comprehensive Sync:** Easily fetch and update your list of repositories from GitHub, pulling a broader range of your most recently updated projects (attempts to fetch up to 10 pages of your most recent repos).
*   **Pull Request (PR) Analysis:**
    *   **PR Listing:** View pull requests for a selected repository, with their current analysis status. Fetches all PRs for a repository.
    *   **AI-Powered PR Analysis:**
        *   Initiate in-depth analysis for any open pull request.
        *   Assessment of **Code Quality**, **Complexity**, and **Maintainability**.
        *   Identification of **Security Vulnerabilities** (e.g., CWEs) with severity levels.
        *   Actionable **Improvement Suggestions** (performance, style, potential bugs, code smells).
*   **Full Repository Codebase Analysis:**
    *   Initiate an AI-powered scan of the entire current codebase of a repository (default branch).
    *   Provides similar analysis output to PR analysis (Quality, Complexity, Security, Suggestions, AI Summary) for the selected files in the repository.
    *   Useful for understanding the overall health of a repository, independent of specific PRs.
    *   *(Note: Current version analyzes a limited number of source files (e.g., up to 5) from the default branch for timely results).*
*   **Detailed Analysis View (for PRs & Full Scans):**
    *   Comprehensive breakdown of metrics for each analyzed PR or repository scan.
    *   Detailed lists of security issues and improvement suggestions with code examples and file locations.
    *   File-by-file analysis breakdown.
    *   Concise **AI Review Summary** highlighting key findings.
*   **Semantic Code Search:**
    codexair's semantic search helps you find relevant code snippets or issue resolutions based on the *meaning* of your query, not just exact keyword matches. This is powered by AI-generated vector embeddings.

    You can use semantic search in two main ways:

    *   **Contextual Search (from an Analysis):**
        *   When viewing a detailed PR analysis, you'll find "Find similar past issues" or "Find similar past patterns" links next to identified security issues or improvement suggestions.
        *   Clicking these links automatically uses the context of that specific issue or suggestion (including its title and the file it was found in) to search for semantically similar occurrences in other recently analyzed pull requests.
        *   **What to do:** Simply click the link! The system handles creating the search query for you.

    *   **General Search Page (`/search`):**
        *   This dedicated page allows you to perform a free-form semantic search across all indexed PR analyses.
        *   **What to put in the search box:**
            *   **Code Snippets:** Paste a piece of code you're trying to understand, debug, or find examples of.
                *   *Example:*
                    ```javascript
                    function handleRequest(url) {
                      if (!isValidUrl(url)) {
                        throw new Error("Invalid URL provided");
                      }
                      // ... further processing
                    }
                    ```
            *   **Natural Language Descriptions of Problems/Patterns:** Describe an issue you're facing or a code pattern you're looking for.
                *   *Example:* "How to securely handle file uploads in Node.js to prevent path traversal."
                *   *Example:* "Examples of React custom hooks for managing form state with validation."
                *   *Example:* "Common off-by-one errors in loop conditions when processing arrays."
            *   **Error Messages (or parts of them):** If you have a cryptic error message, you can paste it in to see if similar errors and their contexts have been seen before.
                *   *Example:* "TypeError: Cannot read property 'data' of undefined when fetching user profile"

    *   **How it works:** The text you enter is converted into a vector embedding. This embedding is then compared against the embeddings of all analyzed files from past pull requests. The results will show you files (and the PRs they belong to) that are most semantically similar to your query, along with the AI insights for those files.

    **Tips for Effective Semantic Search:**
    *   **Be specific but not overly verbose.** A concise code snippet or a clear description of a problem works best.
    *   **For code snippets, include enough context** for the AI to understand its purpose (e.g., a function, a class, or a significant block).
    *   **For natural language, use clear terms** that describe the core of what you're looking for or the problem you're encountering.
*   **Pull Request Comparison:**
    *   Side-by-side comparison of two pull requests from the same repository, including their metadata and (if available) their full analysis summaries.
    *   Option to initiate analysis for unanalyzed PRs directly from the comparison view.
*   **"Explain My Code" AI Tool:**
    *   Paste any code snippet and select a language (optional).
    *   Choose from predefined questions (e.g., "What does this do?", "Security risks?") or ask your own custom question to get an AI-generated explanation.

### Admin Features

*   **Admin Dashboard:**
    *   Platform-wide overview statistics (total users, total repositories, total analyses).
*   **User Management:**
    *   View all registered users.
    *   Change user roles (promote to admin, demote to user).
    *   Manage user account status (active, suspended).
    *   Robust safeguards to prevent accidental admin lockout.
*   **Analysis Summary Reports:**
    *   Generate system-wide reports summarizing all pull request analyses.
    *   Download reports as a **CSV file** for external use.
*   **Audit Logs:**
    *   Track important administrative actions performed on the platform.

## Tech Stack

*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **UI Library:** React
*   **UI Components:** ShadCN UI
*   **Styling:** Tailwind CSS
*   **Generative AI:** Genkit (with Google AI - Gemini models, e.g., `gemini-1.5-flash-latest`, `text-embedding-004`)
    *   Used for code analysis, explanation, insights, and text embeddings.
*   **Database:** MongoDB (with Mongoose ODM)
*   **Authentication:** NextAuth.js (GitHub & Google OAuth providers)
*   **Vector Search:** MongoDB Atlas Vector Search (for semantic code similarity)

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
        *   `MONGODB_URI`: Your MongoDB connection string (e.g., from MongoDB Atlas or a local instance). *This is essential for the app to run.*
        *   `NEXTAUTH_URL`: The URL where your app will run locally (e.g., `http://localhost:9002` if you use the default port in `package.json`).
        *   `NEXTAUTH_SECRET`: A strong, random string for session encryption (you can generate one using `openssl rand -base64 32` in your terminal).
    *   **OAuth Credentials (Required for Login):**
        *   For GitHub login: Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. Create an OAuth App on GitHub.
        *   For Google login: Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Create OAuth 2.0 credentials in Google Cloud Console.
        *   Ensure your OAuth app callback URLs are correctly set (e.g., `http://localhost:9002/api/auth/callback/github` and `http://localhost:9002/api/auth/callback/google`).
    *   **AI Key (Required for AI features):**
        *   For AI features powered by Genkit and Google AI, set `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) with a valid Google AI (Gemini) API key. The application prioritizes `GEMINI_API_KEY` if both are set.
    *   If you don't have a `.env` file, you can copy the contents of the template provided in the root `.env` file and then fill in your values.

4.  **MongoDB Atlas Vector Search Setup (for Semantic Search):**
    *   The "Semantic Code Search" feature relies on MongoDB Atlas Vector Search.
    *   Go to your MongoDB Atlas cluster.
    *   Select your database (e.g., `codexairdb`).
    *   Go to the "Search" tab and click "Create Search Index".
    *   Choose "Atlas Vector Search" (Visual Editor or JSON).
    *   **Collection:** `analyses` (for PR analyses) and/or `repositoryscans` (for full repository scans). *Note: Current implementation in `findSimilarCode` primarily targets the `analyses` collection. Future enhancements might expand this.*
    *   **Index Name:** `idx_file_embeddings` (This name must match the one used in `src/lib/vector-search.ts`)
    *   **Configuration for `analyses` collection:**
        *   Define a field mapping for `fileAnalyses.vectorEmbedding`.
        *   **Type:** `vector`
        *   **Dimensions:** `768` (as used by `text-embedding-004`)
        *   **Similarity:** `cosine` (recommended)
    *   You might need a similar index on the `repositoryscans` collection if you intend to search within full repo scan results semantically.
    *   Refer to `src/lib/vector-search.ts` `setupVectorSearch` function's console output for guidance if needed (though it doesn't run automatically).

5.  **Run the Development Servers:**
    *   You'll need two terminal windows.
    *   **Terminal 1: Next.js Development Server**
        ```bash
        npm run dev
        ```
        This will typically start the Next.js app on `http://localhost:9002` (or the port specified in `NEXTAUTH_URL` or `package.json`).
    *   **Terminal 2: Genkit Development Server (for AI flows)**
        ```bash
        npm run genkit:dev
        ```
        This will start the Genkit development server, usually on `http://localhost:4000`. The AI flows need this server to be running for features like code analysis and explanation.

6.  **Access the Application:**
    *   Open your browser and navigate to `http://localhost:9002` (or the `NEXTAUTH_URL` you configured).
    *   The first user to sign up will automatically be promoted to an 'admin' role.

## Available Scripts

In the project directory, you can run:

*   `npm run dev`: Runs the Next.js app in development mode with Turbopack.
*   `npm run genkit:dev`: Starts the Genkit development server for AI flows.
*   `npm run genkit:watch`: Starts the Genkit development server with watch mode.
*   `npm run build`: Builds the Next.js app for production.
*   `npm run start`: Starts the Next.js production server.
*   `npm run lint`: Lints the codebase using Next.js's built-in ESLint configuration.
*   `npm run typecheck`: Performs TypeScript type checking.
*   `npm run db:reset`: Resets the MongoDB database (USE WITH CAUTION).

<!-- ## Screenshots
Consider adding screenshots here to showcase the application's UI. For example:
- Dashboard Overview
- Analysis Details Page
- Admin User Management
A short GIF demonstrating the AI analysis or code explanation feature would also be very effective.
-->

## Future Enhancements (Potential Roadmap)

*   **CI/CD Integration:** Automatically analyze pull requests on GitHub/GitLab via webhooks.
*   **Asynchronous Full Repository Scans:** Convert the full repository scan to an asynchronous background job for larger repositories and analyze more files.
*   **Enhanced Vector Search:**
    *   Include embeddings from full repository scans in semantic search.
    *   More sophisticated semantic search queries, filtering, and indexing across different analysis types (PRs, full scans).
*   **Customizable Analysis Rules:** Allow users to define custom rules or priorities for the AI analysis.
*   **Team Collaboration Features:** Notifications, shared analysis views, and discussion threads.
*   **IDE Integration:** Bring codexair insights directly into the developer's IDE.
*   **Expanded Language Support:** While Genkit is flexible, ensure robust parsing and context for more languages.

---

Thank you for checking out codexair! We hope it empowers you to build better, more secure software.
