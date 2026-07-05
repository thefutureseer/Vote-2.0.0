import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Loader2, Share2, CheckCircle2, LogIn, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { useGetPoll, useCastVote, getGetPollQueryKey, getListPollsQueryKey, getGetPollStatsQueryKey } from "@workspace/api-client-react";
import type { Poll, PollOption } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useVoted } from "@/hooks/use-voted";
import { useGuestAuth } from "@/hooks/use-guest-auth";
import { socket } from "@/lib/socket";

export default function PollView() {
  const { pollId } = useParams<{ pollId: string }>();
  const { hasVoted, markVoted } = useVoted();
  const { isSignedIn, isLoaded: isAuthLoaded } = useUser();
  const { isGuest, guestId, signInAsGuest } = useGuestAuth();
  const canVote = isSignedIn || isGuest;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);

  // Poll fetching
  const { data: initialPoll, isLoading, error } = useGetPoll(pollId, { 
    query: { 
      enabled: !!pollId, 
      queryKey: getGetPollQueryKey(pollId) 
    } 
  });

  // Local state for real-time updates
  const [livePoll, setLivePoll] = useState<Poll | null>(null);

  // Sync initial fetch to local state
  useEffect(() => {
    if (initialPoll) {
      setLivePoll(initialPoll);
    }
  }, [initialPoll]);

  // Socket.io integration
  useEffect(() => {
    if (!pollId) return;

    socket.emit("join_poll", pollId);

    const handleVoteUpdate = ({ pollId: updatedPollId, options, totalVotes }: any) => {
      if (updatedPollId === pollId) {
        setLivePoll((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            options,
            totalVotes: totalVotes || prev.totalVotes
          };
        });
      }
    };

    socket.on("vote_update", handleVoteUpdate);

    return () => {
      socket.emit("leave_poll", pollId);
      socket.off("vote_update", handleVoteUpdate);
    };
  }, [pollId]);

  const castVote = useCastVote(
    !isSignedIn && guestId
      ? { request: { headers: { "X-Demo-User-Id": guestId } } }
      : undefined,
  );

  const handleVote = () => {
    if (!selectedOption) {
      toast({
        title: "Please select an option",
        variant: "destructive"
      });
      return;
    }

    castVote.mutate(
      { pollId, data: { optionId: selectedOption } },
      {
        onSuccess: () => {
          markVoted(pollId);
          toast({
            title: "Vote cast successfully!",
            description: "Thanks for participating."
          });
          // Invalidate list/stats behind the scenes
          queryClient.invalidateQueries({ queryKey: getListPollsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPollStatsQueryKey() });
        },
        onError: (err: any) => {
          // 403 = server-side anti-cheat (hashed voter-ID check) already
          // recorded a vote from this account (e.g. on another device) —
          // treat it like a completed vote.
          if (err?.status === 403) {
            markVoted(pollId);
            toast({
              title: "Already voted",
              description: "This account has already voted on this poll.",
            });
            return;
          }
          if (err?.status === 429) {
            toast({
              title: "Slow down",
              description: "Too many vote attempts. Please wait a moment and try again.",
              variant: "destructive"
            });
            return;
          }
          toast({
            title: "Error",
            description: "Failed to cast vote. Please try again.",
            variant: "destructive"
          });
        }
      }
    );
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    toast({ title: "Link copied to clipboard!" });
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (isLoading || (!livePoll && !error)) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-4 w-24" />
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/4" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (error || !livePoll) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center py-20">
          <h2 className="text-2xl font-bold text-destructive mb-2">Poll not found</h2>
          <p className="text-muted-foreground mb-6">This poll may have been deleted or doesn't exist.</p>
          <Link href="/">
            <Button>Return Home</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const userHasVoted = hasVoted(pollId);

  // Sort options by votes if in results view, keep original order if voting
  const displayOptions = userHasVoted 
    ? [...livePoll.options].sort((a, b) => b.votes - a.votes)
    : livePoll.options;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to polls
        </Link>

        <Card className="border-border shadow-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="bg-muted/20 pb-8 border-b border-border/50">
            <div className="flex justify-between items-start gap-4">
              <CardTitle className="text-3xl leading-tight font-bold">{livePoll.question}</CardTitle>
            </div>
            <CardDescription className="flex items-center gap-2 mt-4 text-sm font-mono">
              <span className="bg-primary/10 text-primary px-2 py-1 rounded-md font-semibold">
                {livePoll.totalVotes} votes total
              </span>
              <span className="text-muted-foreground/60">•</span>
              <span className="text-muted-foreground">
                {new Date(livePoll.createdAt).toLocaleDateString(undefined, { 
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </span>
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-8">
            {!userHasVoted ? (
              // VOTING VIEW
              <div className="space-y-6">
                <RadioGroup value={selectedOption} onValueChange={setSelectedOption} className="space-y-3">
                  {displayOptions.map((option) => (
                    <div 
                      key={option.id}
                      className={`flex items-center space-x-3 space-y-0 rounded-lg border p-4 transition-all duration-200 cursor-pointer ${
                        selectedOption === option.id 
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md shadow-primary/10 scale-[1.01]' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50 hover:scale-[1.005] active:scale-[0.995]'
                      }`}
                      onClick={() => setSelectedOption(option.id)}
                      data-testid={`option-${option.id}`}
                    >
                      <RadioGroupItem value={option.id} id={option.id} className="mt-0.5" />
                      <Label htmlFor={option.id} className="flex-1 text-base font-medium cursor-pointer">
                        {option.text}
                      </Label>
                      {selectedOption === option.id && (
                        <CheckCircle2 className="w-5 h-5 text-primary animate-in zoom-in-50 duration-200" />
                      )}
                    </div>
                  ))}
                </RadioGroup>

                {isAuthLoaded && !canVote ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 text-center text-sm text-muted-foreground">
                      Sign in to cast your vote — one vote per account.
                    </div>
                    <Link href="/sign-in">
                      <Button className="w-full h-12 text-lg font-semibold shadow-lg shadow-primary/20" data-testid="button-signin-to-vote">
                        <LogIn className="w-5 h-5 mr-2" />
                        Sign in to Vote
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full h-11 border-white/10 hover:bg-white/5"
                      onClick={() => signInAsGuest()}
                      data-testid="button-vote-as-guest"
                    >
                      <UserRound className="w-4 h-4 mr-2" />
                      Explore as Demo User
                    </Button>
                  </div>
                ) : (
                  <Button 
                    className="w-full h-12 text-lg font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40 disabled:hover:shadow-primary/20" 
                    onClick={handleVote}
                    disabled={!selectedOption || castVote.isPending}
                    data-testid="button-cast-vote"
                  >
                    {castVote.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Cast Vote"}
                  </Button>
                )}
              </div>
            ) : (
              // RESULTS VIEW
              <div className="space-y-4">
                <div className="flex items-center justify-center mb-6 text-primary gap-2 bg-primary/10 py-2 rounded-lg font-medium">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                  </span>
                  Live Results
                </div>
                
                <div className="space-y-4">
                  {displayOptions.map((option, index) => {
                    const percentage = livePoll.totalVotes > 0 
                      ? Math.round((option.votes / livePoll.totalVotes) * 100) 
                      : 0;
                    
                    const isWinner = index === 0 && option.votes > 0;
                    const isMyVote = option.id === selectedOption;
                    
                    return (
                      <div key={option.id} className="relative group">
                        <div className="flex justify-between items-end mb-2 relative z-10 px-1">
                          <span className={`font-semibold flex items-center gap-1.5 ${isWinner ? 'text-primary text-lg' : 'text-foreground'}`}>
                            {option.text}
                            {isMyVote && (
                              <CheckCircle2 className="w-4 h-4 text-primary" data-testid={`icon-your-vote-${option.id}`} />
                            )}
                            {isWinner && <span className="ml-1 text-xs font-bold uppercase tracking-wider text-primary/70">Leading</span>}
                          </span>
                          <div className="flex items-baseline gap-3">
                            <span className="text-sm font-mono text-muted-foreground">{option.votes} votes</span>
                            <span className={`font-mono font-bold w-12 text-right ${isWinner ? 'text-primary' : 'text-foreground'}`}>
                              {percentage}%
                            </span>
                          </div>
                        </div>
                        <div className="h-4 w-full bg-muted/50 rounded-full overflow-hidden border border-border/50">
                          <div 
                            className={`h-full rounded-full transition-[width] duration-1000 ease-out ${
                              isWinner 
                                ? 'bg-primary shadow-[0_0_10px_rgba(0,180,216,0.5)]' 
                                : isMyVote
                                ? 'bg-primary/70'
                                : 'bg-primary/40'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-muted/10 border-t border-border/50 flex justify-between p-4 mt-6">
            <Button variant="ghost" size="sm" onClick={handleCopyLink} className="text-muted-foreground">
              {isCopied ? <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" /> : <Share2 className="w-4 h-4 mr-2" />}
              {isCopied ? "Copied!" : "Share Poll"}
            </Button>
            {userHasVoted && (
              <div className="text-sm text-muted-foreground flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Vote recorded
              </div>
            )}
          </CardFooter>
        </Card>
      </div>
    </Layout>
  );
}
