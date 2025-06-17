
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { User, Repository, Analysis, RepositoryScan, connectMongoose } from '@/lib/mongodb';
import type { Suggestion } from '@/types';

interface TimeWasterDetail {
  type: string;
  estimatedHours: number;
  occurrences: number;
}

export interface AdminSummaryStats {
  totalUsers: number;
  totalRepositories: number;
  totalAnalyses: number; // Combined PR Analyses and Repo Scans
  topTimeWaster: TimeWasterDetail | null;
}

// Estimated time in minutes per suggestion type
const estimatedTimePerSuggestionType: Record<Suggestion['type'], number> = {
  style: 5,
  code_smell: 8,
  performance: 12,
  optimization: 10,
  bug: 20,
  feature: 0, // Features are not typically "time wasters"
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectMongoose();

    const totalUsers = await User.countDocuments();
    const totalRepositories = await Repository.countDocuments();
    
    // Count both PR analyses and Repository scans for total analyses
    const totalPrAnalyses = await Analysis.countDocuments();
    const totalRepoScans = await RepositoryScan.countDocuments();
    const totalAnalyses = totalPrAnalyses + totalRepoScans;

    // Calculate Top Time Waster
    const suggestionStats: { [key: string]: { occurrences: number; totalMinutes: number } } = {};

    // Aggregate suggestions from PR Analyses
    const prAnalysesWithSuggestions = await Analysis.find({ "suggestions.0": { $exists: true } }).select('suggestions').lean();
    prAnalysesWithSuggestions.forEach(analysis => {
      (analysis.suggestions || []).forEach((suggestion: Suggestion) => {
        const type = suggestion.type;
        if (!suggestionStats[type]) {
          suggestionStats[type] = { occurrences: 0, totalMinutes: 0 };
        }
        suggestionStats[type].occurrences++;
        suggestionStats[type].totalMinutes += (estimatedTimePerSuggestionType[type] || 5); // Default 5 min if type unknown
      });
    });

    // Aggregate suggestions from Repository Scans
    const repoScansWithSuggestions = await RepositoryScan.find({ "suggestions.0": { $exists: true } }).select('suggestions').lean();
    repoScansWithSuggestions.forEach(scan => {
      (scan.suggestions || []).forEach((suggestion: Suggestion) => {
        const type = suggestion.type;
        if (!suggestionStats[type]) {
          suggestionStats[type] = { occurrences: 0, totalMinutes: 0 };
        }
        suggestionStats[type].occurrences++;
        suggestionStats[type].totalMinutes += (estimatedTimePerSuggestionType[type] || 5);
      });
    });
    
    let topTimeWaster: TimeWasterDetail | null = null;
    if (Object.keys(suggestionStats).length > 0) {
      const sortedTimeWasters = Object.entries(suggestionStats)
        .map(([type, data]) => ({
          type: type as Suggestion['type'], // Cast to Suggestion['type']
          occurrences: data.occurrences,
          totalMinutes: data.totalMinutes,
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      if (sortedTimeWasters.length > 0 && sortedTimeWasters[0].totalMinutes > 0) {
        const topWaster = sortedTimeWasters[0];
        topTimeWaster = {
          type: topWaster.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Format for display
          estimatedHours: parseFloat((topWaster.totalMinutes / 60).toFixed(1)),
          occurrences: topWaster.occurrences,
        };
      }
    }

    const stats: AdminSummaryStats = {
      totalUsers,
      totalRepositories,
      totalAnalyses,
      topTimeWaster,
    };

    return NextResponse.json(stats);

  } catch (error: any) {
    console.error('Error fetching admin summary stats:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
    
