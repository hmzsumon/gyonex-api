/* ────────── lottery controller imports ────────── */
import { AdminLog } from "@/models/index";
import { LotteryEvent } from "@/models/LotteryEvent.model";
import { LotteryTicket } from "@/models/LotteryTicket.model";
import { LotteryWinner } from "@/models/LotteryWinner.model";
import {
  buyTicketsForEvent,
  drawLotteryEvent,
  getLotteryEventSummary,
} from "@/services/lottery.service";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import mongoose from "mongoose";

/* ────────── get active lottery events for user panel ────────── */
export const getLotteryEvents: typeHandler = catchAsync(async (req, res) => {
  const filter: Record<string, unknown> = {
    status: { $in: ["upcoming", "open"] },
  };

  if (req.query.eventType) filter.eventType = req.query.eventType;

  const events = await LotteryEvent.find(filter).sort({ drawDate: 1 });

  const data = await Promise.all(
    events.map(async (event) => ({
      ...event.toObject(),
      ...(await getLotteryEventSummary(event._id, req.user?._id?.toString())),
    })),
  );

  res.status(200).json({
    success: true,
    data,
  });
});

/* ────────── get first open lottery for old client support ────────── */
export const getActiveLottery: typeHandler = catchAsync(async (req, res) => {
  const lottery = await LotteryEvent.findOne({ status: "open" }).sort({
    drawDate: 1,
  });

  const summary = lottery
    ? await getLotteryEventSummary(lottery._id, req.user?._id?.toString())
    : null;

  res.status(200).json({
    success: true,
    data: {
      lottery: lottery ? { ...lottery.toObject(), ...summary } : null,
      totalTickets: summary?.soldTickets ?? 0,
      myTickets: summary?.myTickets ?? 0,
    },
  });
});

/* ────────── buy multiple tickets from selected event ────────── */
export const buyLotteryTickets: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const quantity = Number(req.body.quantity || 1);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return next(new ApiError(400, "Quantity must be between 1 and 100"));
    }

    const result = await buyTicketsForEvent(
      req.params.id,
      userId.toString(),
      quantity,
    );

    res.status(200).json({
      success: true,
      message: `${quantity} ticket${quantity > 1 ? "s" : ""} purchased successfully`,
      data: {
        totalCost: result.totalCost,
        tickets: result.tickets.map((ticket) => ({
          _id: ticket._id,
          ticketNo: ticket.ticketNo,
        })),
      },
    });
  },
);

/* ────────── get logged in user lottery ticket history ────────── */
export const getMyLotteryTickets: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const tickets = await LotteryTicket.find({ userId })
      .populate("eventId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: tickets,
    });
  },
);

/* ────────── get public lottery winner list ────────── */
export const getLotteryWinners: typeHandler = catchAsync(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const skip = (page - 1) * limit;

  const [winners, total] = await Promise.all([
    LotteryWinner.find()
      .populate("eventId", "title eventType drawDate")
      .sort({ drawnAt: -1 })
      .skip(skip)
      .limit(limit),
    LotteryWinner.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      winners,
      total,
      page,
      pages: Math.ceil(total / limit),
    },
  });
});

