import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…\n");

  // Create or get test user
  let testUser = await prisma.user.findUnique({
    where: { supabaseId: "demo-user-123" },
  });

  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        supabaseId: "demo-user-123",
        email: "demo@gigmanager.local",
        name: "Demo User",
      },
    });
    console.log("   ✅ Created demo user:", testUser.email);
  }

  const gigCount = await prisma.gig.count();
  if (gigCount > 0) {
    console.log(
      `   Database already has ${gigCount} gig(s). Skipping seed.`
    );
    return;
  }

  await prisma.gig.createMany({
    data: [
      {
        eventName: "Jazz at the Park",
        date: new Date("2026-01-15T19:00:00Z"),
        performers: "The Jazz Quartet",
        numberOfMusicians: 4,
        performanceFee: 2000,
        technicalFee: 300,
        managerBonusType: "percentage",
        managerBonusAmount: 10,
        paymentReceived: true,
        paymentReceivedDate: new Date("2026-01-20T00:00:00Z"),
        bandPaid: true,
        bandPaidDate: new Date("2026-01-22T00:00:00Z"),
        notes: "Great venue — book again next year",
        userId: testUser.id,
      },
      {
        eventName: "Corporate Awards Night",
        date: new Date("2026-02-01T20:00:00Z"),
        performers: "Smooth Ensemble",
        numberOfMusicians: 5,
        performanceFee: 3500,
        technicalFee: 500,
        managerBonusType: "fixed",
        managerBonusAmount: 200,
        paymentReceived: true,
        paymentReceivedDate: new Date("2026-02-05T00:00:00Z"),
        bandPaid: false,
        bandPaidDate: null,
        notes: "Still need to pay band members",
        userId: testUser.id,
      },
      {
        eventName: "Summer Wedding — De Smet",
        date: new Date("2026-03-15T16:00:00Z"),
        performers: "The Groove Band",
        numberOfMusicians: 3,
        performanceFee: 1500,
        technicalFee: 0,
        managerBonusType: "fixed",
        managerBonusAmount: 100,
        paymentReceived: false,
        paymentReceivedDate: null,
        bandPaid: false,
        bandPaidDate: null,
        notes: null,
        userId: testUser.id,
      },
      {
        eventName: "Blues Bar Friday",
        date: new Date("2026-02-08T21:00:00Z"),
        performers: "Jonas & The Blues",
        numberOfMusicians: 2,
        performanceFee: 800,
        technicalFee: 150,
        managerBonusType: "percentage",
        managerBonusAmount: 5,
        paymentReceived: true,
        paymentReceivedDate: new Date("2026-02-09T00:00:00Z"),
        bandPaid: true,
        bandPaidDate: new Date("2026-02-09T00:00:00Z"),
        notes: null,
        userId: testUser.id,
      },
    ],
  });

  console.log("   ✅ Seeded 4 demo gigs for " + testUser.email + ".\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
