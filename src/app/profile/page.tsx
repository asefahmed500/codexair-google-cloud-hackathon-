
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { UserCircle, AtSign, Shield, CheckCircle, Clock, CalendarDays, Edit3 } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  status: string;
  createdAt: string; // ISO date string
}

export default function ProfilePage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionStatus === 'unauthenticated') {
      router.replace('/auth/signin');
      return;
    }
    if (sessionStatus === 'authenticated') {
      fetchUserProfile();
    }
  }, [sessionStatus, router]);

  const fetchUserProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/profile');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch profile');
      }
      const data = await response.json();
      setProfile(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sessionStatus === 'loading' || (loading && !profile && !error)) {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 flex justify-center">
          <Card className="w-full max-w-2xl shadow-lg">
            <CardHeader className="items-center text-center">
              <Skeleton className="h-24 w-24 rounded-full mb-4" />
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-5 w-64" />
            </CardHeader>
            <CardContent className="space-y-6 mt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3">
                  <Skeleton className="h-6 w-6" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
              ))}
               <Skeleton className="h-10 w-full mt-6" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error) {
    return (
        <div className="flex flex-col min-h-screen bg-secondary/50">
            <Navbar />
            <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
                <Card className="text-center p-6">
                    <CardHeader><CardTitle className="text-destructive">Error</CardTitle></CardHeader>
                    <CardContent>
                        <p>{error}</p>
                        <Button onClick={fetchUserProfile} className="mt-4">Try Again</Button>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
  }
  
  if (!profile) {
     return ( 
        <div className="flex flex-col min-h-screen bg-secondary/50">
            <Navbar />
            <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
                <p>Loading profile...</p>
            </main>
        </div>
    );
  }

  const formattedJoinedDate = profile.createdAt && !isNaN(new Date(profile.createdAt).getTime())
    ? format(new Date(profile.createdAt), 'PPP')
    : 'Date not available';

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 flex justify-center">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader className="items-center text-center border-b pb-6">
            <Avatar className="w-24 h-24 mb-4 ring-4 ring-primary/20 shadow-md">
              <AvatarImage src={profile.image || undefined} alt={profile.name || 'User'} />
              <AvatarFallback className="text-3xl">
                {profile.name ? profile.name.charAt(0).toUpperCase() : <UserCircle />}
              </AvatarFallback>
            </Avatar>
            <CardTitle className="text-2xl sm:text-3xl font-bold font-headline text-foreground">
              {profile.name || 'User Profile'}
            </CardTitle>
            <CardDescription className="text-md text-muted-foreground">
              View and manage your profile information.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <InfoItem icon={<AtSign />} label="Email" value={profile.email || 'Not set'} />
            <InfoItem icon={<Shield />} label="Role" value={profile.role} badgeVariant={profile.role.toLowerCase() === 'admin' ? 'default' : 'secondary'} />
            <InfoItem icon={profile.status === 'active' ? <CheckCircle className="text-green-500" /> : <Clock className="text-amber-500" />} label="Status" value={profile.status} badgeVariant={profile.status === 'active' ? 'outline' : 'destructive'} />
            <InfoItem icon={<CalendarDays />} label="Joined" value={formattedJoinedDate} />
            
            <Button asChild variant="outline" className="w-full mt-8 shadow-sm hover:shadow-md transition-shadow">
              <Link href="/settings">
                <Edit3 className="mr-2 h-4 w-4" /> Edit Profile & Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
      <footer className="py-10 text-center text-sm text-muted-foreground border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline" | null | undefined;
}

function InfoItem({ icon, label, value, badgeVariant }: InfoItemProps) {
  return (
    <div className="flex items-center space-x-3 p-3 bg-muted/30 rounded-md">
      <span className="text-primary">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {badgeVariant ? (
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${
            badgeVariant === 'default' ? 'bg-primary text-primary-foreground' :
            badgeVariant === 'secondary' ? 'bg-secondary text-secondary-foreground' :
            badgeVariant === 'destructive' ? 'bg-destructive text-destructive-foreground' :
            badgeVariant === 'outline' ? 'text-foreground border border-border' : ''
          }`}>
            {value}
          </span>
        ) : (
          <p className="text-md font-semibold text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}
