import Transaction from "@/models/Transaction.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";

/* ── get logged in user transactions ───────────────────────────────── */
export const getMyTransactions = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;

  if (!userId) {
    return next(new ApiError(401, "User not authenticated"));
  }
  const transactions = await Transaction.find({ userId }).sort({
    createdAt: -1,
  });
  res.status(200).json({
    success: true,
    transactions,
    message: "Transactions retrieved successfully",
  });
});
