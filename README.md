
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
    *   Automatic account creation for new users (first user becomes admin).
*   **Insightful Dashboard:**
    *   **Analytics Overview:** At-a-glance summary of total analyses, average quality score, critical security issues, and quality trends.
    *   **Recent Analyses:** Quick access to the latest code reviews.
    *   **Quality Trends:** Visualize average code quality scores over time.
    *   **Top Security Issues:** Identify the most frequent security vulnerabilities found.
    *   **Top Improvement Suggestions:** Highlight common areas for code enhancement.
    *   **Security Hotspots:** Pinpoint files with recurring critical or high-severity security issues.
    *   **Contributor Metrics:** Track analysis activity and quality scores by contributors.
    *   **Connected Repositories:** View your recently synced GitHub repositories for quick access.
*   **Repository Management & Sync:**
    *   **List Synced Repositories:** View and manage repositories connected from GitHub, with server-side search.
    *   **Server-Side Search:** Search synced repositories by name, full name, or primary language.
    *   **Comprehensive Sync:** Fetch and update your list of repositories from GitHub, pulling a broader range of your most recently updated projects (attempts to fetch up to 10 pages of your most recent repos) and the total count of your GitHub repositories.
*   **Pull Request (PR) Analysis:**
    *   **PR Listing:** View pull requests for a selected repository, with their current analysis status. Fetches all PRs for a repository.
    *   **AI-Powered PR Analysis:**
        *   Initiate in-depth analysis for any open pull request.
        *   Assessment of **Code Quality**, **Complexity**, and **Maintainability**.
        *   Identification of **Security Vulnerabilities** (e.g., CWEs) with severity levels.
        *   Actionable **Improvement Suggestions** (performance, style, potential bugs, code smells).
        *   Vector embeddings generated for changed/added files to power semantic search.
*   **Full Repository Codebase Analysis:**
    *   Initiate an AI-powered scan of the entire current codebase of a repository (default branch).
    *   Provides similar analysis output to PR analysis (Quality, Complexity, Security, Suggestions, AI Summary) for the selected files in the repository.
    *   Useful for understanding the overall health of a repository, independent of specific PRs.
    *   Vector embeddings generated for analyzed files to power semantic search.
    *   *(Note: Current version analyzes a limited number of source files (e.g., up to 5) from the default branch for timely results).*
*   **Detailed Analysis View (for PRs & Full Scans):**
    *   Comprehensive breakdown of metrics for each analyzed PR or repository scan.
    *   Detailed lists of security issues and improvement suggestions with code examples and file locations.
    *   File-by-file analysis breakdown.
    *   Concise **AI Review Summary** highlighting key findings.
*   **Semantic Code Search:**
    codexair's semantic search helps you find relevant code snippets or issue resolutions based on the *meaning* of your query, not just exact keyword matches. This is powered by AI-generated vector embeddings from **both PR analyses and full repository scans**.

    You can use semantic search in two main ways:

    *   **Contextual Search (from an Analysis or Scan):**
        *   When viewing a detailed PR analysis or repository scan, you'll find "Find similar past issues" or "Find similar past patterns" links next to identified security issues or improvement suggestions.
        *   Clicking these links automatically uses the context of that specific issue or suggestion (including its title and the file it was found in) to search for semantically similar occurrences in **other analyzed pull requests and full repository scans**.
        *   **What to do:** Simply click the link! The system handles creating the search query for you.

    *   **General Search Page (`/search`):**
        *   This dedicated page allows you to perform a free-form semantic search across all indexed PR analyses and full repository scans.
        *   **What to put in the search box:**
            *   **Code Snippets:** Paste a piece of code you're trying to understand, debug, or find examples of.
            *   **Natural Language Descriptions of Problems/Patterns:** Describe an issue you're facing or a code pattern you're looking for.
            *   **Error Messages (or parts of them):** If you have a cryptic error message, you can paste it in to see if similar errors and their contexts have been seen before.
        *   **How it works:** The text you enter is converted into a vector embedding. This embedding is then compared against the embeddings of all analyzed files from past pull requests and full repository scans. The results will show you files (and the PRs/scans they belong to) that are most semantically similar to your query, along with the AI insights for those files.

    **Tips for Effective Semantic Search:**
    *   Be specific but not overly verbose.
    *   For code snippets, include enough context.
    *   For natural language, use clear terms.
*   **Pull Request Comparison:**
    *   Side-by-side comparison of two pull requests from the same repository, including their metadata and (if available) their full analysis summaries.
    *   Option to initiate analysis for unanalyzed PRs directly from the comparison view.
*   **"Explain My Code" AI Tool:**
    *   Paste any code snippet and select a language (optional).
    *   Choose from predefined questions or ask your own custom question to get an AI-generated explanation.
