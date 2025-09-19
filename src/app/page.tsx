export const dynamic = "force-dynamic";

import HomeClient from "./page.client";
import { fetchInitialFeed, getDefaultQueries } from "@/lib/feed";

export default async function HomePage() {
  const queries = getDefaultQueries();
  const { items, degraded } = await fetchInitialFeed(queries);

  return (
    <HomeClient
      initialFeed={items}
      initialDegraded={degraded}
      defaultQueries={queries}
    />
  );
}
