import { Schema, model, Document } from 'mongoose';

export interface IAdminNotification extends Document {
	title?: string;
	category?: string;
	message?: string;
	is_read: boolean;
	is_opened: boolean;
	url?: string;
	createdAt: Date;
	updatedAt: Date;
}

const adminNotificationSchema = new Schema<IAdminNotification>(
	{
		title: {
			type: String,
		},
		category: {
			type: String,
		},
		message: {
			type: String,
		},
		is_read: {
			type: Boolean,
			default: false,
		},
		is_opened: {
			type: Boolean,
			default: false,
		},
		url: {
			type: String,
		},
	},
	{ timestamps: true }
);

export const AdminNotification = model<IAdminNotification>(
	'AdminNotification',
	adminNotificationSchema
);
