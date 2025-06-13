
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, BarChart2, ShieldCheck, AlertOctagon, Activity } from "lucide-react";
import type { DashboardOverview } from "@/types";

interface AnalyticsOverviewProps {
  overview: DashboardOverview;
}

export default function AnalyticsOverview({ overview }: AnalyticsOverviewProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold font-headline">Analytics Overview</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Analyses"
          value={overview.totalAnalyses}
          Icon={BarChart2}
          trend={overview.trendsUp ? <TrendingUp className="h-5 w-5 text-green-500" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
          trendText="vs last month"
        />
        <MetricCard
          title="Avg. Quality Score"
          value={overview.avgQualityScore.toFixed(1)}
          Icon={Activity}
          unit="/ 10"
        />
        <MetricCard
          title="Critical/High Security Issues"
          value={overview.securityIssuesCount}
          Icon={AlertOctagon}
          className={overview.securityIssuesCount > 0 ? "text-destructive" : "text-green-600"}
        />
        <MetricCard
          title="Quality Trend"
          value={overview.trendsUp ? "Improving" : "Needs Attention"}
          Icon={overview.trendsUp ? TrendingUp : TrendingDown}
          className={overview.trendsUp ? "text-green-600" : "text-amber-600"}
        />
      </CardContent>
    </Card>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  Icon: React.ElementType;
  unit?: string;
  trend?: React.ReactNode;
  trendText?: string;
  className?: string;
}

function MetricCard({ title, value, Icon, unit, trend, trendText, className }: MetricCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-accent" />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${className || 'text-foreground'}`}>
          {value}
          {unit && <span className="text-sm text-muted-foreground ml-1">{unit}</span>}
        </div>
        {trend && trendText && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {trend} {trendText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

