'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Repository } from '@/types'; // Assuming you have a Repository type

// This is a basic hook structure. You might expand this for specific GitHub operations.
export function useGitHub() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUserRepositories = useCallback(async (page = 1, limit = 10, sync = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/repositories?page=${page}&limit=${limit}&sync=${sync}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch repositories');
      }
      const data = await response.json(); // Assuming API returns { repositories: [], totalPages: number, currentPage: number }
      setRepositories(data.repositories);
      // You might want to return pagination info as well
      return data; 
    } catch (e: any) {
      setError(e);
      setRepositories([]); // Clear repositories on error
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Example: Fetch initial repositories on mount (optional)
  // useEffect(() => {
  //   fetchUserRepositories();
  // }, [fetchUserRepositories]);

  return { repositories, isLoading, error, fetchUserRepositories };
}

// You could add more functions here, e.g., for fetching PRs for a repo:
// const fetchPullRequests = useCallback(async (owner: string, repo: string) => { ... });
// return { ..., fetchPullRequests };
