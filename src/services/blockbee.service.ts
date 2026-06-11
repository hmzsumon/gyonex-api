// @ts-ignore
import BlockBee from '@blockbee/api';

import dotenv from 'dotenv';
dotenv.config({ path: 'src/config/config.env' });

const API_KEY = process.env.BLOCKBEE_API_KEY as string;

export interface CreatePaymentOptions {
	coin?: string; // e.g., 'bep20_usdt', 'btc'
	myAddress?: string;
	callback?: string;
	params?: Record<string, any>;
	blockbeeParams?: Record<string, any>;
}

export interface PaymentResponse {
	address_in: string;
	qrCode: string;
}

export const createPayment = async ({
	coin = 'bep20_usdt',
	myAddress = '',
	callback = '',
	params = {},
	blockbeeParams = {},
}: CreatePaymentOptions): Promise<PaymentResponse> => {
	try {
		if (!API_KEY) throw new Error('BLOCKBEE_API_KEY not found in environment');

		const bb = new BlockBee(
			coin,
			myAddress,
			callback,
			params,
			blockbeeParams,
			API_KEY
		);

		const address: string = await bb.getAddress();
		const qrCodeData: { qr_code: string } = await bb.getQrcode();

		console.log('✅ BlockBee Address Generated:', address);

		return {
			address_in: address,
			qrCode: qrCodeData.qr_code,
		};
	} catch (error: any) {
		console.error('❌ BlockBee createPayment error:', error.message);
		throw error;
	}
};

export const checkPaymentLogs = async ({
	coin = 'bep20_usdt',
	myAddress = '',
	callback = '',
	params = {},
	blockbeeParams = {},
}: CreatePaymentOptions): Promise<any> => {
	try {
		if (!API_KEY) throw new Error('BLOCKBEE_API_KEY not found in environment');

		const bb = new BlockBee(
			coin,
			myAddress,
			callback,
			params,
			blockbeeParams,
			API_KEY
		);

		const logs = await bb.checkLogs();
		console.log('📋 BlockBee Logs:', logs);
		return logs;
	} catch (error: any) {
		console.error('❌ BlockBee checkLogs error:', error.message);
		throw error;
	}
};