/* ────────── create lottery event from admin panel ────────── */
export const createLottery: typeHandler = catchAsync(async (req, res, next) => {
  const adminId = req.user?._id;

  if (!adminId) {
    return next(new ApiError(401, "Admin not authenticated"));
  }

  const {
    eventType,
    title,
    description,
    prizeAmount,
    prizeAsset,
    prizeTiers,
    ticketPrice,
    maxTickets,
    winnerCount,
    startDate,
    endDate,
    drawDate,
    status,
    isAutoDraw,
  } = req.body;

  if (
    !eventType ||
    !["WEEKLY", "HALF_MONTHLY", "MONTHLY"].includes(eventType)
  ) {
    return next(new ApiError(400, "Valid event type is required"));
  }

  if (!title || !ticketPrice || !startDate || !endDate || !drawDate) {
    return next(new ApiError(400, "Missing required lottery fields"));
  }

  /* ────────── lottery prize tier request validation ────────── */
  const cleanPrizeTiers = Array.isArray(prizeTiers)
    ? prizeTiers
        .map((prize, index) => ({
          title:
            prize.title ||
            `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} Prize`,
          quantity: Number(prize.quantity),
          amount: Number(prize.amount),
        }))
        .filter((prize) => prize.quantity > 0 && prize.amount > 0)
    : [];

  if (!cleanPrizeTiers.length) {
    return next(new ApiError(400, "At least one prize tier is required"));
  }

  const totalPrizeAmount = cleanPrizeTiers.reduce(
    (sum, prize) => sum + prize.quantity * prize.amount,
    0,
  );
  const totalWinnerCount = cleanPrizeTiers.reduce(
    (sum, prize) => sum + prize.quantity,
    0,
  );

  const event = await LotteryEvent.create({
    eventType,
    title,
    description: description ?? "",
    prizeAmount: totalPrizeAmount,
    prizeAsset: prizeAsset ?? "USDT",
    prizeTiers: cleanPrizeTiers,
    ticketPrice,
    maxTickets: maxTickets ?? 10000,
    winnerCount: totalWinnerCount,
    startDate,
    endDate,
    drawDate,
    status: status ?? "open",
    isAutoDraw: isAutoDraw ?? true,
    createdBy: adminId,
  });

  await AdminLog.create({
    adminId,
    action: "lottery_event_created",
    targetId: event._id,
    targetType: "LotteryEvent",
    details: {
      title: event.title,
      eventType: event.eventType,
      drawDate: event.drawDate,
    },
  });

  res.status(201).json({
    success: true,
    data: event,
  });
});

/* ────────── update lottery event with sold ticket protection ────────── */
export const updateLottery: typeHandler = catchAsync(async (req, res, next) => {
  const adminId = req.user?._id;

  if (!adminId) {
    return next(new ApiError(401, "Admin not authenticated"));
  }

  const soldTickets = await LotteryTicket.countDocuments({
    eventId: req.params.id,
  });
  const lockedFields = ["ticketPrice", "eventType", "startDate"];

  if (
    soldTickets > 0 &&
    lockedFields.some((field) => req.body[field] !== undefined)
  ) {
    return next(
      new ApiError(
        400,
        "Ticket price, event type and start date cannot be changed after ticket sale",
      ),
    );
  }

  /* ────────── lottery prize tier update normalization ────────── */
  if (Array.isArray(req.body.prizeTiers)) {
    const cleanPrizeTiers = req.body.prizeTiers
      .map(
        (
          prize: { title?: string; quantity?: number; amount?: number },
          index: number,
        ) => ({
          title: prize.title || `${index + 1} Prize`,
          quantity: Number(prize.quantity),
          amount: Number(prize.amount),
        }),
      )
      .filter(
        (prize: { quantity: number; amount: number }) =>
          prize.quantity > 0 && prize.amount > 0,
      );

    if (!cleanPrizeTiers.length) {
      return next(new ApiError(400, "At least one prize tier is required"));
    }

    req.body.prizeTiers = cleanPrizeTiers;
    req.body.prizeAmount = cleanPrizeTiers.reduce(
      (sum: number, prize: { quantity: number; amount: number }) =>
        sum + prize.quantity * prize.amount,
      0,
    );
    req.body.winnerCount = cleanPrizeTiers.reduce(
      (sum: number, prize: { quantity: number }) => sum + prize.quantity,
      0,
    );
  }

  const event = await LotteryEvent.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!event) {
    return next(new ApiError(404, "Lottery event not found"));
  }

  await AdminLog.create({
    adminId,
    action: "lottery_event_updated",
    targetId: event._id,
    targetType: "LotteryEvent",
    details: req.body,
  });

  res.status(200).json({
    success: true,
    data: event,
  });
});

