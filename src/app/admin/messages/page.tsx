
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, Mail, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'; // Mail for messages
import type { ContactMessage } from '@/types';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const ITEMS_PER_PAGE = 10;

export default function AdminMessagesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMessages, setTotalMessages] = useState(0);

  const fetchMessages = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/messages?page=${page}&limit=${ITEMS_PER_PAGE}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch messages');
      }
      const data = await response.json();
      setMessages(data.messages || []);
      setCurrentPage(data.currentPage || 1);
      setTotalPages(data.totalPages || 1);
      setTotalMessages(data.totalMessages || 0);
    } catch (err: any) {
      setError(err.message);
      setMessages([]);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session || session.user.role !== 'admin') {
      router.replace('/auth/signin');
      return;
    }
    fetchMessages(currentPage);
  }, [session, sessionStatus, router, currentPage, fetchMessages]);

  const handleToggleReadStatus = async (messageId: string, currentIsRead: boolean) => {
    try {
      const response = await fetch(`/api/admin/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: !currentIsRead }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update message status');
      }
      // Refresh messages or update local state
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg._id === messageId ? { ...msg, isRead: !currentIsRead } : msg
        )
      );
      toast({ title: "Status Updated", description: `Message marked as ${!currentIsRead ? 'read' : 'unread'}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
     try {
      const response = await fetch(`/api/admin/messages/${messageId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete message');
      }
      // Refresh messages
      fetchMessages(currentPage); 
      toast({ title: "Message Deleted", description: "The message has been permanently deleted." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (sessionStatus === 'loading' || (loading && !messages.length && !error)) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48 mb-1" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full mb-2" />
              {[...Array(ITEMS_PER_PAGE)].map((_, i) => <Skeleton key={i} className="h-12 w-full mb-1" />)}
              <div className="mt-4 flex justify-between items-center">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!session || session.user.role !== 'admin') {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
          <Card className="text-center">
            <CardHeader><CardTitle className="text-destructive">Access Denied</CardTitle></CardHeader>
            <CardContent><p>You do not have permission to view this page.</p></CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold font-headline flex items-center">
              <Mail className="mr-3 h-8 w-8 text-primary" />
              Contact Messages
            </CardTitle>
            <CardDescription>View messages submitted through the contact form.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && messages.length === 0 && <Skeleton className="h-64 w-full" />}
            {error && <p className="text-destructive text-center py-4">Error loading messages: {error}</p>}
            {!loading && messages.length === 0 && !error && (
              <p className="text-muted-foreground text-center py-10">No contact messages found.</p>
            )}
            {!loading && messages.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Message (Snippet)</TableHead>
                        <TableHead className="text-center">Read</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((msg) => (
                        <TableRow key={msg._id} className={msg.isRead ? 'opacity-70' : 'font-medium'}>
                          <TableCell>{format(new Date(msg.createdAt), 'PP')}</TableCell>
                          <TableCell>{msg.name}</TableCell>
                          <TableCell>{msg.email}</TableCell>
                          <TableCell className="max-w-xs truncate" title={msg.message}>
                            {msg.message.substring(0, 50)}{msg.message.length > 50 ? '...' : ''}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={msg.isRead}
                              onCheckedChange={() => handleToggleReadStatus(msg._id, msg.isRead)}
                              aria-label={msg.isRead ? 'Mark as unread' : 'Mark as read'}
                            />
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedMessage(msg)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/90">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will permanently delete the message from {msg.name}.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteMessage(msg._id)} className="bg-destructive hover:bg-destructive/90">
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1 || loading}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages} (Total: {totalMessages} messages)
                    </span>
                    <Button
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages || loading}
                    >
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {selectedMessage && (
          <AlertDialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
            <AlertDialogContent className="sm:max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Message from: {selectedMessage.name}</AlertDialogTitle>
                <AlertDialogDescription>
                  Email: {selectedMessage.email} <br />
                  Received: {format(new Date(selectedMessage.createdAt), 'PPpp')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ScrollArea className="max-h-[50vh] my-4">
                <p className="whitespace-pre-wrap p-4 border rounded-md bg-muted/50">{selectedMessage.message}</p>
              </ScrollArea>
              <AlertDialogFooter>
                 <Button variant="outline" onClick={() => handleToggleReadStatus(selectedMessage._id, selectedMessage.isRead)}>
                   {selectedMessage.isRead ? 'Mark as Unread' : 'Mark as Read'}
                 </Button>
                <AlertDialogCancel onClick={() => setSelectedMessage(null)}>Close</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair Admin.
        </div>
      </footer>
    </div>
  );
}