*   **About Page & Contact:**
    *   Information about codexair.
    *   "Get In Touch" contact form for users to send messages to administrators.

### Admin Features

*   **Admin Dashboard:**
    *   Platform-wide overview statistics (total users, total repositories, total analyses).
*   **User Management:**
    *   View all registered users.
    *   Change user roles (promote to admin, demote to user).
    *   Manage user account status (active, suspended).
    *   Robust safeguards to prevent accidental admin lockout.
*   **Contact Messages Management:**
    *   View and manage messages submitted by users via the "About Us" contact form.
    *   Mark messages as read/unread and delete messages.
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
*   **Vector Search:** MongoDB Atlas Vector Search (for semantic code similarity across PRs and repository scans)

## Local Setup

Follow these steps to run codexair locally:

1.  **Clone the Repository:**
    ```bash
    git clone  https://github.com/asefahmed500/codexair-google-cloud-hackathon-.git
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
        *   `NEXTAUTH_URL`: The URL where your app will run locally (e.g., `http://localhost:9002`).
        *   `NEXTAUTH_SECRET`: A strong, random string for session encryption.
    *   **OAuth Credentials (Required for Login):**
        *   For GitHub login: Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
        *   For Google login: Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
        *   Ensure your OAuth app callback URLs are correctly set.
    *   **AI Key (Required for AI features):**
        *   Set `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) with a valid Google AI (Gemini) API key.

4.  **MongoDB Atlas Vector Search Setup (for Semantic Search):**
    *   The "Semantic Code Search" feature relies on MongoDB Atlas Vector Search.
    *   You need to create **TWO** separate vector search indexes in your MongoDB Atlas cluster:

    1.  **Index for Pull Request Analyses:**
        *   **Collection:** `analyses`
        *   **Index Name:** `idx_file_embeddings` (This name must match the one used in `src/lib/vector-search.ts`)
        *   **Configuration:**
            *   Define a field mapping for `fileAnalyses.vectorEmbedding`.
            *   **Type:** `vector`
            *   **Dimensions:** `768` (as used by `text-embedding-004`)
            *   **Similarity:** `cosine` (recommended)

    2.  **Index for Full Repository Scans:**
        *   **Collection:** `repositoryscans`
        *   **Index Name:** `idx_repo_scan_file_embeddings` (This name must match the one used in `src/lib/vector-search.ts`)
        *   **Configuration:**
            *   Define a field mapping for `fileAnalyses.vectorEmbedding`.
            *   **Type:** `vector`
            *   **Dimensions:** `768` (as used by `text-embedding-004`)
            *   **Similarity:** `cosine` (recommended)

    *   Refer to `src/lib/vector-search.ts` `setupVectorSearch` function's console output for guidance if needed (though it doesn't run automatically).

5.  **Run the Development Servers:**
    *   You'll need two terminal windows.
    *   **Terminal 1: Next.js Development Server**
        ```bash
        npm run dev
        ```
    *   **Terminal 2: Genkit Development Server (for AI flows)**
        ```bash
        npm run genkit:dev
        ```

6.  **Access the Application:**
    *   Open your browser and navigate to `http://localhost:9002` (or the `NEXTAUTH_URL` you configured).
    *   The first user to sign up will automatically be promoted to an 'admin' role.

## Available Scripts

*   `npm run dev`: Runs the Next.js app in development mode with Turbopack.
*   `npm run genkit:dev`: Starts the Genkit development server for AI flows.
*   `npm run genkit:watch`: Starts the Genkit development server with watch mode.
*   `npm run build`: Builds the Next.js app for production.
*   `npm run start`: Starts the Next.js production server.
*   `npm run lint`: Lints the codebase.
*   `npm run typecheck`: Performs TypeScript type checking.
*   `npm run db:reset`: Resets the MongoDB database (USE WITH CAUTION).

## Future Enhancements (Potential Roadmap)

*   **CI/CD Integration:** Automatically analyze pull requests on GitHub/GitLab via webhooks.
*   **Asynchronous Full Repository Scans:** Convert the full repository scan to an asynchronous background job and analyze more files.
*   **Enhanced Semantic Search:**
    *   More sophisticated semantic search queries, filtering options, and relevance tuning.
*   **Customizable Analysis Rules:** Allow users to define custom rules or priorities for the AI analysis.
*   **Team Collaboration Features:** Notifications, shared analysis views, and discussion threads.
*   **IDE Integration:** Bring codexair insights directly into the developer's IDE.
*   **Expanded Language Support:** While Genkit is flexible, ensure robust parsing and context for more languages.

---

Thank you for checking out codexair! We hope it empowers you to build better, more secure software.
