import Eris, { User, Member, Guild, Constants } from 'eris'
import { SlashCreator, GatewayServer, AnyRequestData, CommandContext, InteractionRequestData, InteractionResponseFlags, InteractionResponseType, InteractionType } from 'slash-create'
import { TextCommand } from './types/Commands'
import MessageCollector from './utils/MessageCollector'
import ComponentCollector from './utils/ComponentCollector'
import NPCHandler from './utils/NPCHandler'
import CronJobs from './utils/CronJobs'
import { getAllRaids, getUsersRaid, removeUserFromRaid, userInRaid } from './utils/db/raids'
import { clientId, botToken, adminUsers, icons, raidCooldown } from './config'
import fs from 'fs'
import path from 'path'
import { beginTransaction, query } from './utils/db/mysql'
import { addItemToBackpack, createItem, getUserBackpack, removeAllItemsFromBackpack } from './utils/db/items'
import { createCooldown, formatTime, getCooldown, getCooldownTimeLeft } from './utils/db/cooldowns'
import CustomSlashCommand from './structures/CustomSlashCommand'
import { createAccount, getUserRow, increaseLevel, setMaxHealth, setStashSlots } from './utils/db/players'
import { getRaidType, isRaidGuild } from './utils/raidUtils'
import { items } from './resources/items'
import { getPlayerXp } from './utils/playerUtils'
import { getItemDisplay } from './utils/itemUtils'
import { messageUser } from './utils/messageUtils'
import { logger } from './utils/logger'
import getRandomInt from './utils/randomInt'
import TutorialHandler from './utils/TutorialHandler'

class App {
	bot: Eris.Client
	commands: TextCommand[]
	slashCreator: SlashCreator
	componentCollector: ComponentCollector
	msgCollector: MessageCollector
	cronJobs: CronJobs
	activeRaids: {
		userID: string
		timeout: NodeJS.Timeout
	}[]
	/**
	 * IDs of users who are currently evacuating a raid. Used to prevent them from using other command while
	 * in the process of evacuating.
	 */
	extractingUsers: Set<string>
	acceptingCommands: boolean
	npcHandler: NPCHandler
	/**
	 * The current multiplier for selling items to the shop (changes every hour)
	 */
	shopSellMultiplier: number
	tutorialHandler: TutorialHandler

	constructor (token: string, options: Eris.ClientOptions) {
		if (!clientId) {
			throw new Error('BOT_CLIENT_ID not defined in .env file')
		}

		this.bot = new Eris.Client(token, options)
		this.commands = []
		this.slashCreator = new SlashCreator({
			applicationID: clientId,
			token: botToken,
			handleCommandsManually: true,
			allowedMentions: {
				roles: false,
				users: true,
				everyone: false
			}
		})
		this.componentCollector = new ComponentCollector(this)
		this.msgCollector = new MessageCollector(this)
		this.cronJobs = new CronJobs(this)
		this.activeRaids = []
		this.acceptingCommands = false
		this.npcHandler = new NPCHandler(this)
		this.shopSellMultiplier = getRandomInt(90, 110) / 100
		this.extractingUsers = new Set()
		this.tutorialHandler = new TutorialHandler(this)
	}

