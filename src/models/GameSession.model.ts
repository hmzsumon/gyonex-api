import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGameSession extends Document {
	userId: Types.ObjectId;
	customerId: string;
	gameType: string; // e.g., 'slot', 'poker', etc.
	startTime: Date;
	endTime?: Date;
	betAmount: number;
	winAmount?: number;
	status: 'active' | 'completed' | 'cancelled';
}

const gameSessionSchema = new Schema<IGameSession>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		customerId: {
			type: String,
			required: true,
			trim: true,
		},
		gameType: {
			type: String,
			required: true,
			trim: true,
		},
		startTime: {
			type: Date,
			default: Date.now,
		},
		endTime: {
			type: Date,
		},
		betAmount: {
			type: Number,
			required: true,
			default: 0,
		},
		winAmount: {
			type: Number,
			default: 0,
		},
		status: {
			type: String,
			enum: ['active', 'completed', 'cancelled'],
			default: 'active',
		},
	},
	{ timestamps: true }
);
const GameSession = mongoose.model<IGameSession>(
	'GameSession',
	gameSessionSchema
);
export default GameSession;