/* ────────── draw lottery winner manually from admin panel ────────── */
export const drawLotteryWinner: typeHandler = catchAsync(
  async (req, res, next) => {
    const adminId = req.user?._id;

    if (!adminId) {
      return next(new ApiError(401, "Admin not authenticated"));
    }

    const result = await drawLotteryEvent(req.params.id, adminId.toString());

    await AdminLog.create({
      adminId,
      action: "lottery_event_drawn",
      targetId: result.event._id,
      targetType: "LotteryEvent",
      details: {
        totalPool: result.totalPool,
        winners: result.winners.length,
      },
    });

    res.status(200).json({
      success: true,
      message: "Lottery winner drawn successfully",
      data: result,
    });
  },
);

/* ────────── get all lotteries with admin stats and pagination ────────── */
export const getAllLotteriesForAdmin: typeHandler = catchAsync(
  async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.eventType) filter.eventType = req.query.eventType;

    const [events, total, statsRaw, soldRaw] = await Promise.all([
      LotteryEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "name email"),
      LotteryEvent.countDocuments(filter),
      LotteryEvent.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      LotteryTicket.aggregate([
        { $match: { status: { $in: ["active", "winner", "expired"] } } },
        {
          $group: {
            _id: null,
            totalTickets: { $sum: 1 },
            revenue: { $sum: "$price" },
          },
        },
      ]),
    ]);

    const eventIds = events.map((event) => event._id);
    const ticketCounts = await LotteryTicket.aggregate([
      {
        $match: {
          eventId: { $in: eventIds },
          status: { $in: ["active", "winner", "expired"] },
        },
      },
      {
        $group: {
          _id: "$eventId",
          soldTickets: { $sum: 1 },
          revenue: { $sum: "$price" },
        },
      },
    ]);

    const countMap = new Map(
      ticketCounts.map((item) => [item._id.toString(), item]),
    );

    const lotteries = events.map((event) => ({
      ...event.toObject(),
      soldTickets: countMap.get(event._id.toString())?.soldTickets ?? 0,
      revenue: countMap.get(event._id.toString())?.revenue ?? 0,
    }));

    const byStatus = statsRaw.reduce(
      (acc: Record<string, number>, item: { _id: string; count: number }) => {
        acc[item._id] = item.count;
        return acc;
      },
      {},
    );

    res.status(200).json({
      success: true,
      data: {
        lotteries,
        stats: {
          total,
          open: byStatus.open ?? 0,
          upcoming: byStatus.upcoming ?? 0,
          drawn: byStatus.drawn ?? 0,
          cancelled: byStatus.cancelled ?? 0,
          totalTicketsSold: soldRaw?.[0]?.totalTickets ?? 0,
          totalRevenue: soldRaw?.[0]?.revenue ?? 0,
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  },
);

/* ────────── get single lottery details with tickets and winners ────────── */
export const getSingleLotteryForAdmin: typeHandler = catchAsync(
  async (req, res, next) => {
    const event = await LotteryEvent.findById(req.params.id).populate(
      "createdBy",
      "name email",
    );

    if (!event) {
      return next(new ApiError(404, "Lottery event not found"));
    }

    const [tickets, winners] = await Promise.all([
      LotteryTicket.find({ eventId: event._id })
        .populate("userId", "name email country customerId")
        .sort({ createdAt: -1 }),
      LotteryWinner.find({ eventId: event._id }).sort({ drawnAt: -1 }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        lottery: event,
        tickets,
        winners,
        totalTickets: tickets.length,
        revenue: tickets.reduce((sum, ticket) => sum + ticket.price, 0),
        uniqueParticipants: new Set(
          tickets.map((ticket) =>
            (ticket.userId as unknown as mongoose.Types.ObjectId).toString(),
          ),
        ).size,
      },
    });
  },
);
