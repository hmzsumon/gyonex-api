/* ────────── lottery service imports ────────── */
import { ILotteryEvent, LotteryEvent } from "@/models/LotteryEvent.model";
import { LotteryTicket } from "@/models/LotteryTicket.model";
import { LotteryWinner } from "@/models/LotteryWinner.model";
import { Notification } from "@/models/Notification.model";
import { User } from "@/models/user.model";
import { ApiError } from "@/utils/ApiError";
import TransactionManager from "@/utils/TransactionManager";
import mongoose from "mongoose";

/* ────────── lottery helper utilities for ticket number and summary ────────── */
export function maskLotteryName(fullName = "User"): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .map((part) =>
      part.length > 2
        ? `${part[0]}***${part[part.length - 1]}`
        : `${part[0]}***`,
    )
    .join(" ");
}

export function eventPrefix(type: string): string {
  if (type === "WEEKLY") return "WK";
  if (type === "HALF_MONTHLY") return "HM";
  return "MN";
}

export async function buildLotteryTicketNo(
  event: ILotteryEvent,
  serial: number,
) {
  const d = new Date(event.drawDate);
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  return `${eventPrefix(event.eventType)}-${ym}-${String(serial).padStart(6, "0")}`;
}

export async function getLotteryEventSummary(
  eventId: mongoose.Types.ObjectId | string,
  userId?: string,
) {
  const [soldTickets, myTickets, winners] = await Promise.all([
    LotteryTicket.countDocuments({
      eventId,
      status: { $in: ["active", "winner", "expired"] },
    }),
    userId
      ? LotteryTicket.countDocuments({
          eventId,
          userId,
          status: { $in: ["active", "winner", "expired"] },
        })
      : 0,
    LotteryWinner.find({ eventId }).sort({ drawnAt: -1 }),
  ]);

  return { soldTickets, myTickets, winners };
}

