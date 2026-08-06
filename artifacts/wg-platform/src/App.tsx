import { type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { BannedScreen } from "@/components/banned-screen";
import { Layout } from "@/components/layout";
import { AdminLayout } from "@/components/admin/admin-layout";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import TournamentsPage from "@/pages/tournaments";
import TournamentDetailPage from "@/pages/tournament-detail";
import PlayersPage from "@/pages/players";
import PlayerDetailPage from "@/pages/player-detail";
import PlayerHistoryPage from "@/pages/player-history";
import TeamsPage from "@/pages/teams";
import TeamDetailPage from "@/pages/team-detail";
import RankingsPage from "@/pages/rankings";
import NewsPage from "@/pages/news";
import NewsDetailPage from "@/pages/news-detail";
import MediaPage from "@/pages/media";
import LivePage from "@/pages/live";
import AcademyPage from "@/pages/academy";
import PartnersPage from "@/pages/partners";
import MarketplacePage from "@/pages/marketplace";
import LoginPage from "@/pages/login";
import OnboardingPage from "@/pages/onboarding";
import RegisterPage from "@/pages/register";
import RegisterTeamPage from "@/pages/register-team";
import ComparePage from "@/pages/compare";
import DashboardPage from "@/pages/dashboard";
import FixturesPage from "@/pages/fixtures";
import CommunityPage from "@/pages/community";
import AdminLoginPage from "@/pages/admin/login";
import AdminDashboardPage from "@/pages/admin/dashboard";
import AdminPlayersPage from "@/pages/admin/players";
import AdminTeamsPage from "@/pages/admin/teams";
import AdminTournamentsPage from "@/pages/admin/tournaments";
import AdminMatchesPage from "@/pages/admin/matches";
import AdminNewsPage from "@/pages/admin/news";
import AdminMediaPage from "@/pages/admin/media";
import AdminHallOfFamePage from "@/pages/admin/hall-of-fame";
import AdminSeasonsPage from "@/pages/admin/seasons";
import ManageAdminsPage from "@/pages/admin/manage-admins";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function SiteRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/tournaments" component={TournamentsPage} />
        <Route path="/tournaments/:id" component={TournamentDetailPage} />
        <Route path="/players" component={PlayersPage} />
        <Route path="/players/:id" component={PlayerDetailPage} />
        <Route path="/players/:id/history" component={PlayerHistoryPage} />
        <Route path="/teams" component={TeamsPage} />
        <Route path="/teams/:id" component={TeamDetailPage} />
        <Route path="/fixtures" component={FixturesPage} />
        <Route path="/rankings" component={RankingsPage} />
        <Route path="/news" component={NewsPage} />
        <Route path="/news/:id" component={NewsDetailPage} />
        <Route path="/media" component={MediaPage} />
        <Route path="/live" component={LivePage} />
        <Route path="/academy" component={AcademyPage} />
        <Route path="/partners" component={PartnersPage} />
        <Route path="/marketplace" component={MarketplacePage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/register-team" component={RegisterTeamPage} />
        <Route path="/compare" component={ComparePage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/community" component={CommunityPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AdminRouter() {
  return (
    <AdminLayout>
      <Switch>
        <Route path="/admin/login" component={AdminLoginPage} />
        <Route path="/admin" component={AdminDashboardPage} />
        <Route path="/admin/players" component={AdminPlayersPage} />
        <Route path="/admin/teams" component={AdminTeamsPage} />
        <Route path="/admin/tournaments" component={AdminTournamentsPage} />
        <Route path="/admin/matches" component={AdminMatchesPage} />
        <Route path="/admin/news" component={AdminNewsPage} />
        <Route path="/admin/media" component={AdminMediaPage} />
        <Route path="/admin/seasons" component={AdminSeasonsPage} />
        <Route path="/admin/hall-of-fame" component={AdminHallOfFamePage} />
        <Route path="/admin/manage-admins" component={ManageAdminsPage} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/admin" component={AdminRouter} />
      <Route path="/admin/:rest*" component={AdminRouter} />
      <Route>
        <SiteRouter />
      </Route>
    </Switch>
  );
}

/** Sits inside QueryClientProvider so it can call useAuth */
function BanGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.isBanned) return <BannedScreen user={user} />;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <BanGate>
            <Router />
          </BanGate>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
