
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { QualityTrendItem } from "@/types";
import { TrendingUp } from "lucide-react";

interface QualityTrendsProps {
  trends: QualityTrendItem[];
}

export default function QualityTrends({ trends }: QualityTrendsProps) {
  const chartData = trends.map(trend => ({
    date: new Date(trend.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Quality: trend.quality,
    Analyses: trend.count,
  }));
  
  return (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold font-headline">Quality Score Trends</CardTitle>
        <CardDescription>Average quality score over the last 30 days.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        {trends.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-full text-center">
            <TrendingUp className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Not enough data to display trends yet.</p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="date" 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis 
              yAxisId="left" 
              domain={[0, 10]} 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={{ stroke: 'hsl(var(--border))' }}
            />
            <Tooltip
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))', 
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
              }}
              labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 'bold' }}
              itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
            <Line 
              yAxisId="left" 
              type="monotone" 
              dataKey="Quality" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2} 
              dot={{ r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
            />
             <Line 
              yAxisId="right" 
              type="monotone" 
              dataKey="Analyses" 
              stroke="hsl(var(--accent))" 
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 4, fill: 'hsl(var(--accent))', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: 'hsl(var(--accent))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
