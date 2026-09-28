// Frontend: page component file for Resources - one site-wide page of notes:
// links, plain text and text with links inline, in groups that nest to any
// depth. Everyone who can open Quotes reads it; a manage.catalog holder also
// gets the controls to add, edit, delete and reorder (see ResourceTree).
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import ResourceTree from "../../components/resources/ResourceTree";
import { RESOURCES_QUERY_KEY } from "../../api/mutations/useResourceMutations";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useAuth } from "../../contexts/AuthContext";
import { endpoints } from "../../api/endpoints";

export default function Resources() {
  const { has } = useAuth();
  const canEdit = has("manage.catalog");

  const { data, isLoading, error } = useApiQuery(
    RESOURCES_QUERY_KEY,
    endpoints.resources.list(),
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header className="border-b border-border pb-4">
        <h1 className="font-display text-4xl font-semibold text-text leading-none">
          Resources
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Links and notes worth keeping, in groups
        </p>
      </header>

      {isLoading || error ? (
        <MediaLoadingState
          isLoading={isLoading}
          error={error}
          loadingText="Loading resources..."
          errorTitle="Error loading resources."
        />
      ) : (
        <ResourceTree tree={data || []} canEdit={canEdit} />
      )}
    </div>
  );
}
