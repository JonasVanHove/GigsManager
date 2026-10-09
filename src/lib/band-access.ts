export type BandAccess = {
  band: { id: string; name: string; userId: string };
  isOwner: boolean;
};

/** Resolve a band only when the account owns it or is listed in its roster. */
export async function getBandAccess(
  prismaClient: {
    bands: { findUnique: Function };
    bandMember: { findFirst: Function };
  },
  bandId: string,
  userId: string
): Promise<BandAccess | null> {
  const band = await prismaClient.bands.findUnique({
    where: { id: bandId },
    select: { id: true, name: true, userId: true },
  });
  if (!band) return null;
  if (band.userId === userId) return { band, isOwner: true };

  const membership = await prismaClient.bandMember.findFirst({
    where: { userId, bands: { has: band.name } },
    select: { id: true },
  });
  return membership ? { band, isOwner: false } : null;
}
