// One-time rollout. Run from gyonex-api after reviewing the target database:
// node -r ts-node/register -r tsconfig-paths/register src/scripts/applyRepaymentFee.ts
import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") dotenv.config({ path: "src/config/config.env" });
import LoanSetting from "@/models/LoanSetting.model";
import mongoose from "mongoose";
async function main() {
 if (!process.env.DB_URI) throw new Error("DB_URI is required");
 await mongoose.connect(process.env.DB_URI);
 await LoanSetting.updateOne({key:"global"},{$set:{repaymentFeePercent:8}},{upsert:true});
 console.log("Loan repayment fee set to 8%. Future changes use the admin panel.");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>mongoose.disconnect());
