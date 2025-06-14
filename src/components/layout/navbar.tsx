
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader, // Added import
  SheetTitle,  // Added import
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, GitFork, FileText, Users, Lightbulb, BookCheck, Home, Info, LayoutGrid, Cog, Shield, SearchCode, Menu } from 'lucide-react';

interface NavItemDefinition {
  key: string;
  href?: string;
  text: string;
  icon: JSX.Element;
  onClick?: (event?: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  isAnchor?: boolean;
  show: () => boolean; 
  adminOnly?: boolean;
  userOnly?: boolean; 
}

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  const handleScrollToFeatures = (e?: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (e) e.preventDefault();
    if (pathname === '/') {
      const featuresSection = document.getElementById('features');
      if (featuresSection) {
        featuresSection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      router.push('/#features');
    }
    setIsMobileMenuOpen(false);
  };

  const isAdmin = session?.user?.role === 'admin';
  const isAuthenticated = !!session;

  const navItemsDefinition: NavItemDefinition[] = [
    { key: 'home', href: '/', text: 'Home', icon: <Home className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => true },
    pathname === '/'
      ? { key: 'features-anchor', href: '#features', text: 'Features', icon: <LayoutGrid className="mr-2 h-4 w-4" />, onClick: handleScrollToFeatures, isAnchor: true, show: () => true }
      : { key: 'features-link', href: '/features', text: 'Features', icon: <LayoutGrid className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => true },
    { key: 'about', href: '/about', text: 'About Us', icon: <Info className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => true },
    { key: 'dashboard', href: '/dashboard', text: 'Dashboard', icon: <BarChartBig className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => isAuthenticated && !isAdmin, userOnly: true },
    { key: 'explain', href: '/explain', text: 'Explain Code', icon: <Lightbulb className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => isAuthenticated && !isAdmin, userOnly: true },
    { key: 'analyze', href: '/analyze', text: 'Analyze Repository', icon: <GitFork className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => isAuthenticated && !isAdmin, userOnly: true },
    { key: 'search', href: '/search', text: 'Semantic Search', icon: <SearchCode className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => isAuthenticated && !isAdmin, userOnly: true },
    // Admin specific main nav items
    { key: 'admin-dashboard', href: '/admin', text: 'Admin Panel', icon: <Shield className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => isAuthenticated && isAdmin, adminOnly: true },
    { key: 'admin-reports', href: '/admin/reports', text: 'Reports', icon: <FileText className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => isAuthenticated && isAdmin, adminOnly: true },
    { key: 'admin-audit', href: '/admin/audit', text: 'Audit Logs', icon: <BookCheck className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => isAuthenticated && isAdmin, adminOnly: true },
  ];

  const renderNavItem = (item: NavItemDefinition, isMobile: boolean) => {
    const commonProps = {
      variant: "ghost" as const,
      className: `w-full justify-start ${isMobile ? 'text-base py-3' : 'text-sm'}`, // Adjusted text size for mobile
      onClick: item.onClick as React.MouseEventHandler<HTMLButtonElement>,
    };

    const linkContent = (
      <>
        {item.icon} {item.text}
      </>
    );

    let buttonElement: JSX.Element;

    if (item.href && !item.isAnchor) {
      buttonElement = (
        <Button {...commonProps} asChild>
          <Link href={item.href}>{linkContent}</Link>
        </Button>
      );
    } else if (item.isAnchor && item.href) {
      buttonElement = (
        <Button {...commonProps} asChild>
          <a href={item.href}>{linkContent}</a>
        </Button>
      );
    } else {
       buttonElement = (
        <Button {...commonProps}>
          {linkContent}
        </Button>
      );
    }
    
    return isMobile ? <SheetClose asChild key={item.key}>{buttonElement}</SheetClose> : React.cloneElement(buttonElement, { key: item.key });
  };


  if (status === "loading") {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChartBig className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl text-foreground font-headline">codexair</span>
          </div>
          <div className="h-10 w-10 bg-muted rounded-full animate-pulse"></div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2 mr-auto">
          <BarChartBig className="h-7 w-7 text-primary" />
          <span className="font-bold text-xl text-foreground font-headline">codexair</span>
        </Link>

        <nav className="hidden md:flex items-center space-x-1">
          {navItemsDefinition.filter(item => item.show() && !item.adminOnly && !item.userOnly).map(item => renderNavItem(item, false))}
          {isAuthenticated && !isAdmin && navItemsDefinition.filter(item => item.show() && item.userOnly).map(item => renderNavItem(item, false))}
          {isAuthenticated && isAdmin && navItemsDefinition.filter(item => item.show() && item.adminOnly).map(item => renderNavItem(item, false))}
        </nav>

        <div className="flex items-center justify-end space-x-2 ml-auto md:ml-4">
          {!session ? (
            <Button onClick={() => router.push('/auth/signin')} variant="default" className="hidden md:inline-flex">
              Sign In / Sign Up
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 py-1 h-auto">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.user?.image || undefined} alt={session.user?.name || 'User'} />
                    <AvatarFallback>{session.user?.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:inline text-sm font-medium text-foreground truncate max-w-[150px]">{session.user?.name}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{session.user?.name || 'My Account'}</DropdownMenuLabel>
                {session.user?.email && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground -mt-1.5">{session.user.email}</DropdownMenuLabel>}
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={() => { router.push('/profile'); }}>
                  <UserCircle className="mr-2 h-4 w-4" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { router.push('/settings'); }}>
                  <Cog className="mr-2 h-4 w-4" /> My Settings
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 flex flex-col">
                <SheetHeader className="px-4 pt-5 pb-3 border-b">
                  <SheetTitle>
                    <SheetClose asChild>
                        <Link href="/" className="flex items-center gap-2" onClick={handleLinkClick}>
                        <BarChartBig className="h-7 w-7 text-primary" />
                        <span className="font-bold text-xl text-foreground font-headline">codexair</span>
                        </Link>
                    </SheetClose>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex-1 flex flex-col space-y-1 p-4 overflow-y-auto">
                  {navItemsDefinition.filter(item => item.show()).map(item => renderNavItem(item, true))}
                  
                  <div className="mt-auto pt-4 border-t border-border">
                    {!session ? (
                        <SheetClose asChild>
                        <Button 
                            variant="default" 
                            className="w-full text-base py-3"
                            onClick={() => { router.push('/auth/signin'); handleLinkClick(); }}
                        >
                            Sign In / Sign Up
                        </Button>
                        </SheetClose>
                    ) : (
                        <>
                        <SheetClose asChild>
                            <Button asChild variant="ghost" className="w-full justify-start text-base py-3" onClick={() => { router.push('/profile'); handleLinkClick(); }}>
                            <Link href="/profile"><UserCircle className="mr-2 h-4 w-4" /> My Profile</Link>
                            </Button>
                        </SheetClose>
                        <SheetClose asChild>
                            <Button asChild variant="ghost" className="w-full justify-start text-base py-3" onClick={() => { router.push('/settings'); handleLinkClick(); }}>
                            <Link href="/settings"><Cog className="mr-2 h-4 w-4" /> My Settings</Link>
                            </Button>
                        </SheetClose>
                        <DropdownMenuSeparator className="my-2" />
                        <SheetClose asChild>
                            <Button variant="ghost" onClick={() => { signOut({ callbackUrl: '/' }); handleLinkClick(); }} className="w-full justify-start text-base py-3">
                            <LogOut className="mr-2 h-4 w-4" /> Log out
                            </Button>
                        </SheetClose>
                        </>
                    )}
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
