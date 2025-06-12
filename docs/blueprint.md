# **App Name**: CodeReviewAI

## Core Features:

- Dashboard View: Displays a dashboard summarizing recent code reviews, quality trends, and security issues. Includes interactive charts for data visualization.
- Detailed Analysis View: Presents detailed analysis results for a selected pull request, including file-by-file assessments, aggregated quality metrics, and identified security vulnerabilities.
- GitHub Authentication: Allows users to authenticate using their GitHub accounts to access repositories and initiate code reviews. Securely manages user sessions and access tokens.
- Data Persistence: Retrieves and stores code review data, user information, and analysis results in MongoDB Atlas. Enables efficient data retrieval and management for the application.
- UI Component System: Provides interactive UI components such as buttons, cards, input fields, and charts built using Radix UI and Recharts, ensuring a responsive and visually appealing user experience.
- AI-Powered Code Analysis: Analyzes code for quality, security, and maintainability using Google Cloud's Vertex AI, providing insights and suggestions for improvement. The VertexAI tool gives insight for determining performance issues, security vulnerabilities and style issues

## Style Guidelines:

- Primary color: HSL(210, 100%, 50%) converted to a deep blue (#0070F0) to instill trust and reliability in users.
- Background color: Light blue (#F0F8FF) that is slightly off-white to provide a clean, distraction-free backdrop.
- Accent color: Orange (#FFA500), analogous to blue, brightens the presentation and creates contrast
- Body and headline font: 'Inter' (sans-serif) to create a clean, modern, neutral look. 'Inter' is suitable for both headlines and body text, so no font pairing is needed.
- Lucide-React icons used to provide clear and intuitive visual cues, enhancing the overall user experience.
- Consistent use of margins and padding to create a balanced and visually appealing layout, making it easy for users to navigate the application.
- Subtle transitions and animations to provide feedback on user interactions and enhance the overall sense of responsiveness and polish.