	async launch (): Promise<void> {
		const botEventFiles = fs.readdirSync(path.join(__dirname, '/events'))

		// load all commands to array
		this.commands = await this.loadCommands()

		// start cron jobs
		this.cronJobs.start()

		// start slash creator, used for handling interactions
		this.slashCreator.withServer(
			new GatewayServer(
				handler => this.bot.on('rawWS', packet => {
					if (packet.t === 'INTERACTION_CREATE') {
						handler(packet.d as AnyRequestData)
					}
				})
			)
		)

		await this.loadSlashCommmands()

		// handling slash commands manually so I can filter them through my custom command handler
		this.slashCreator.on('commandInteraction', (i, res, webserverMode) => {
			if (!this.acceptingCommands) {
				return res({
					status: 200,
					body: {
						type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content: `${icons.danger} The bot is currently restarting. Try using this command again in a minute or two...`,
							flags: InteractionResponseFlags.EPHEMERAL
						}
					}
				})
			}

			const command = this._getCommandFromInteraction(i)

			if (!command) {
				return res({
					status: 200,
					body: {
						type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content: `${icons.danger} That command was recently removed.`,
							flags: InteractionResponseFlags.EPHEMERAL
						}
					}
				})
			}

			const ctx = new CommandContext(this.slashCreator, i, res, webserverMode, command.deferEphemeral)

			return this._handleSlashCommand(command, ctx)
		})

		// add users who use slash commands to the eris cache if they aren't already
		// this helps prevent API calls to fetch users
		this.slashCreator.on('rawInteraction', i => {
			if (i.type === InteractionType.COMMAND) {
				const data = i as any
				let user

				if ('guild_id' in data) {
					user = data.member.user
				}
				else {
					user = data.user
				}

				// check if user is not in eris cache, and
				// add user to eris cache if not
				if (!this.bot.users.has(user.id)) {
					const erisUser = new User(user, this.bot)

					this.bot.users.add(erisUser, this.bot)
				}
			}
		})

		this.slashCreator.on('debug', msg => {
			logger.debug(msg)
		})

		// load bot gateway events
		for (const event of botEventFiles) {
			const { run } = await import(`./events/${event}`)
			const eventName = event.replace(/.js|.ts/, '')

			if (eventName === 'ready') {
				// using .once here because the ready event is called every time the bot reconnects and we may have functions
				// inside the ready event that we want called only once.
				this.bot.once(eventName, run.bind(this))
			}
			else {
				this.bot.on(eventName, run.bind(this))
			}
		}

		this.bot.editStatus('online', {
			name: '/help',
			type: 0
		})

		logger.info('[APP] Listening for events')
		await this.bot.connect()
	}

	async loadCommands (): Promise<TextCommand[]> {
		const commandFiles = fs.readdirSync(path.join(__dirname, '/commands')).filter(file => file.endsWith('.js') || file.endsWith('.ts'))
		const commandsArr: TextCommand[] = []

		for (const file of commandFiles) {
			try {
				// remove command file cache so you can reload commands while bot is running: eval app.commands = app.loadCommands();
				delete require.cache[require.resolve(`./commands/${file}`)]
			}
			catch (err) {
				logger.warn(err)
			}

			const { command }: { command: TextCommand } = await import(`./commands/${file}`)

			commandsArr.push(command)
		}

		return commandsArr
	}

	async loadSlashCommmands (): Promise<void> {
		const botCommandFiles = fs.readdirSync(path.join(__dirname, '/slash-commands'))
		const commands = []

		for (const file of botCommandFiles) {
			if (file.endsWith('.js')) {
				const command = await import(`./slash-commands/${file}`)

				commands.push(new command.default(this.slashCreator, this))
			}
			else {
				const directory = fs.readdirSync(path.join(__dirname, `/slash-commands/${file}`)).filter(f => f.endsWith('.js'))

				for (const subFile of directory) {
					const command = await import(`./slash-commands/${file}/${subFile}`)

					commands.push(new command.default(this.slashCreator, this))
				}
			}
		}

		this.slashCreator
			.registerCommands(commands)
			.syncCommands()
	}

	/**
	 * Used to fetch a user from cache if possible, or makes an API call if not
	 * @param userID ID of user to fetch
	 * @returns A user object
	 */
	async fetchUser (userID: string): Promise<User | undefined> {
		let user = this.bot.users.get(userID)

		if (user) {
			return user
		}

		try {
			// fetch user using api call
			user = await this.bot.getRESTUser(userID)

			if (user) {
				// add fetched user to bots cache
				this.bot.users.add(user)

				return user
			}
		}
		catch (err) {
			logger.error(err)
		}
	}

	/**
	 * Fetches a member from a guilds cache if possible, or makes an API call if not
	 * @param guild Guild to check for member in
	 * @param userID ID of user to get member object of
	 * @returns A guild member object
	 */
	async fetchMember (guild: Guild, userID: string): Promise<Member | undefined> {
		let member = guild.members.get(userID)

		if (member) {
			return member
		}

		try {
			await guild.fetchAllMembers()

			member = guild.members.get(userID)

			if (member) {
				return member
			}
		}
		catch (err) {
			logger.error(err)
		}
	}

	async loadRaidTimers (): Promise<void> {
		const activeRaids = await getAllRaids(query)

		for (const row of activeRaids) {
			const guild = this.bot.guilds.get(row.guildId)

			if (guild) {
				const timeLeft = getCooldownTimeLeft(row.length, row.startedAt.getTime())
				const raidType = getRaidType(row.guildId)

				if (!raidType || timeLeft <= 0) {
					// raid ended while the bot was offline, dont remove items from users backpack since bot was offline
					await removeUserFromRaid(query, row.userId)

					try {
						await guild.kickMember(row.userId, 'Raid expired while bot was offline')
					}
					catch (err) {
						// user not in raid server
					}
				}
				else {
					logger.info(`Starting raid timer for ${row.userId} which will expire in ${formatTime(timeLeft)}`)

					this.activeRaids.push({
						userID: row.userId,
						timeout: setTimeout(async () => {
							try {
								const erisUser = await this.fetchUser(row.userId)
								const transaction = await beginTransaction()
								await getUsersRaid(transaction.query, row.userId, true)
								await getUserBackpack(transaction.query, row.userId, true)
								await removeUserFromRaid(transaction.query, row.userId)
								await createCooldown(transaction.query, row.userId, `raid-${raidType.id}`, raidCooldown)

								// remove items from backpack since user didn't evac
								await removeAllItemsFromBackpack(transaction.query, row.userId)
								await transaction.commit()

								await guild.kickMember(row.userId, 'Raid time ran out')
								if (erisUser) {
									await messageUser(erisUser, {
										content: `${icons.danger} Raid failed!\n\n` +
											'You spent too long in the raid and ran out of time to evac! Next time make sure you have enough time to find an evac and escape the raid.\n' +
											'You lost all the items in your inventory.'
									})
								}
							}
							catch (err) {
								logger.error(err)
								// unable to kick user?
							}
						}, timeLeft)
					})
				}
			}
		}
	}

	clearRaidTimer (userID: string): void {
		// backwards loop prevents splice from messing with the index
		for (let i = this.activeRaids.length - 1; i >= 0; i--) {
			if (this.activeRaids[i].userID === userID) {
				logger.info(`Clearing raid timer for ${userID}`)
				clearTimeout(this.activeRaids[i].timeout)
				this.activeRaids.splice(i, 1)
			}
		}
	}

	private _getCommandFromInteraction (interaction: InteractionRequestData): CustomSlashCommand | undefined {
		// blatantly taken from the slash-create library since the function is marked as private
		return 'guild_id' in interaction ?
			this.slashCreator.commands.find(command =>
				!!(command.guildIDs &&
				command.guildIDs.includes(interaction.guild_id) &&
				command.commandName === interaction.data.name)) as CustomSlashCommand | undefined ||
				this.slashCreator.commands.get(`global:${interaction.data.name}`) as CustomSlashCommand | undefined :
			this.slashCreator.commands.get(`global:${interaction.data.name}`) as CustomSlashCommand | undefined
	}

	private async _handleSlashCommand (command: CustomSlashCommand, ctx: CommandContext) {
		try {
			let userLeveledUpMessage

			if (command.customOptions.category === 'admin' && !adminUsers.includes(ctx.user.id)) {
				return ctx.send({
					content: `${icons.danger} You don't have permission to run that command.`,
					flags: InteractionResponseFlags.EPHEMERAL
				})
			}

			else if (command.commandName !== 'heal' && this.extractingUsers.has(ctx.user.id)) {
				return ctx.send({
					content: `${icons.warning} You cannot use that command while extracting!`,
					flags: InteractionResponseFlags.EPHEMERAL
				})
			}

			// command was run in a server
			else if (ctx.guildID) {
				const userData = await getUserRow(query, ctx.user.id)

				// check if user has manage server permission before running GuildModCommand
				if (command.customOptions.guildModsOnly && (!ctx.member || !ctx.member.permissions.has(Constants.Permissions.manageGuild))) {
					return ctx.send({
						content: `${icons.danger} You need the \`Manage Server\` permission to use this command!`,
						flags: InteractionResponseFlags.EPHEMERAL
					})
				}

				else if (command.customOptions.onlyWorksInRaidGuild && !isRaidGuild(ctx.guildID)) {
					return ctx.send({
						content: `${icons.danger} That command can **ONLY** be used in a raid. Join a raid with the \`raid\` command.`,
						flags: InteractionResponseFlags.EPHEMERAL
					})
				}

				// create account if user does not have one
				else if (!userData) {
					await createAccount(query, ctx.user.id)

					const batRow = await createItem(query, items.wooden_bat.name, items.wooden_bat.durability)
					const bandageRow = await createItem(query, items.bandage.name, items.bandage.durability)

					await addItemToBackpack(query, ctx.user.id, batRow.id)
					await addItemToBackpack(query, ctx.user.id, bandageRow.id)

					// start tutorial
					this.tutorialHandler.tutorialUsers.set(ctx.user.id, 0)

					// send welcome DM
					const erisUser = await this.fetchUser(ctx.user.id)
					if (erisUser) {
						messageUser(erisUser, {
							content: '**Welcome to `project z???`**\n\n' +
								'You are a scavenger just trying to survive in the middle of an apocalypse. You need to explore areas and collect as much loot as you can all while ' +
								'making sure you aren\'t killed. It\'s survival of the fittest, other scavengers will try to kill you for your loot. You need to find weapons and armor ' +
								'to protect yourself with. Scavengers aren\'t the only thing trying to get you though, watch out for walkers and heavily armed raiders.\n\n' +
								'You have a `stash` and an `inventory` for your items. Whenever you enter a **raid**, you will take all the items in your `inventory` with you. ' +
								'I would highly recommend taking a weapon with you to protect yourself with. **If you die while in raid, you will lose all the items in your inventory.** ' +
								'This could also work in your favor, if you kill another player you can steal everything they had in their inventory for yourself. ' +
								'Once you are finished looting in a raid, you need to find a channel to **evac** from. Channels that have an evac will typically have it in the name: ex. `backwoods-evac`.\n\n' +
								`I've put some items in your \`inventory\` to help you get started: **1x** ${getItemDisplay(items.wooden_bat)}, **1x** ${getItemDisplay(items.bandage)}\n\n` +
								'Once you\'re ready to enter a raid, use the `raid` command. **Good luck!** - 💙 blobfysh'
						})
					}
				}

				else {
					// check if user has enough xp to level up
					let playerXp = getPlayerXp(userData.xp, userData.level)
					let newLevel = userData.level

					// check if user levels up multiple times (prevents sending multiple level-up messages)
					while (playerXp.xpUntilLevelUp <= 0) {
						newLevel += 1
						playerXp = getPlayerXp(userData.xp, newLevel)
					}

					if (userData.level !== newLevel) {
						const newMaxHealth = 100 + ((newLevel - 1) * 5)
						const newStashSlots = 15 + ((newLevel - 1) * 5)
						await increaseLevel(query, ctx.user.id, newLevel - userData.level)
						await setMaxHealth(query, ctx.user.id, newMaxHealth)
						await setStashSlots(query, ctx.user.id, newStashSlots)

						userLeveledUpMessage = `**You leveled up!** (Lvl **${userData.level}** → **${newLevel}**)` +
							`\n\n💗 Max Health: **${newMaxHealth - 5}** → **${newMaxHealth}** HP` +
							`\n💼 Stash Space: **${newStashSlots - 5}** → **${newStashSlots}** slots`
					}
				}
			}

			// non-worksInDMs command cannot be used in DM channel
			else if (!command.customOptions.worksInDMs) {
				return ctx.send({
					content: `${icons.warning} That command cannot be used in DMs.`,
					flags: InteractionResponseFlags.EPHEMERAL
				})
			}

			if (!command.customOptions.canBeUsedInRaid && (isRaidGuild(ctx.guildID) || await userInRaid(query, ctx.user.id))) {
				return ctx.send({
					content: `${icons.warning} That command cannot be used while you are in an active raid! You need to evac to finish the raid (dying also works).`,
					flags: InteractionResponseFlags.EPHEMERAL
				})
			}

			// defer response before running command since command may take time to execute
			if (!command.customOptions.noDefer) {
				await ctx.defer(command.deferEphemeral)
			}

			logger.info(`Command (${command.commandName}) run by ${ctx.user.username}#${ctx.user.discriminator} (${ctx.user.id}) in ${ctx.guildID ? `guild (${ctx.guildID})` : 'DMs'}`)
			await command.run(ctx)

			try {
				await this.tutorialHandler.handle(command, ctx)
			}
			catch (err) {
				logger.error(err)
			}

			// reminds users to use raidtime command to check how much time they have left in raid,
			// it doesn't send the time in this message because I want players raidtime to be kept private from other players
			if (isRaidGuild(ctx.guildID) && command.commandName !== 'raidtime') {
				try {
					const raidTimeReminderCD = await getCooldown(query, ctx.user.id, 'raidreminder')

					if (!raidTimeReminderCD) {
						const userRaid = await getUsersRaid(query, ctx.user.id)

						if (userRaid) {
							const timeLeft = getCooldownTimeLeft(userRaid.length, userRaid.startedAt.getTime())

							// send alert if 5 minutes remaining and there's at least 30 seconds so user can evac
							if (timeLeft <= 5 * 60 * 1000 && timeLeft > 30 * 1000) {
								await createCooldown(query, ctx.user.id, 'raidreminder', 3 * 60)

								try {
									await ctx.sendFollowUp({
										content: `${icons.warning} You have **${formatTime(timeLeft)}** to find an evac and escape from this raid. You should start looking for an evac channel now.`,
										flags: InteractionResponseFlags.EPHEMERAL
									})
								}
								catch (err) {
									logger.warn(err)
								}
							}
						}
					}
				}
				catch (err) {
					logger.error(err)
				}
			}

			// send level up message as a follow up after user uses command
			if (userLeveledUpMessage) {
				try {
					await ctx.sendFollowUp({
						content: userLeveledUpMessage,
						flags: InteractionResponseFlags.EPHEMERAL
					})
				}
				catch (err) {
					logger.warn(err)
				}
			}
		}
		catch (err) {
			logger.error(err)
			await ctx.send({
				content: 'Command failed to execute... If this keeps happening please let a bot dev know!!',
				flags: InteractionResponseFlags.EPHEMERAL
			})
		}
	}
}

export default App
