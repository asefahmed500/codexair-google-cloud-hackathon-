
# codexair: AI-Powered Code Review Intelligence Platform

**codexair** revolutionizes the code review process. By integrating generative AI, it empowers developers and teams to significantly enhance code quality, proactively identify security vulnerabilities, derive actionable insights from their codebase, and streamline overall development workflows.

## ✨ Core Features

codexair offers a comprehensive suite of tools designed to augment the capabilities of developers and teams:

### For Developers & Teams:

1.  **AI-Powered Pull Request (PR) Analysis:**
    *   Instantly analyze any open PR by clicking "**Analyze with AI**".
    *   codexair then provides a comprehensive breakdown, including:
        *   **Overall Code Quality Score:** An assessment (1-10) of the code's health.
        *   **Code Complexity Score:** Evaluation of structural intricacy.
        *   **Maintainability Evaluation:** Insights into the ease of future modifications.
        *   **Security Vulnerabilities:** Detailed list of issues, including severity levels (e.g., Critical, High) and CWE identifiers where applicable. Users can mark issues as "Resolved" and filter their visibility.
        *   **Improvement Suggestions:** Specific, actionable advice with file locations and code examples. Includes a "**Copy Fix**" button for suggestions with code examples, and users can mark suggestions as "Resolved" and filter their visibility.
        *   **Overall AI Summary:** A concise, AI-generated overview of the PR analysis highlights, with a toggle for a "**TL;DR**" bullet-point summary.
    *   Results are clearly presented on a dedicated analysis page (`/analyze/[owner]/[repo]/[prNumber]/[analysisId]`).
    *   If the admin-controlled "Emergency Policy" is active and a PR contains critical security issues, a warning banner will be displayed on the analysis page.

2.  **AI-Powered Full Repository Analysis:**
    *   Analyze the current codebase of a repository's default branch via the "**Analyze Codebase with AI**" button on the repository's PR list page.
    *   Delivers comprehensive insights (quality, complexity, security, suggestions, AI summary) for the selected source files.
        *   Security issues and suggestions can be marked as "Resolved" with visibility filters.
        *   Suggestions with code examples have a "**Copy Fix**" button.
        *   The overall AI summary offers a "**TL;DR**" toggle.
    *   *Note: The current version analyzes a limited number of source files (e.g., up to 5) from the default branch to ensure timely results. This is clearly communicated on the scan results page.*
    *   Results are viewable at `/analyze/[owner]/[repo]/scan/[scanId]`.

3.  **User Dashboard (`/dashboard`):**
    *   **Analytics Overview:** At-a-glance summary of total analyses, average code quality score, critical/high security issues found, and quality score trends.
    *   **Recent Analyses:** Quick access to recently analyzed PRs and repository scans.
    *   **Quality Trends:** Line chart visualizing average code quality scores over the past 30 days.
    *   **Top Security Issues & Improvement Suggestions:** Highlights common vulnerabilities and areas for enhancement.
    *   **Security Hotspots:** Pinpoints files with recurring critical/high-severity security issues.
    *   **Contributor Metrics:** Tracks analysis activity and quality scores by GitHub authors.
    *   **Connected Repositories:** Shows a list of the user's most recently synced GitHub repositories.
    *   **GitHub Connection Prompt:** Encourages users to link GitHub if not already done.
    *   *Dashboard updates after each PR or full repository analysis is completed and the user navigates to or refreshes the dashboard.*

4.  **Repository Management & Sync (`/analyze`):**
    *   List synced GitHub repositories with server-side pagination and search. Displays total open PRs for each repository.
    *   Search synced repositories by name, full name, or primary language.
    *   Sync repositories from GitHub (fetches most recently updated, up to ~300, and updates local DB).
    *   If the admin-controlled "Emergency Policy" is active, a warning banner will be displayed on this page.

5.  **Semantic Code Search (AI-Powered) (`/search` & Contextual):**
    *   **Intelligent Querying:** User's natural language query or code snippet is transformed into a vector embedding by an AI model (`text-embedding-004`).
    *   **Smart Data Indexing:** During PR and full repository analysis, code files are also converted into vector embeddings by the same AI model. These embeddings are stored to capture semantic meaning.
    *   **Vector Search:** MongoDB Atlas Vector Search compares the query embedding against stored file embeddings to find semantically similar code, going beyond simple keyword matching.
    *   **General Search Page (`/search`):** "**Run Semantic Search**" for free-form semantic exploration across all indexed PR analyses and repository scans.
    *   **Contextual Search:** From PR analysis or repository scan pages, click "**Find similar past issues/patterns**" to discover semantically related occurrences for a specific issue or suggestion.

6.  **Pull Request Comparison Tool (`/analyze/[owner]/[repo]/compare/[pr1]/vs/[pr2]`):**
    *   Side-by-side comparison of metadata and AI analysis summaries for two pull requests from the same repository.
    *   Option to "**Analyze PR with AI**" for unanalyzed PRs directly from the comparison view.

7.  **"Explain My Code" AI Tool (`/explain`):**
    *   Paste any code snippet, optionally select language.
    *   Ask predefined or custom questions (e.g., "What does this do?", "How can this be improved?").
    *   AI provides explanations and improvement tips.

