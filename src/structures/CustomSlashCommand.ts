import { SlashCommand, SlashCommandOptions, SlashCreator } from 'slash-create'
import App from '../app'
import { debug, testingGuildIDs } from '../config'
import { logger } from '../utils/logger'

type CommandCategory = 'admin' | 'info' | 'items' | 'utility'

interface BaseCommandOptions {
	guildModsOnly: boolean

	/**
	 * Whether this command can be used while user is in an active duel
	 */
	worksDuringDuel: boolean

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

	worksDuringDuel: true
}

interface GuildCommandOptions extends BaseCommandOptions {
	worksInDMs: false
}

type CommandOptions = DMCommandOptions | GuildCommandOptions

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
		if (debug && testingGuildIDs) {
			// register to testing guild while bot is in debug mode
			logger.debug(`Registering ${slashOptions.name} to testing guild instead of globally: ${testingGuildIDs.join(', ')}`)

			if (slashOptions.guildIDs) {
				slashOptions.guildIDs = [...slashOptions.guildIDs, ...testingGuildIDs]
			}
			else {
				slashOptions.guildIDs = testingGuildIDs
			}
		}

		super(creator, slashOptions)

		this.app = app
		this.customOptions = slashOptions
	}
}

export default CustomSlashCommand
