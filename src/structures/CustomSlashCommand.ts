import { SlashCommand, SlashCommandOptions, SlashCreator } from 'slash-create'
import App from '../app'
import { debug, testingGuildIDs } from '../config'
import { allLocations } from '../resources/raids'
import { logger } from '../utils/logger'

type CommandCategory = 'admin' | 'info' | 'items' | 'utility'

interface BaseCommandOptions {
	guildModsOnly: boolean

	/**
	 * Whether or not this command can be used while the user is in an active raid
	 */
	canBeUsedInRaid: boolean

	/**
	 * Whether this command can ONLY be used in a raid guild
	 */
	onlyWorksInRaidGuild: boolean

	/**
	 * Description to display in help command
	 */
	longDescription: string

	/**
	 * Whether to not defer for this command, this should only be set to true if the
	 * command is pinging users/roles. When an interaction is deferred, the next response edits the
	 * original message, which prevents any pings from actually pinging.
	 */
	noDefer?: boolean

	category: CommandCategory
}

interface DMCommandOptions extends BaseCommandOptions {
	worksInDMs: true

	// guildModsOnly MUST be false for DM commands
	guildModsOnly: false

	// command must not be raid-only command
	onlyWorksInRaidGuild: false
}

interface GuildCommandOptions extends BaseCommandOptions {
	worksInDMs: false
	canBeUsedInRaid: false
	onlyWorksInRaidGuild: false
}

/**
 * Can be used in a raid server
 */
interface RaidCommandOptions extends BaseCommandOptions {
	worksInDMs: false
	canBeUsedInRaid: true
	onlyWorksInRaidGuild: boolean
}

type CommandOptions = DMCommandOptions | GuildCommandOptions | RaidCommandOptions

class CustomSlashCommand extends SlashCommand {
	app: App
	customOptions: CommandOptions

	constructor (
		creator: SlashCreator,
		app: App,
		// omitting throttling and permissions because I run the commands
		// through my own custom command handler and they won't be supported
		slashOptions: Omit<SlashCommandOptions, 'throttling' | 'permissions'> & CommandOptions
	) {
		// raid-only commands should only be registered to raid guilds
		if (slashOptions.onlyWorksInRaidGuild) {
			if (slashOptions.guildIDs) {
				slashOptions.guildIDs = [...slashOptions.guildIDs, ...allLocations.map(loc => loc.guilds).flat(1)]
			}
			else {
				slashOptions.guildIDs = allLocations.map(loc => loc.guilds).flat(1)
			}
		}
		else if (debug && testingGuildIDs) {
			// register to testing guild and raids while bot is in debug mode
			logger.debug(`Registering ${slashOptions.name} to testing guild instead of globally: ${testingGuildIDs.join(', ')}`)

			if (slashOptions.guildIDs) {
				slashOptions.guildIDs = [...slashOptions.guildIDs, ...testingGuildIDs, ...allLocations.map(loc => loc.guilds).flat(1)]
			}
			else {
				slashOptions.guildIDs = [...testingGuildIDs, ...allLocations.map(loc => loc.guilds).flat(1)]
			}
		}

		super(creator, slashOptions)

		this.app = app
		this.customOptions = slashOptions
	}
}

export default CustomSlashCommand
