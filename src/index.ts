import { botToken } from './config'
import App from './app'
import { logger } from './utils/logger'

const app = new App(`Bot ${botToken}`, {
	disableEvents: {
		GUILD_BAN_ADD: true,
		GUILD_BAN_REMOVE: true,
		MESSAGE_DELETE: true,
		MESSAGE_DELETE_BULK: true,
		MESSAGE_UPDATE: true,
		TYPING_START: true,

		// interactions are handled by slash-crate (disabling eris fixes conflicts)
		INTERACTION_CREATE: true
	},
	allowedMentions: {
		everyone: false,
		users: true
	},
	messageLimit: 1,
	defaultImageFormat: 'png',
	defaultImageSize: 256,
	restMode: true,
	intents: [
		'guilds',
		'guildMembers',
		'guildMessages',
		'guildMessageReactions',
		'directMessages'
	]
})

app.launch()

process.on('SIGINT', () => {
	logger.info('Stopping')
})

process.on('unhandledRejection', (reason, promise) => {
	logger.error(reason as any)
})