8.  **Authentication & Profile:**
    *   Secure OAuth sign-up/login (GitHub, Google). Automatic account creation.
    *   First user promoted to 'admin'.
    *   Profile page (`/profile`) to view user details.
    *   Settings page (`/settings`) to update display name.

9.  **About Page & Contact (`/about`):**
    *   Information about codexair.
    *   "Get In Touch" contact form (messages stored for admin review).

### For Administrators:

1.  **Admin Dashboard (`/admin`):**
    *   **Platform-wide Overview:** Total users, total repositories synced, total PR analyses, and **Top Time-Waster** (most impactful issue type based on AI suggestions).
    *   **Emergency Policy Toggle:** Control a platform-wide (simulated) policy to block PRs with critical vulnerabilities. Changes are audited.
    *   **Knowledge Concentration Risks (Bus Factor Alert):** Highlights repositories where a single author has a high percentage of analyzed PRs.
    *   Quick navigation to User Management, Messages, Reports, and Audit Logs.

2.  **User Management (on `/admin`):**
    *   View all registered users.
    *   Promote/demote users (admin/user).
    *   Change user account status (active/suspended).

3.  **Contact Messages (`/admin/messages`):**
    *   View and manage messages submitted through the About page contact form.

4.  **Analysis Summary Reports (`/admin/reports`):**
    *   View system-wide report summarizing all pull request analyses.
    *   "**Download Report (CSV)**" functionality.

5.  **Audit Logs (`/admin/audit`):**
    *   Track important administrative actions (user role/status changes, report fetching, emergency policy changes).

## 🛠️ Core Technologies

The platform is built with a modern, robust technology stack:

*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **UI Library:** React
*   **UI Components:** ShadCN UI
*   **Styling:** Tailwind CSS
*   **Generative AI:** Genkit (with Google AI - Gemini models, e.g., `gemini-1.5-flash-latest` for analysis, `text-embedding-004` for embeddings)
*   **Database:** MongoDB (with Mongoose ODM, includes `GlobalSettings` collection for features like Emergency Policy)
*   **Authentication:** NextAuth.js (GitHub & Google OAuth providers)
*   **Vector Search:** MongoDB Atlas Vector Search

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18+ recommended)
*   npm or yarn
*   MongoDB Atlas account (for database and vector search)
*   GitHub OAuth App credentials
*   Google OAuth App credentials
*   Google AI API Key (for Gemini models via Genkit)

### Environment Variables

Create a `.env` file in the project root and populate it with the following:

```env
# MongoDB
MONGODB_URI=your_mongodb_atlas_connection_string_with_db_name

# NextAuth
NEXTAUTH_URL=http://localhost:9002 # IMPORTANT: Use your deployed URL in production
NEXTAUTH_SECRET=your_strong_random_nextauth_secret # Generate with: openssl rand -base64 32
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret

# Google AI (Genkit)
GEMINI_API_KEY=your_google_ai_api_key # Or GOOGLE_API_KEY

# Optional: For resetting DB in non-production environments
# ALLOW_PROD_DB_RESET=false
```

**Important:** `NEXTAUTH_URL` should be your application's FQDN in production (e.g., `https://codexair.example.com`). For local development, use `http://localhost:PORT` (default port is 9002 for this app).

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/asefahmed500/codexair-google-cloud-hackathon-.git
    cd codexair
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

### Running Locally

1.  **Setup MongoDB Atlas Vector Search Indexes (CRITICAL FOR SEMANTIC SEARCH):**
    *   You **MUST** manually create **TWO** vector search indexes in your MongoDB Atlas dashboard:
        1.  **On the `analyses` collection (for PR Analyses):**
            *   **Index Name:** `idx_file_embeddings`
            *   **Field Path:** `fileAnalyses.vectorEmbedding`
            *   **Dimensions:** `768` (for `text-embedding-004`)
            *   **Similarity:** `cosine`
        2.  **On the `repositoryscans` collection (for Full Repository Scans):**
            *   **Index Name:** `idx_repo_scan_file_embeddings`
            *   **Field Path:** `fileAnalyses.vectorEmbedding`
            *   **Dimensions:** `768`
            *   **Similarity:** `cosine`
    *   *Semantic search features will not work without these indexes.*

2.  **Start the Genkit development server:**
    *   This server hosts your Genkit flows (AI logic).
    *   Open a terminal and run:
        ```bash
        npm run genkit:dev
        # or for auto-reloading on changes:
        # npm run genkit:watch
        ```
    *   Keep this terminal running. By default, it starts on port 3400.

3.  **Start the Next.js application:**
    *   Open another terminal and run:
        ```bash
        npm run dev
        ```
    *   The application will be available at `http://localhost:9002` (or the port specified in `NEXTAUTH_URL` if different).

### Database Reset (Development/Testing Only)

To completely reset your MongoDB database (collections and data):
```bash
npm run db:reset
```
You will be prompted to confirm the database name. **Use with extreme caution.**

## 🤝 Contributing

Contributions are welcome! Please follow standard Git workflow (fork, branch, PR).

## 📄 License

This project is licensed under the MIT License.

    