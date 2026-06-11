import mongoose, { Schema, Document, Types } from 'mongoose';

const userGameSummarySchema = new Schema({
	userId: { type: Types.ObjectId, ref: 'User', required: true },
	customerId: { type: String, required: true },
	gamesPlayed: { type: Number, default: 0 },
	gamesWon: { type: Number, default: 0 },
	gamesLost: { type: Number, default: 0 },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

const UserGameSummary = mongoose.model<IUserGameSummary>(
	'UserGameSummary',
	userGameSummarySchema
);

export default UserGameSummary;
export interface IUserGameSummary extends Document {
	userId: Types.ObjectId;
	customerId: string;
	gamesPlayed: number;
	gamesWon: number;
	gamesLost: number;
	createdAt: Date;
	updatedAt: Date;
}
