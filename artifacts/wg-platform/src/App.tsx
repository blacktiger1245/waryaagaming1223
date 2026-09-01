import { useEffect, type ReactNode } from "react";
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
import TeamManagePage from "@/pages/team-manage";
import RankingsPage from "@/pages/rankings";
import NewsPage from "@/pages/news";
import NewsDetailPage from "@/pages/news-detail";
import MediaPage from "@/pages/media";
import MediaHubPage from "@/pages/media-hub";
import LivePage from "@/pages/live";
import WatchPage from "@/pages/watch";
import ComingSoonPage from "@/pages/coming-soon";
import BuyCoinsPage from "@/pages/buy-coins";
import AcademyPage from "@/pages/academy";
import PartnershipPage from "@/pages/partnership";
import MarketplacePage from "@/pages/marketplace";
import AgentMessagesPage from "@/pages/agent-messages";
import LoginPage from "@/pages/login";
import OnboardingPage from "@/pages/onboarding";
import RegisterPage from "@/pages/register";
import RegisterTeamPage from "@/pages/register-team";
import ComparePage from "@/pages/compare";
import DashboardPage from "@/pages/dashboard";
import FixturesPage from "@/pages/fixtures";
import HallOfFamePage from "@/pages/hall-of-fame";
import CommunityPage from "@/pages/community";
import SupportPage from "@/pages/support";
import SupportTicketPage from "@/pages/support-ticket";
import RefereesPage from "@/pages/referees";
import RefereeHome from "@/pages/referee";
import RefereeMatchesPage from "@/pages/referee-matches";
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
import AdminAnnouncementsPage from "@/pages/admin/announcements";
import AdminRegistrationLogsPage from "@/pages/admin/registration-logs";
import AdminSupportPage from "@/pages/admin/support";
import AdminSupportTicketPage from "@/pages/admin/support-ticket";
import AdminSupportAnalyticsPage from "@/pages/admin/support-analytics";
import AdminSupportHistoryPage from "@/pages/admin/support-history";
import AdminAdsPage from "@/pages/admin/ads";

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
        <Route path="/teams/:id/manage" component={TeamManagePage} />
        <Route path="/teams/:id" component={TeamDetailPage} />
        <Route path="/fixtures" component={FixturesPage} />
        <Route path="/rankings" component={RankingsPage} />
        <Route path="/hall-of-fame" component={HallOfFamePage} />
        <Route path="/news" component={NewsPage} />
        <Route path="/news/:id" component={NewsDetailPage} />
        <Route path="/media" component={MediaPage} />
        <Route path="/media-hub" component={MediaHubPage} />
        <Route path="/live" component={LivePage} />
        <Route path="/live/:id" component={WatchPage} />
        <Route path="/marketplace" component={MarketplacePage} />
        <Route path="/agent-messages" component={AgentMessagesPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/register-team" component={RegisterTeamPage} />
        <Route path="/compare" component={ComparePage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/community" component={CommunityPage} />
        <Route path="/support" component={SupportPage} />
        <Route path="/support/tickets/:id" component={SupportTicketPage} />
        <Route path="/referees" component={RefereesPage} />
        <Route path="/partners" component={PartnershipPage} />
        <Route path="/partnership" component={PartnershipPage} />
        <Route path="/buy-coins" component={BuyCoinsPage} />
        <Route path="/academy" component={AcademyPage} />
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
        <Route path="/admin/announcements" component={AdminAnnouncementsPage} />
        <Route path="/admin/ads" component={AdminAdsPage} />
        <Route path="/admin/registration-logs" component={AdminRegistrationLogsPage} />
        <Route path="/admin/support" component={AdminSupportPage} />
        <Route path="/admin/support/history" component={AdminSupportHistoryPage} />
        <Route path="/admin/support/analytics" component={AdminSupportAnalyticsPage} />
        <Route path="/admin/support/availability" component={AdminSupportPage} />
        <Route path="/admin/support/history" component={AdminSupportHistoryPage} />
        <Route path="/admin/support/:id" component={AdminSupportTicketPage} />
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
      {/* `*` (not `:rest*`) reliably matches multi-segment paths, so every
          nested admin route (/admin/support, /admin/support/:id,
          /admin/support/history, …) is routed into AdminRouter instead of
          falling through to the site 404. Render it both ways to stay safe. */}
      <Route path="/admin/*" component={AdminRouter} />
      <Route path="/referee" component={RefereeHome} />
      <Route path="/referee/matches" component={RefereeMatchesPage} />
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
