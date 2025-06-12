import { Octokit } from '@octokit/rest';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth'; // Correct path to authOptions

export async function getGithubClient() {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    // This could mean the token is not in the session or the session itself is null.
    // If session is null, user is not logged in.
    // If accessToken is missing, there's an issue with session callback or token persistence.
    console.error('GitHub access token missing from session:', session);
    throw new Error('No GitHub access token available. User might not be authenticated or token is missing.');
  }

  return new Octokit({
    auth: session.accessToken,
  });
}

export async function getUserRepositories(page = 1, perPage = 30) {
  const octokit = await getGithubClient();
  
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    type: 'owner', // Fetch repositories owned by the authenticated user
    sort: 'updated',
    direction: 'desc',
    page,
    per_page: perPage,
  });

  return data;
}

export async function getRepositoryDetails(owner: string, repo: string) {
  const octokit = await getGithubClient();
  const { data } = await octokit.rest.repos.get({
    owner,
    repo,
  });
  return data;
}


export async function getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all', page = 1, perPage = 30) {
  const octokit = await getGithubClient();
  
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state,
    sort: 'updated',
    direction: 'desc',
    page,
    per_page: perPage,
  });

  return data;
}

export async function getPullRequestDetails(owner: string, repo: string, pullNumber: number) {
  const octokit = await getGithubClient();
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });
  return data;
}

export async function getPullRequestFiles(owner: string, repo: string, pullNumber: number) {
  const octokit = await getGithubClient();
  
  // Paginate to get all files if there are more than 100
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
  
  return files;
}

export async function getFileContent(owner: string, repo: string, path: string, ref?: string) {
  const octokit = await getGithubClient();
  
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    // Check if data is of type { content: string }
    if (typeof data === 'object' && data !== null && 'content' in data && typeof (data as any).content === 'string' && 'encoding' in data && (data as any).encoding === 'base64') {
      return Buffer.from((data as any).content, 'base64').toString('utf-8');
    }
    if (Array.isArray(data)) {
      // It's a directory listing, or some other format. We expect file content.
      console.warn(`Expected file content for ${path}, but received array.`);
      return null;
    }
    // Handle other cases if necessary
    console.warn(`Unexpected content format for ${path}:`, data);
    return null;

  } catch (error: any) {
    // If it's a 404, the file might be a submodule or not found, which is not necessarily an error for this function
    if (error.status === 404) {
      console.warn(`File not found or inaccessible (possibly a submodule): ${path} in ${owner}/${repo}`);
      return null;
    }
    console.error(`Error fetching file content for ${path} in ${owner}/${repo} (ref: ${ref}):`, error.message);
    return null; // Or throw, depending on desired error handling
  }
}
