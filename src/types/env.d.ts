declare namespace NodeJS {
	interface ProcessEnv {
		JWT_SECRET: string;
		JWT_EXPIRE: string;
	}
}
declare global {
	namespace NodeJS {
		interface ProcessEnv {
			MONGO_URI: string;
			PORT: string;
			JWT_SECRET: string;
			JWT_EXPIRE: string;
			FRONTEND_URL: string;
			EMAIL_USER: string;
			EMAIL_PASS: string;
			EMAIL_HOST: string;
			EMAIL_PORT: string;
			EMAIL_FROM: string;
			EMAIL_FROM_NAME: string;
			REDIS_HOST: string;
			REDIS_PORT: number;
			REDIS_PASSWORD: string;
			CLOUDINARY_CLOUD_NAME: string;
			CLOUDINARY_API_KEY: string;
			CLOUDINARY_API_SECRET: string;
		}
	}
}
