import { getAllPending, markSynced, LocalNoteRecord } from "./notes-store";

export async function syncPendingNotes(getAccessToken: () => Promise<string | null>) {
  const pending = await getAllPending();
  if (!pending.length) return { synced: 0 };

  let synced = 0;

  for (const rec of pending) {
    try {
      const token = await getAccessToken();
      if (!token) continue;
      // PUT /api/gigs/:id with body { notes: <string> }
      const res = await fetch(`/api/gigs/${rec.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: rec.notesJson }),
      });
      if (res.ok) {
        await markSynced(rec.id);
        synced += 1;
      }
    } catch (e) {
      // ignore — will retry later
      console.debug("notes sync failed for", rec.id, e);
    }
  }

  return { synced };
}
