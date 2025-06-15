
import { Octokit } from '@octokit/rest';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth'; 

export async function getGithubClient() {
  const session = await getServerSession(authOptions);
  
  if (!session?.accessToken) {
    console.error('GitHub access token missing from session:', session);
    throw new Error('No GitHub access token available. User might not be authenticated or token is missing.');
  }

  return new Octokit({
    auth: session.accessToken,
  });
}

export async function getUserRepositories(page = 1, perPage = 30, isPartOfLargerSync = false) {
  const octokit = await getGithubClient();
  console.log(`[GitHub Lib] Fetching user repositories for page ${page}, perPage ${perPage}, type 'all'. Part of larger sync: ${isPartOfLargerSync}`);
  
  // If not part of a larger sync, this function fetches one specific page.
  // If part of a larger sync, the calling function (/api/repositories) handles iterating pages.
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    type: 'all', 
    sort: 'updated', 
    direction: 'desc',
    page,
    per_page: perPage,
  });
  console.log(`[GitHub Lib] Fetched ${data.length} repositories from GitHub API for page ${page}.`);
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


export async function getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', page?: number, perPage?: number) {
  const octokit = await getGithubClient();
  
  // If page and perPage are not provided, use paginate to get all.
  if (page === undefined && perPage === undefined) {
    console.log(`[GitHub Lib] Fetching ALL pull requests for ${owner}/${repo} with state: ${state}`);
    const allPRs = await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state,
      sort: 'updated',
      direction: 'desc',
      per_page: 100, // Max per page for pagination
    });
    console.log(`[GitHub Lib] Fetched a total of ${allPRs.length} pull requests for ${owner}/${repo}.`);
    return allPRs;
  } else {
    // Fetch a specific page if page/perPage are provided
    console.log(`[GitHub Lib] Fetching pull requests for ${owner}/${repo}, page: ${page}, perPage: ${perPage}, state: ${state}`);
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state,
      sort: 'updated',
      direction: 'desc',
      page: page || 1, // Default to page 1 if page is undefined
      per_page: perPage || 30, // Default to 30 per page if perPage is undefined
    });
    console.log(`[GitHub Lib] Fetched ${data.length} pull requests for ${owner}/${repo} on page ${page}.`);
    return data;
  }
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
      ref, // ref can be a branch name, commit SHA, or tag name
    });

    if (typeof data === 'object' && data !== null && 'content' in data && typeof (data as any).content === 'string' && 'encoding' in data && (data as any).encoding === 'base64') {
      return Buffer.from((data as any).content, 'base64').toString('utf-8');
    }
    if (Array.isArray(data)) {
      console.warn(`[GitHub Lib] Expected file content for ${path}, but received array (directory listing). Ref: ${ref}`);
      return null;
    }
    console.warn(`[GitHub Lib] Unexpected content format for ${path}. Ref: ${ref}. Data:`, data);
    return null;

  } catch (error: any) {
    if (error.status === 404) {
      console.warn(`[GitHub Lib] File not found or inaccessible: ${path} in ${owner}/${repo} (ref: ${ref}). May be a submodule or deleted.`);
      return null;
    }
    console.error(`[GitHub Lib] Error fetching file content for ${path} in ${owner}/${repo} (ref: ${ref}):`, error.message);
    return null;
  }
}

export async function getDefaultBranch(owner: string, repo: string): Promise<string | null> {
  const octokit = await getGithubClient();
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    return data.default_branch;
  } catch (error: any) {
    console.error(`[GitHub Lib] Error fetching default branch for ${owner}/${repo}:`, error.message);
    return null;
  }
}

export async function getRepoFileTree(owner: string, repo: string, tree_sha: string) {
  const octokit = await getGithubClient();
  try {
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha,
      recursive: '1', // Get all files recursively
    });
    return data.tree; // Array of tree objects { path, mode, type, sha, size, url }
  } catch (error: any) {
    console.error(`[GitHub Lib] Error fetching repo file tree for ${owner}/${repo}, sha ${tree_sha}:`, error.message);
    return [];
  }
}
