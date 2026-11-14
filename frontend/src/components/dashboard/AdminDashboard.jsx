// Frontend: the admin's own dashboard. The admin runs the installation and
// reads no catalogue (its role holds no media_type.* key, and every
// catalogue read answers it 401), so this page fetches no list at all. It
// shows what waits for the admin, the latest pipeline runs, and the
// announcements, editable with manage.announcements. Each part asks its own
// permission, so a role edited on /roles keeps only the parts it may read.
import { endpoints } from "../../api/endpoints";
import { useAuth } from "../../contexts/AuthContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import AnnouncementBoard from "../info/AnnouncementBoard";
import AnnouncementEditor, { ANNOUNCEMENTS_QUERY_KEY } from "./AnnouncementEditor";
import DashboardSummary from "./DashboardSummary";
import DivisionHeader from "./DivisionHeader";
import RecentPipelineRuns from "./RecentPipelineRuns";

export default function AdminDashboard() {
  const { has } = useAuth();
  const announcementQuery = useApiQuery(
    ANNOUNCEMENTS_QUERY_KEY,
    endpoints.announcements.list(),
  );
  const announcements = announcementQuery.data || [];
  const canManageAnnouncements = has("manage.announcements");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">
      <div id="admin-overview">
        <DivisionHeader eyebrow="Administration" title="Overview" />
        <div className="pt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {has("manage.requests") && <DashboardSummary alwaysShow />}
          {has("manage.pipelines") && <RecentPipelineRuns />}
        </div>
      </div>

      <div id="announcements">
        <DivisionHeader
          eyebrow="Pinned to the top of the dashboard"
          title={<>Announcements &amp; notes</>}
          count={`${announcements.length} posted`}
        />
        <AnnouncementBoard announcements={announcements} />
        {canManageAnnouncements && (
          <div className="pt-6">
            <AnnouncementEditor announcements={announcements} />
          </div>
        )}
      </div>
    </div>
  );
}
