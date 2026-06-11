import { Types } from 'mongoose';
import { Transaction } from '@/models/Transaction.model';
import { User as UserModel } from '@/models/user.model';
import {
	ITransaction,
	TransactionPurpose,
	TransactionType,
} from '@/models/Transaction.model';
import { IUser } from '@/models/user.model';

interface CreateTransactionInput {
	userId: Types.ObjectId | string;
	customerId?: string;
	transactionType: TransactionType;
	amount: number;
	purpose: TransactionPurpose;
	description?: string;
}

class TransactionManager {
	// Generate 10-digit unique ID
	private generateUniqueId(): string {
		return (Math.floor(Math.random() * 9000000000) + 1000000000).toString();
	}

	// Create a new transaction
	public async createTransaction({
		userId,
		customerId,
		transactionType,
		amount,
		purpose,
		description = 'Transaction',
	}: CreateTransactionInput): Promise<ITransaction> {
		try {
			const user: IUser | null = await UserModel.findById(userId);
			if (!user) throw new Error('User not found');

			const current_m_balance = user.m_balance || 0;
			let previous_m_balance = current_m_balance;

			// Calculate previous balance based on logic
			const isCredit = this.isCreditPurpose(purpose);
			previous_m_balance = isCredit
				? current_m_balance - amount
				: current_m_balance + amount;

			const transaction = new Transaction({
				userId,
				customerId,
				unique_id: this.generateUniqueId(),
				transactionType,
				amount,
				purpose,
				description,
				current_m_balance,
				previous_m_balance,
				isCashIn: transactionType === 'cashIn',
				isCashOut: transactionType === 'cashOut',
			});

			await transaction.save();
			return transaction;
		} catch (error: any) {
			console.error('❌ Error creating transaction:', error.message);
			throw error;
		}
	}

	// ✅ Return user's all transactions, with filters
	public async getTransactionsByUser(
		userId: Types.ObjectId | string,
		filters: {
			transactionType?: TransactionType;
			purpose?: TransactionPurpose;
			limit?: number;
			skip?: number;
		} = {}
	) {
		const query: any = { user_id: userId };
		if (filters.transactionType)
			query.transactionType = filters.transactionType;
		if (filters.purpose) query.purpose = filters.purpose;

		const transactions = await Transaction.find(query)
			.sort({ createdAt: -1 })
			.limit(filters.limit || 50)
			.skip(filters.skip || 0);

		return transactions;
	}

	// ✅ Utility to check if it's a credit type purpose
	private isCreditPurpose(purpose: TransactionPurpose): boolean {
		const creditPurposes: TransactionPurpose[] = [
			'Deposit',
			'Receive Money',
			'Refund',
			'Level Bonus',
			'Company Bonus',
			'Profit',
			'Lottery Win',
			'Rank Bonus',
			'Trade Profit',
			'Balance Transfer',
			'Deposit Bonus',
			'Admin Deposit',
			'Buy Trade',
			'Task Profit',
			'Team Commission',
			'Withdrawal Refund',
			'Generation Reward',
		];
		return creditPurposes.includes(purpose);
	}
}

export default TransactionManager;
