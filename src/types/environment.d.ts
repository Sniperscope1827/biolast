declare namespace NodeJS {
	export interface ProcessEnv {
		NODE_ENV?: string
		MYSQL_HOST?: string
		MYSQL_USER?: string
		MYSQL_PASSWORD?: string
		MYSQL_DATABASE?: string
		PREFIX?: string
		BOT_TOKEN?: string
		BOT_CLIENT_ID?: string
		SUBURBS_GUILDS?: string
		FARM_GUILDS?: string
		MALL_GUILDS?: string
		TESTING_GUILD_ID?: string
		LOG_LEVEL?: string
		GLOBAL_PVP_KILLFEED_WEBHOOK_ID?: string
		GLOBAL_PVP_KILLFEED_WEBHOOK_TOKEN?: string
	}
}
