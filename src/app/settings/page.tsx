
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Cog, UserCircle, AtSign, Save, RefreshCw, AlertTriangle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';


const settingsSchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name cannot exceed 50 characters"),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface UserSettingsData {
  name: string | null;
  email: string | null;
  image: string | null;
}

export default function SettingsPage() {
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const router = useRouter();

  const [initialData, setInitialData] = useState<UserSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionStatus === 'unauthenticated') {
      router.replace('/auth/signin');
      return;
    }
    if (sessionStatus === 'authenticated') {
      fetchUserSettings();
    }
  }, [sessionStatus, router]);

  useEffect(() => {
    if (initialData) {
      reset({ name: initialData.name || '' });
    }
  }, [initialData, reset]);

  const fetchUserSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch settings');
      }
      const data: UserSettingsData = await response.json();
      setInitialData(data);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: SettingsFormData) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to update settings');
      }
      toast({ title: "Settings Updated", description: "Your name has been updated successfully." });
      setInitialData(prev => prev ? { ...prev, name: result.user.name } : null); // Update local state
      // Trigger session update to reflect name change in Navbar immediately
      await updateSession({ user: { ...session?.user, name: result.user.name } }); 
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sessionStatus === 'loading' || (loading && !initialData && !error)) {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container py-12 md:py-16 flex justify-center">
          <Card className="w-full max-w-2xl shadow-lg">
            <CardHeader className="pb-6 border-b">
              <Skeleton className="h-8 w-40 mb-1" />
              <Skeleton className="h-5 w-60" />
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-28 mt-6" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error && !initialData) { // Show main error if initial fetch failed
    return (
        <div className="flex flex-col min-h-screen bg-secondary/50">
            <Navbar />
            <main className="flex-1 container py-8 flex items-center justify-center">
                <Card className="text-center p-6">
                    <CardHeader><CardTitle className="text-destructive">Error Loading Settings</CardTitle></CardHeader>
                    <CardContent>
                        <p>{error}</p>
                        <Button onClick={fetchUserSettings} className="mt-4">Try Again</Button>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
  }
  
   if (!initialData) { // Fallback if initialData is still null after loading and no major error
     return (
        <div className="flex flex-col min-h-screen bg-secondary/50">
            <Navbar />
            <main className="flex-1 container py-8 flex items-center justify-center">
                <p>Loading settings...</p>
            </main>
        </div>
    );
  }


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-12 md:py-16 flex justify-center">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader className="pb-6 border-b">
            <div className="flex items-center space-x-3">
              <Cog className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-3xl font-bold font-headline text-foreground">
                  Settings
                </CardTitle>
                <CardDescription className="text-md text-muted-foreground">
                  Manage your account settings and preferences.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="pt-8 space-y-8">
              <div className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg">
                <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                  <AvatarImage src={initialData.image || undefined} alt={initialData.name || 'User'} />
                  <AvatarFallback className="text-2xl">
                    {initialData.name ? initialData.name.charAt(0).toUpperCase() : <UserCircle />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-semibold text-foreground">{initialData.name || 'User'}</p>
                  <p className="text-sm text-muted-foreground flex items-center">
                    <AtSign className="h-4 w-4 mr-1.5" /> {initialData.email || 'No email set'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-md font-medium">Display Name</Label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="name"
                      {...field}
                      placeholder="Enter your display name"
                      className="text-base"
                    />
                  )}
                />
                {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
              </div>

              {/* Placeholder for more settings */}
              <div className="space-y-2">
                <Label className="text-md font-medium">Email Address</Label>
                <Input
                  id="email"
                  value={initialData.email || ''}
                  disabled
                  className="text-base bg-input/50 cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Email address is managed by your OAuth provider and cannot be changed here.</p>
              </div>
              
              {error && ( // Display submission errors here
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Update Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button type="submit" disabled={isSubmitting || !isDirty} className="shadow-md">
                {isSubmitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" /> Save Changes
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
      <footer className="py-10 text-center text-sm text-muted-foreground border-t bg-background">
        <div className="container mx-auto">
          <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
