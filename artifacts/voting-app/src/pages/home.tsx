import { useListPolls, useGetPollStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, BarChart2, TrendingUp, Users } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { data: polls, isLoading: isLoadingPolls } = useListPolls();
  const { data: stats, isLoading: isLoadingStats } = useGetPollStats();

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">Live Pulse</h1>
            <p className="text-muted-foreground mt-1">Real-time sentiment. Every vote counts.</p>
          </div>
          <Link href="/create" data-testid="button-create-new">
            <Button size="lg" className="font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all">
              <Plus className="w-5 h-5 mr-2" />
              New Poll
            </Button>
          </Link>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-card/50 backdrop-blur border-primary/10 shadow-sm">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <BarChart2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Polls</p>
                <h3 className="text-2xl font-bold font-mono">
                  {isLoadingStats ? <Skeleton className="h-8 w-16" /> : stats?.totalPolls || 0}
                </h3>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-card/50 backdrop-blur border-primary/10 shadow-sm">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Votes Cast</p>
                <h3 className="text-2xl font-bold font-mono">
                  {isLoadingStats ? <Skeleton className="h-8 w-16" /> : stats?.totalVotes || 0}
                </h3>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-primary/10 shadow-sm">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl text-primary">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-muted-foreground">Most Active Poll</p>
                {isLoadingStats ? (
                   <Skeleton className="h-6 w-full mt-1" />
                ) : (
                  <Link href={`/polls/${stats?.mostVotedPoll?.id || ''}`} className="truncate block hover:text-primary transition-colors">
                    <h3 className="text-sm font-bold truncate mt-1">
                      {stats?.mostVotedPoll?.question || "No data yet"}
                    </h3>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Polls List */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Polls</h2>
          
          {isLoadingPolls ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="border-border">
                  <CardHeader>
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-4 w-1/4 mt-2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : polls?.length === 0 ? (
            <Card className="border-dashed border-border py-12 text-center bg-card/50">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <BarChart2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No polls yet</h3>
              <p className="text-muted-foreground mt-2 mb-6">Be the first to start a conversation.</p>
              <Link href="/create" data-testid="button-create-empty">
                <Button variant="outline">Create a Poll</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4">
              {polls?.map((poll) => (
                <Link key={poll.id} href={`/polls/${poll.id}`} data-testid={`link-poll-${poll.id}`}>
                  <Card className="group hover:border-primary/50 transition-colors cursor-pointer border-border overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-4">
                        <CardTitle className="text-lg group-hover:text-primary transition-colors">
                          {poll.question}
                        </CardTitle>
                        <div className="bg-muted px-2.5 py-1 rounded-full text-xs font-mono font-medium whitespace-nowrap text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          {poll.totalVotes} votes
                        </div>
                      </div>
                      <CardDescription>
                        {new Date(poll.createdAt).toLocaleDateString(undefined, { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {/* Mini preview of top 2 options */}
                        {poll.options.slice(0, 2).map((opt) => {
                          const percentage = poll.totalVotes > 0 
                            ? Math.round((opt.votes / poll.totalVotes) * 100) 
                            : 0;
                          return (
                            <div key={opt.id} className="relative h-8 bg-muted rounded-md overflow-hidden flex items-center px-3">
                              <div 
                                className="absolute left-0 top-0 bottom-0 bg-primary/10 transition-all duration-1000 ease-out"
                                style={{ width: `${percentage}%` }}
                              />
                              <div className="relative flex justify-between w-full text-sm">
                                <span className="font-medium truncate pr-4 text-foreground/80">{opt.text}</span>
                                <span className="font-mono text-muted-foreground">{percentage}%</span>
                              </div>
                            </div>
                          );
                        })}
                        {poll.options.length > 2 && (
                          <p className="text-xs text-muted-foreground mt-2 pl-1">
                            + {poll.options.length - 2} more options
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
