import { CommandOptionType, SlashCreator, CommandContext } from 'slash-create'
import App from '../app'
import CustomSlashCommand from '../structures/CustomSlashCommand'

class TestCommand extends CustomSlashCommand {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'hello',
			description: 'Says hello to you.',
			options: [{
				type: CommandOptionType.STRING,
				name: 'food',
				description: 'What food do you like?'
			}],
			category: 'info',
			guildModsOnly: false,
			worksInDMs: true,
			onlyWorksInRaidGuild: false,
			canBeUsedInRaid: true,
			guildIDs: []
		})

		this.filePath = __filename
	}

	async run (ctx: CommandContext): Promise<void> {
		setTimeout(async () => {
			await ctx.send({
				content: ctx.options.food ? `You like ${ctx.options.food}? Nice!` : `Hello, ${ctx.user.username}!`
			})
		}, 2000)
	}
}

export default TestCommand
