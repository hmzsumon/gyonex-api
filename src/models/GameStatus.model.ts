import mongoose, { Document, Schema } from 'mongoose';

export interface IGameStatus extends Document {
	totalBets: number; // Total number of bets placed
	totalWins: number; // Total number of wins
	totalLosses: number; // Total number of losses
	todayBets: number; // Bets placed today
	todayWins: number; // Wins today
	todayLosses: number; // Losses today
	thisMonthBets: number; // Bets placed this month
	thisMonthWins: number; // Wins this month
	thisMonthLosses: number; // Losses this month
	lastMonthBets: number; // Bets placed last month
	lastMonthWins: number; // Wins last month
	lastMonthLosses: number; // Losses last month
}

const gameStatusSchema = new Schema<IGameStatus>(
	{
		totalBets: {
			type: Number,
			default: 0,
		},
		totalWins: {
			type: Number,
			default: 0,
		},
		totalLosses: {
			type: Number,
			default: 0,
		},
		todayBets: {
			type: Number,
			default: 0,
		},
		todayWins: {
			type: Number,
			default: 0,
		},
		todayLosses: {
			type: Number,
			default: 0,
		},
		thisMonthBets: {
			type: Number,
			default: 0,
		},
		thisMonthWins: {
			type: Number,
			default: 0,
		},
		thisMonthLosses: {
			type: Number,
			default: 0,
		},
		lastMonthBets: {
			type: Number,
			default: 0,
		},
		lastMonthWins: {
			type: Number,
			default: 0,
		},
		lastMonthLosses: {
			type: Number,
			default: 0,
		},
	},
	{ timestamps: true }
);

const GameStatus = mongoose.model<IGameStatus>('GameStatus', gameStatusSchema);
export default GameStatus;
