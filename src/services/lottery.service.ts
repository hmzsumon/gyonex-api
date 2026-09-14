/* ────────── lottery service imports ────────── */
import { ILotteryEvent, LotteryEvent } from "@/models/LotteryEvent.model";
import { LotteryTicket } from "@/models/LotteryTicket.model";
import { LotteryWinner } from "@/models/LotteryWinner.model";
import { Notification } from "@/models/Notification.model";
import { User } from "@/models/user.model";
import { ApiError } from "@/utils/ApiError";
import mongoose from "mongoose";
import { randomInt, randomUUID } from "crypto";
import { Transaction } from "@/models/Transaction.model";
import { AdminLog } from "@/models/index";

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

  return `${eventPrefix(event.eventType)}-${ym}-${event._id.toString()}-${String(serial).padStart(6, "0")}`;
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
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new ApiError(400, "Quantity must be between 1 and 100");
  }
  return mongoose.connection.transaction(async (session) => {
    const event = await LotteryEvent.findById(eventId).session(session);

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
    }).session(session);

    if (sold + quantity > event.maxTickets) {
      throw new ApiError(
        400,
        `Only ${event.maxTickets - sold} tickets remain in this event`,
      );
    }

    const totalCost = event.ticketPrice * quantity;
    // Updating the event serializes purchases with other purchases and draws.
    // The event prefix also prevents collisions with tickets from older events.
    const reserved = await LotteryEvent.findOneAndUpdate(
      { _id: event._id, status: "open" },
      { $inc: { ticketSequence: quantity } },
      { new: true, session },
    ).select("+ticketSequence");
    if (!reserved) throw new ApiError(409, "Lottery event is no longer open");

    const user = await User.findOneAndUpdate(
      { _id: userId, m_balance: { $gte: totalCost } },
      { $inc: { m_balance: -totalCost } },
      { new: true, session },
    );
    if (!user) {
      throw new ApiError(
        400,
        `Insufficient balance. You need ${totalCost} ${event.prizeAsset}`,
      );
    }

    await Transaction.create([{
      userId: user._id as string,
      customerId: user.customerId,
      transactionType: "cashOut",
      amount: totalCost,
      purpose: "Buy Lottery",
      description: `Buy ${quantity} lottery ticket${quantity > 1 ? "s" : ""} for ${event.title}`,
      unique_id: String(randomInt(1000000000, 10000000000)),
      current_m_balance: user.m_balance,
      previous_m_balance: user.m_balance + totalCost,
      isCashIn: false,
      isCashOut: true,
    }], { session });

    const docs = [];
    for (let i = 1; i <= quantity; i++) {
      docs.push({
        eventId: event._id,
        userId,
        ticketNo: await buildLotteryTicketNo(event, reserved.ticketSequence - quantity + i),
        price: event.ticketPrice,
        asset: event.prizeAsset,
        purchasedAt: new Date(),
      });
    }

    const tickets = await LotteryTicket.insertMany(docs, { session });

    await Notification.create([{
      user_id: user._id,
      role: user.role,
      category: "lottery",
      title: "Lottery Tickets Purchased",
      message: `You bought ${quantity} ticket${quantity > 1 ? "s" : ""} for ${event.title}. Good luck!`,
      url: "/lottary",
    }], { session });

    return { event, totalCost, tickets };
  });
}