/* ────────── lottery ticket purchase service with wallet debit ────────── */
export async function buyTicketsForEvent(
  eventId: string,
  userId: string,
  quantity: number,
) {
  const event = await LotteryEvent.findById(eventId);

  if (!event || event.status !== "open") {
    throw new ApiError(400, "Lottery event is not open for ticket purchase");
  }

  const now = new Date();
  if (now < event.startDate || now > event.endDate || now >= event.drawDate) {
    throw new ApiError(400, "Ticket purchase is closed for this lottery event");
  }

  const sold = await LotteryTicket.countDocuments({
    eventId: event._id,
    status: { $in: ["active", "winner", "expired"] },
  });

  if (sold + quantity > event.maxTickets) {
    throw new ApiError(
      400,
      `Only ${event.maxTickets - sold} tickets remain in this event`,
    );
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const totalCost = event.ticketPrice * quantity;

  if (user.m_balance < totalCost) {
    throw new ApiError(
      400,
      `Insufficient balance. You need ${totalCost} ${event.prizeAsset}`,
    );
  }

  user.m_balance -= totalCost;
  await user.save();

  const txManager = new TransactionManager();
  await txManager.createTransaction({
    userId: user._id as string,
    customerId: user.customerId,
    transactionType: "cashOut",
    amount: totalCost,
    purpose: "Buy Lottery",
    description: `Buy ${quantity} lottery ticket${quantity > 1 ? "s" : ""} for ${event.title}`,
  });

  const docs = [];
  for (let i = 1; i <= quantity; i++) {
    docs.push({
      eventId: event._id,
      userId,
      ticketNo: await buildLotteryTicketNo(event, sold + i),
      price: event.ticketPrice,
      asset: event.prizeAsset,
      purchasedAt: new Date(),
    });
  }

  const tickets = await LotteryTicket.insertMany(docs);

  await Notification.create({
    user_id: user._id,
    role: user.role,
    category: "lottery",
    title: "Lottery Tickets Purchased",
    message: `You bought ${quantity} ticket${quantity > 1 ? "s" : ""} for ${event.title}. Good luck!`,
    url: "/lottary",
  });

  return { event, totalCost, tickets };
}

/* ────────── lottery winner draw service with prize tier wallet credit ────────── */
export async function drawLotteryEvent(eventId: string, drawnBy?: string) {
  const event = await LotteryEvent.findById(eventId);

  if (!event || !["open", "upcoming"].includes(event.status)) {
    throw new ApiError(400, "Lottery event is not available for draw");
  }

  const existing = await LotteryWinner.countDocuments({ eventId: event._id });
  if (existing > 0 || event.status === "drawn") {
    throw new ApiError(400, "Lottery event is already drawn");
  }

  const tickets = await LotteryTicket.find({
    eventId: event._id,
    status: "active",
  })
    .populate("userId", "name country customerId role")
    .lean();

  if (!tickets.length) {
    throw new ApiError(400, "No tickets sold — cannot draw winner");
  }

  /* ────────── lottery prize tier fallback and winner quantity calculation ────────── */
  const prizeTiers = event.prizeTiers?.length
    ? event.prizeTiers
    : [
        {
          title: "1st Prize",
          quantity: event.winnerCount || 1,
          amount: event.prizeAmount / Math.max(event.winnerCount || 1, 1),
        },
      ];

  const totalWinnerSlots = prizeTiers.reduce(
    (sum, prize) => sum + Number(prize.quantity || 0),
    0,
  );
  const shuffled = [...tickets].sort(() => Math.random() - 0.5);
  const winnerTickets = shuffled.slice(
    0,
    Math.min(totalWinnerSlots, shuffled.length),
  );

  const created = [];
  let cursor = 0;

  /* ────────── lottery winner creation by prize tier ────────── */
  for (let tierIndex = 0; tierIndex < prizeTiers.length; tierIndex++) {
    const prize = prizeTiers[tierIndex];
    const prizeQuantity = Number(prize.quantity || 0);

    for (let itemIndex = 0; itemIndex < prizeQuantity; itemIndex++) {
      const ticket = winnerTickets[cursor];
      if (!ticket) break;
      cursor++;

      const winnerUser = ticket.userId as unknown as {
        _id: mongoose.Types.ObjectId;
        name?: string;
        country?: string;
        customerId?: string;
        role?: string;
      };

      const winner = await LotteryWinner.create({
        eventId: event._id,
        ticketId: ticket._id,
        userId: winnerUser._id,
        ticketNo: ticket.ticketNo,
        prizeTitle: prize.title,
        prizeRank: tierIndex + 1,
        prizeAmount: Number(prize.amount),
        prizeAsset: event.prizeAsset,
        winnerName: winnerUser.name || "User",
        maskedName: maskLotteryName(winnerUser.name || "User"),
        country: winnerUser.country || "🌍",
        drawnBy,
        drawnAt: new Date(),
      });

      await LotteryTicket.findByIdAndUpdate(ticket._id, { status: "winner" });

      const user = await User.findById(winnerUser._id);
      if (user) {
        user.m_balance += Number(prize.amount);
        user.is_winner = true;
        await user.save();

        const txManager = new TransactionManager();
        await txManager.createTransaction({
          userId: user._id as string,
          customerId: user.customerId,
          transactionType: "cashIn",
          amount: Number(prize.amount),
          purpose: "Lottery Win",
          description: `${prize.title} from ${event.title}`,
        });

        await Notification.create({
          user_id: user._id,
          role: user.role,
          category: "lottery",
          title: "You Won the Lottery",
          message: `Congratulations! You won ${Number(prize.amount)} ${event.prizeAsset} as ${prize.title} from ${event.title}.`,
          url: "/lottary",
        });
      }

      created.push(winner);
    }
  }

  /* ────────── lottery ticket expiry after draw completion ────────── */
  await LotteryTicket.updateMany(
    { eventId: event._id, status: "active" },
    { $set: { status: "expired" } },
  );

  event.status = "drawn";
  await event.save();

  return {
    event,
    winners: created,
    totalPool: tickets.length,
    totalPrize: created.reduce((sum, winner) => sum + winner.prizeAmount, 0),
  };
}
