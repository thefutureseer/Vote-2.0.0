import { Link } from "wouter";
import { Activity, LogIn, LogOut, User } from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";

function AuthControl() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (!isLoaded) {
    return <div className="h-9 w-24 rounded-md bg-muted/50 animate-pulse" />;
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <div
          className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full"
          data-testid="text-signed-in-user"
        >
          <User className="w-3.5 h-3.5" />
          <span className="max-w-[120px] truncate">
            {user?.firstName || user?.primaryEmailAddress?.emailAddress || "Voter"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="text-muted-foreground hover:text-destructive"
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-1.5" />
          Log out
        </Button>
      </div>
    );
  }

  return (
    <Link href="/sign-in">
      <Button size="sm" className="font-semibold shadow-md shadow-primary/20" data-testid="button-login">
        <LogIn className="w-4 h-4 mr-1.5" />
        Sign in
      </Button>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">
      <header className="border-b border-border sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="container max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 group shrink-0" data-testid="link-home">
            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">PulseVote</span>
          </Link>

          <div className="flex items-center gap-4">
            <nav>
              <Link
                href="/create"
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                data-testid="link-create"
              >
                Create Poll
              </Link>
            </nav>
            <AuthControl />
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
