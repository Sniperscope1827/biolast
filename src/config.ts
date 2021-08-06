export const debug = process.env.NODE_ENV !== 'production'

export const botToken = process.env.BOT_TOKEN

export const clientId = process.env.BOT_CLIENT_ID

// TODO this will be deprecated by slash commands
export const prefix = process.env.PREFIX || '='

export const icons = {
	money: '₽',
	health: {
		start_full: '<:health_bar_start_full:849053369368313906>',
		mid_full: '<:health_bar_mid_full:849053369317326868>',
		end_full: '<:health_bar_end_full:849053369385615431>',
		percent_25: '<:health_bar_25:849055032875810816>',
		percent_50: '<:health_bar_50:849055033126944828>',
		percent_75: '<:health_bar_75:849055032879218718>',
		start_25: '<:health_bar_start_25:849056171821236224>',
		start_50: '<:health_bar_start_50:849056171792007168>',
		start_75: '<:health_bar_start_75:849056171540348959>',
		empty: '<:health_bar_empty:849065056363872318>'
	}
}

export const baseBackpackLimit = 15

// User ids of users who have admin permissions (can run commands with the 'admin' category)
export const adminUsers = ['168958344361541633']

// IDs of guilds where the suburbs raid can take place. Refer to ./resources/raids.ts for what
// channels a raid will need in order to work properly.
export const suburbsGuilds = process.env.SUBURBS_GUILDS ? process.env.SUBURBS_GUILDS.split(',') : []