function prizeSlots(event: ILotteryEvent, count: number) {
  const tiers = event.prizeTiers?.length ? event.prizeTiers : [{
    title: "1st Prize", quantity: event.winnerCount || 1,
    amount: event.prizeAmount / Math.max(event.winnerCount || 1, 1),
  }];
  return tiers.flatMap((tier, index) => {
    if (!Number.isInteger(tier.quantity) || tier.quantity < 1 || !Number.isFinite(tier.amount) || tier.amount < 1) {
      throw new ApiError(400, "Invalid lottery prize configuration");
    }
    return Array.from({ length: Math.min(tier.quantity, count) }, () => ({
      prizeTitle: tier.title, prizeRank: index + 1, prizeAmount: tier.amount,
    }));
  }).slice(0, count);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// A preview never creates winners or credits a wallet. Auto draw is disabled
// persistently so closing the browser cannot publish an unconfirmed result.
export async function previewLotteryEvent(eventId: string) {
  return mongoose.connection.transaction(async session => {
    const event = await LotteryEvent.findById(eventId).session(session);
    if (!event || !["open", "upcoming"].includes(event.status)) {
      throw new ApiError(400, "Lottery event is not available for preview");
    }
    if (await LotteryWinner.exists({ eventId }).session(session)) {
      throw new ApiError(400, "Lottery event is already drawn");
    }
    const tickets = await LotteryTicket.find({ eventId, status: "active" })
      .populate("userId", "name customerId").session(session).lean();
    const candidates = tickets.filter(t => t.userId).map(t => {
      const user = t.userId as unknown as { _id: mongoose.Types.ObjectId; name?: string; customerId?: string };
      return { ticketId: String(t._id), ticketNo: t.ticketNo, userId: String(user._id),
        name: user.name || "User", customerId: user.customerId || "" };
    });
    if (!candidates.length) throw new ApiError(400, "No eligible tickets available");
    const slots = prizeSlots(event, candidates.length);
    const selected = shuffle(candidates).slice(0, slots.length);
    const previewToken = randomUUID();
    event.drawPreviewToken = previewToken;
    event.isAutoDraw = false;
    await event.save({ session });
    return { eventId, title: event.title, prizeAsset: event.prizeAsset, previewToken,
      totalPool: candidates.length, candidates,
      winners: slots.map((slot, i) => ({ ...slot, ticketId: selected[i].ticketId })),
    };
  });
}

export async function drawLotteryEvent(eventId: string, drawnBy?: string,
  selection?: { previewToken: string; ticketIds: string[] }) {
  return mongoose.connection.transaction(async session => {
    const event = await LotteryEvent.findById(eventId).select("+drawPreviewToken").session(session);
    if (!event || !["open", "upcoming"].includes(event.status)) {
      throw new ApiError(400, "Lottery event is not available for draw");
    }
    if (drawnBy && (!selection || selection.previewToken !== event.drawPreviewToken)) {
      throw new ApiError(409, "Preview changed or expired. Open a new preview before confirming.");
    }
    if (!drawnBy && (!event.isAutoDraw || event.drawPreviewToken || event.drawDate > new Date())) {
      throw new ApiError(409, "Automatic draw is disabled or not due");
    }
    if (await LotteryWinner.exists({ eventId }).session(session)) {
      throw new ApiError(400, "Lottery event is already drawn");
    }
    const tickets = await LotteryTicket.find({ eventId, status: "active" })
      .populate("userId", "name country customerId role").session(session).lean();
    const eligible = tickets.filter(t => t.userId);
    if (!eligible.length) throw new ApiError(400, "No eligible tickets available");
    const slots = prizeSlots(event, eligible.length);
    const byId = new Map(eligible.map(t => [String(t._id), t]));
    const ticketIds = selection?.ticketIds || shuffle(eligible).slice(0, slots.length).map(t => String(t._id));
    if (ticketIds.length !== slots.length || new Set(ticketIds).size !== ticketIds.length ||
        ticketIds.some(id => !byId.has(id))) {
      throw new ApiError(400, "Choose one different eligible ticket for every prize. Refresh the preview if ticket availability changed.");
    }
    // Claim the event inside the same transaction as all payouts. Concurrent
    // confirmations/cron runs conflict here and cannot credit a second time.
    event.status = "drawn";
    event.drawPreviewToken = undefined;
    await event.save({ session });
    const drawnAt = new Date();
    const winners = [];
    for (let i = 0; i < slots.length; i++) {
      const ticket = byId.get(ticketIds[i])!;
      const userInfo = ticket.userId as unknown as { _id: mongoose.Types.ObjectId; name?: string; country?: string };
      const prize = slots[i];
      const user = await User.findByIdAndUpdate(userInfo._id,
        { $inc: { m_balance: prize.prizeAmount }, $set: { is_winner: true } },
        { new: true, session });
      if (!user) throw new ApiError(400, "Winner account no longer exists");
      const [winner] = await LotteryWinner.create([{
        eventId: event._id, ticketId: ticket._id, userId: user._id,
        ticketNo: ticket.ticketNo, ...prize, prizeAsset: event.prizeAsset,
        winnerName: user.name || "User", maskedName: maskLotteryName(user.name || "User"),
        country: userInfo.country || "🌍", drawnBy, drawnAt,
      }], { session });
      await LotteryTicket.updateOne({ _id: ticket._id }, { $set: { status: "winner" } }, { session });
      await Transaction.create([{
        userId: user._id, customerId: user.customerId,
        unique_id: String(randomInt(1000000000, 10000000000)),
        transactionType: "cashIn", amount: prize.prizeAmount, purpose: "Lottery Win",
        description: prize.prizeTitle + " from " + event.title,
        current_m_balance: user.m_balance, previous_m_balance: user.m_balance - prize.prizeAmount,
        isCashIn: true, isCashOut: false,
      }], { session });
      await Notification.create([{
        user_id: user._id, role: user.role, category: "lottery", title: "You Won the Lottery",
        message: "Congratulations! You won " + prize.prizeAmount + " " + event.prizeAsset + " as " + prize.prizeTitle + " from " + event.title + ".",
        url: "/lottary",
      }], { session });
      winners.push(winner);
    }
    await LotteryTicket.updateMany({ eventId, status: "active" }, { $set: { status: "expired" } }, { session });
    if (drawnBy) await AdminLog.create([{
      adminId: drawnBy, action: "lottery_event_drawn", targetId: event._id, targetType: "LotteryEvent",
      details: { totalPool: eligible.length, winners: winners.map(w => ({ ticketId: w.ticketId, userId: w.userId, prizeAmount: w.prizeAmount, prizeRank: w.prizeRank })) },
    }], { session });
    return { event, winners, totalPool: eligible.length,
      totalPrize: winners.reduce((sum, w) => sum + w.prizeAmount, 0) };
  });
}
