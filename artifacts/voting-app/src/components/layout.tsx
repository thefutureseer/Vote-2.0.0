import { Link } from "wouter";
import { Activity } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">
      <header className="border-b border-border sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="container max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">PulseVote</span>
          </Link>
          
          <nav>
            <Link 
              href="/create" 
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              data-testid="link-create"
            >
              Create Poll
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
