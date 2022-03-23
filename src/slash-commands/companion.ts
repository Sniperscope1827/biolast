import { SlashCreator, CommandContext, Message, ComponentType, User, ComponentActionRow, ButtonStyle, CommandOptionType, ComponentSelectMenu } from 'slash-create'
import App from '../app'
import { icons } from '../config'
import CustomSlashCommand from '../structures/CustomSlashCommand'
import Embed from '../structures/Embed'
import { beginTransaction, query } from '../utils/db/mysql'
import { getUserRow, removeMoney } from '../utils/db/players'
import { formatMoney, formatNumber, formatRedBar, formatXP } from '../utils/stringUtils'
import { addStress, addXp, createCompanion, deleteCompanion, getCompanionRow, increaseFetches, increaseLevel, increaseSkill, increaseSkillPoints, lowerHunger, lowerSkillPoints, lowerStress, resetSkills, setFetching } from '../utils/db/companions'
import { Companion, companions } from '../resources/companions'
import { getCompanionDisplay, getCompanionXp, getFetchTime, getProtectionChance } from '../utils/companionUtils'
import { clearCooldown, createCooldown, formatTime, getCooldown } from '../utils/db/cooldowns'
import { BLUE_BUTTON, GRAY_BUTTON, GREEN_BUTTON, NEXT_BUTTON, PREVIOUS_BUTTON, RED_BUTTON } from '../utils/constants'
import { addItemToBackpack, createItem, deleteItem, getUserBackpack, getUserStash, lowerItemDurability } from '../utils/db/items'
import { backpackHasSpace, getItemDisplay, getItemNameDisplay, getItems, sortItemsByName } from '../utils/itemUtils'
import { logger } from '../utils/logger'
import { CompanionRow, ItemRow, ItemWithRow } from '../types/mysql'
import { allItems } from '../resources/items'
import { disableAllComponents } from '../utils/messageUtils'
import { ResolvedMember } from 'slash-create/lib/structures/resolvedMember'
import { Food, Item } from '../types/Items'
import getRandomInt from '../utils/randomInt'

const ITEMS_PER_PAGE = 10
// how much xp companion receives when played with
const XP_PER_PLAY = 15
// how much xp companion receives when completed fetch
const XP_PER_FETCH = 50

const sortedCompanions = companions.sort((a, b) => a.price - b.price)
const hireMenu: ComponentActionRow[] = [{
	type: ComponentType.ACTION_ROW,
	components: [
		{
			type: ComponentType.SELECT,
			custom_id: 'hire',
			placeholder: 'Hire a companion:',
			options: sortedCompanions.map(c => {
				const iconID = c.icon.match(/:([0-9]*)>/)

				return {
					label: c.name,
					value: c.name,
					description: `Costs ${formatMoney(c.price, false)}. Can be upgraded ${c.maxUpgrades} times.`,
					emoji: iconID ? {
						id: iconID[1],
						name: c.name
					} : undefined
				}
			})
		}
	]
}]

class CompanionCommand extends CustomSlashCommand<'companion'> {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'companion',
			description: 'View your companion stats, assign them to a fetch mission, or complete their fetch mission.',
			longDescription: 'View your companion stats, assign them to a fetch mission, or complete their fetch mission.',
			options: [{
				type: CommandOptionType.USER,
				name: 'user',
				description: 'User to view companion of.',
				required: false
			}],
			category: 'scavenging',
			guildModsOnly: false,
			worksInDMs: false,
			worksDuringDuel: false,
			guildIDs: [],
			starterTip: 'You can hire a companion to help you survive the apocalypse. When you have a companion, you\'ll need to feed and take care' +
				' of them. In return, they will fetch random items for you. Companions also have their own skills that can be upgraded' +
				' as they level up.\n\nWith proper care, companions could find you the best gear possible.'
		})

		this.filePath = __filename
	}

	async run (ctx: CommandContext): Promise<void> {
		const member = ctx.members.get(ctx.options.user)

		if (member && member.id !== ctx.user.id) {
			const userData = await getUserRow(query, member.id)

			if (!userData) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** does not have an account!`
				})
				return
			}

			const preCompanionRow = await getCompanionRow(query, member.id)
			const preCompanion = companions.find(c => c.name === preCompanionRow?.type)

			if (!preCompanionRow || !preCompanion) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** does not have a companion!`
				})
				return
			}

			const preCompanionFetchCD = await getCooldown(query, member.id, 'companion-fetch')
			const companionEmbed = this.getCompanionEmbed(member, preCompanion, preCompanionRow, preCompanionFetchCD, false)
			const components: ComponentActionRow[] = [{
				type: ComponentType.ACTION_ROW,
				components: [
					GRAY_BUTTON('Play', 'play')
				]
			}]
			const companionMessage = await ctx.send({
				embeds: [companionEmbed.embed],
				components
			}) as Message

			const { collector, stopCollector } = this.app.componentCollector.createCollector(companionMessage.id, c => c.user.id === ctx.user.id, 100000)

			collector.on('collect', async buttonCtx => {
				try {
					await buttonCtx.acknowledge()

					if (buttonCtx.customID === 'play') {
						const transaction = await beginTransaction()
						const companionRow = await getCompanionRow(transaction.query, member.id, true)
						const playCD = await getCooldown(transaction.query, ctx.user.id, 'other-companion-play', true)
						const companionFetchCD = await getCooldown(transaction.query, member.id, 'companion-fetch', true)

						if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
							await transaction.commit()
							stopCollector()

							await buttonCtx.editParent({
								content: `${icons.cancel} **${member.displayName}** don't own this companion anymore.`,
								components: disableAllComponents(components)
							})
							return
						}
						else if (playCD) {
							await transaction.commit()

							await buttonCtx.send({
								content: `${icons.timer} You recently played with someone else's companion.` +
									` You will have to wait **${playCD}**.`,
								ephemeral: true
							})
							return
						}
						else if (companionRow.stress <= 0) {
							await transaction.commit()

							await buttonCtx.send({
								content: `${icons.cancel} ${getCompanionDisplay(preCompanion, companionRow, true)} is not stressed!` +
									' You should only play with companions when they are stressed.',
								ephemeral: true
							})
							return
						}

						const maxHeal = Math.min(companionRow.stress, 10)

						await createCooldown(transaction.query, ctx.user.id, 'other-companion-play', 5 * 60)

						if (maxHeal > 0) {
							await lowerStress(transaction.query, member.id, maxHeal)
						}

						companionRow.stress -= maxHeal

						await transaction.commit()

						await buttonCtx.editParent({
							content: `${icons.checkmark} You play with ${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}**! Their stress lowers from **${companionRow.stress + maxHeal}** to **${companionRow.stress}**.`,
							embeds: [this.getCompanionEmbed(member, preCompanion, companionRow, companionFetchCD, false).embed]
						})
					}
				}
				catch (err) {
					logger.warn(err)
					stopCollector()
					await buttonCtx.editParent({
						content: `${icons.cancel} There was an error trying to interact with this companion. Try running the command again.`,
						components: []
					})
				}
			})

			collector.on('end', async msg => {
				try {
					if (msg === 'time') {
						await ctx.editOriginal({
							content: 'Buttons timed out.',
							components: disableAllComponents(components)
						})
					}
				}
				catch (err) {
					logger.error(err)
				}
			})
			return
		}

		const preTransaction = await beginTransaction()
		const preCompanionRow = await getCompanionRow(preTransaction.query, ctx.user.id, true)
		const preCompanionFetchCD = await getCooldown(preTransaction.query, ctx.user.id, 'companion-fetch', true)
		let preCompanion = companions.find(c => c.name === preCompanionRow?.type)
		let companionMessage
		let components: ComponentActionRow[]

		if (!preCompanionRow || !preCompanion) {
			await preTransaction.commit()

			components = [{
				type: ComponentType.ACTION_ROW,
				components: [GRAY_BUTTON('Hire a Companion', 'view-companions')]
			}]
			companionMessage = await ctx.send({
				content: `${icons.warning} You don't have a companion. Would you like to view companions available to hire?`,
				components
			}) as Message
		}

		// companion reached max hunger
		else if (preCompanionRow.hunger >= 100) {
			if (preCompanionFetchCD) {
				await clearCooldown(preTransaction.query, ctx.user.id, 'companion-fetch')
			}

			await deleteCompanion(preTransaction.query, ctx.user.id)
			await preTransaction.commit()

			components = [{
				type: ComponentType.ACTION_ROW,
				components: [GRAY_BUTTON('Hire a Companion', 'view-companions')]
			}]
			companionMessage = await ctx.send({
				content: `**${getCompanionDisplay(preCompanion, preCompanionRow, true)} got too hungry and ran away!** Make sure you feed your companions to prevent this from happening.`,
				components
			}) as Message
		}

		// no issues, send normal companion menu
		else {
			await preTransaction.commit()

			const companionEmbed = this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, preCompanionRow, preCompanionFetchCD)
			components = [{
				type: ComponentType.ACTION_ROW,
				components: [
					preCompanionRow.fetching ? GREEN_BUTTON('Complete Fetch Mission', 'fetch-complete') : BLUE_BUTTON('Send Companion on Fetch Mission', 'fetch'),
					GRAY_BUTTON('Play', 'play'),
					GRAY_BUTTON('Feed', 'feed'),
					{
						type: ComponentType.BUTTON,
						label: 'Upgrade Skills',
						custom_id: 'upgrade',
						style: ButtonStyle.SECONDARY,
						emoji: {
							name: 'Upgrade Skills',
							id: icons.button_icons.upgrade_skills_icon
						}
					},
					RED_BUTTON('Abandon', 'abandon')
				]
			}]
			companionMessage = await ctx.send({
				embeds: [companionEmbed.embed],
				components
			}) as Message
		}

		const { collector, stopCollector } = this.app.componentCollector.createCollector(companionMessage.id, c => c.user.id === ctx.user.id, 100000)
		let companionToHire: Companion | undefined

		collector.on('collect', async buttonCtx => {
			try {
				await buttonCtx.acknowledge()

				if (buttonCtx.customID === 'view-companions') {
					const companionsEmbed = new Embed()
						.setTitle('Available Companions')
						.setDescription(sortedCompanions.map(c => `${c.icon} **${getCompanionDisplay(c)}** - ${formatMoney(c.price)} copper`).join('\n'))
						.setFooter('The more expensive the companion, the more their skills can be upgraded and the more resilient they are to stress.')

					components = hireMenu
					await buttonCtx.editParent({
						content: 'Who would you like to hire?',
						embeds: [companionsEmbed.embed],
						components
					})
				}
				else if (buttonCtx.customID === 'hire') {
					const companionRow = await getCompanionRow(query, ctx.user.id, true)

					if (companionRow) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You already own a companion!`,
							components: disableAllComponents(components)
						})
						return
					}

					const companion = companions.find(c => c.name === buttonCtx.values[0])

					if (!companion) {
						await buttonCtx.editParent({
							content: `${icons.danger} Could not find that companion. Try again? lol???`
						})
						return
					}

					companionToHire = companion
					components = [{
						type: ComponentType.ACTION_ROW,
						components: [GREEN_BUTTON('Hire', 'hire-confirm'), RED_BUTTON('Cancel', 'hire-cancel')]
					}]
					await buttonCtx.editParent({
						content: `Hire ${companionToHire.icon} **${getCompanionDisplay(companionToHire)}** for **${formatMoney(companion.price)}**?`,
						components
					})
				}
				else if (buttonCtx.customID === 'hire-confirm') {
					const transaction = await beginTransaction()
					const userData = (await getUserRow(transaction.query, ctx.user.id, true))!
					let companionRow = await getCompanionRow(transaction.query, ctx.user.id, true)

					if (companionRow) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You already own a companion!`,
							components: disableAllComponents(components)
						})
						return
					}
					else if (!companionToHire) {
						await transaction.commit()

						components = hireMenu
						await buttonCtx.editParent({
							content: `${icons.danger} Could not find that companion. Try again? lol???`,
							components
						})
						return
					}
					else if (userData.money < companionToHire.price) {
						await transaction.commit()

						components = hireMenu
						await buttonCtx.editParent({
							content: `${icons.danger} You don't have enough copper to hire ${companionToHire.icon} **${getCompanionDisplay(companionToHire)}**. You need **${formatMoney(companionToHire.price)}** but you only have **${formatMoney(userData.money)}**.`,
							components
						})
						return
					}

					companionRow = await createCompanion(transaction.query, ctx.user.id, companionToHire.name)
					preCompanion = companionToHire
					await removeMoney(transaction.query, ctx.user.id, companionToHire.price)
					await transaction.commit()

					const companionEmbed = this.getCompanionEmbed(ctx.member || ctx.user, companionToHire, companionRow)
					components = [{
						type: ComponentType.ACTION_ROW,
						components: [
							BLUE_BUTTON('Send Companion on Fetch Mission', 'fetch'),
							GRAY_BUTTON('Play', 'play'),
							GRAY_BUTTON('Feed', 'feed'),
							{
								type: ComponentType.BUTTON,
								label: 'Upgrade Skills',
								custom_id: 'upgrade',
								style: ButtonStyle.SECONDARY,
								emoji: {
									name: 'Upgrade Skills',
									id: icons.button_icons.upgrade_skills_icon
								}
							},
							RED_BUTTON('Abandon', 'abandon')
						]
					}]
					await buttonCtx.editParent({
						content: `${icons.checkmark} Hired ${companionToHire.icon} **${getCompanionDisplay(companionToHire)}** for **${formatMoney(companionToHire.price)}**!` +
							` You now have **${formatMoney(userData.money - companionToHire.price)}** copper.`,
						components,
						embeds: [companionEmbed.embed]
					})
				}
				else if (buttonCtx.customID === 'hire-cancel') {
					components = hireMenu
					await buttonCtx.editParent({
						content: `${icons.checkmark} Purchase canceled.`,
						components
					})
				}
				else if (buttonCtx.customID === 'abandon') {
					const companionRow = await getCompanionRow(query, ctx.user.id)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}

					components = [{
						type: ComponentType.ACTION_ROW,
						components: [GREEN_BUTTON('Confirm', 'abandon-confirm'), RED_BUTTON('Cancel', 'abandon-cancel')]
					}]
					await buttonCtx.editParent({
						content: `Are you really sure you want to abandon **${getCompanionDisplay(preCompanion, companionRow, true)}** (Lvl. **${companionRow.level}**)?`,
						embeds: [],
						components
					})
				}
				else if (buttonCtx.customID === 'abandon-confirm') {
					const transaction = await beginTransaction()
					const companionRow = await getCompanionRow(transaction.query, ctx.user.id, true)
					const userData = (await getUserRow(transaction.query, ctx.user.id, true))!

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}

					let moneyStolen

					await deleteCompanion(transaction.query, ctx.user.id)

					if (Math.random() < 0.5) {
						moneyStolen = Math.min(userData.money, getRandomInt(100, 500))
						await removeMoney(transaction.query, ctx.user.id, moneyStolen)
					}

					await transaction.commit()

					components = [{
						type: ComponentType.ACTION_ROW,
						components: [GRAY_BUTTON('Hire a new companion', 'view-companions')]
					}]

					if (moneyStolen) {
						await buttonCtx.editParent({
							content: `${icons.checkmark} **${getCompanionDisplay(preCompanion, companionRow, true)}** does not take the news lightly. They stole **${formatMoney(moneyStolen)}** copper from your stash before leaving!`,
							components
						})
					}
					else {
						await buttonCtx.editParent({
							content: `${icons.checkmark} You abandoned **${getCompanionDisplay(preCompanion, companionRow, true)}** 😭`,
							components
						})
					}
				}
				else if (buttonCtx.customID === 'abandon-cancel') {
					const companionRow = await getCompanionRow(query, ctx.user.id)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}

					const companionFetchCD = await getCooldown(query, ctx.user.id, 'companion-fetch')

					components = [{
						type: ComponentType.ACTION_ROW,
						components: [
							companionRow.fetching ? GREEN_BUTTON('Complete Fetch Mission', 'fetch-complete') : BLUE_BUTTON('Send Companion on Fetch Mission', 'fetch'),
							GRAY_BUTTON('Play', 'play'),
							GRAY_BUTTON('Feed', 'feed'),
							{
								type: ComponentType.BUTTON,
								label: 'Upgrade Skills',
								custom_id: 'upgrade',
								style: ButtonStyle.SECONDARY,
								emoji: {
									name: 'Upgrade Skills',
									id: icons.button_icons.upgrade_skills_icon
								}
							},
							RED_BUTTON('Abandon', 'abandon')
						]
					}]
					await buttonCtx.editParent({
						content: `${icons.checkmark} Abandonment canceled.`,
						embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow, companionFetchCD).embed],
						components
					})
				}
				else if (buttonCtx.customID === 'play') {
					const transaction = await beginTransaction()
					const companionRow = await getCompanionRow(transaction.query, ctx.user.id, true)
					const playCD = await getCooldown(transaction.query, ctx.user.id, 'self-companion-play', true)
					const companionFetchCD = await getCooldown(transaction.query, ctx.user.id, 'companion-fetch', true)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}
					else if (playCD) {
						await transaction.commit()

						await buttonCtx.send({
							content: `${icons.timer} You recently played with ${getCompanionDisplay(preCompanion, companionRow, true)}.` +
								` You will have to wait **${playCD}**.`,
							ephemeral: true
						})
						return
					}
					else if (companionRow.stress <= 0) {
						await transaction.commit()

						await buttonCtx.send({
							content: `${icons.cancel} ${getCompanionDisplay(preCompanion, companionRow, true)} is not stressed!` +
								' You should only play with your companion when they are stressed.',
							ephemeral: true
						})
						return
					}

					const maxHeal = Math.min(companionRow.stress, 10)
					const companionNewLevel = this.getCompanionLevel(companionRow.xp + XP_PER_PLAY, companionRow.level)
					let display = `${icons.checkmark} You play with ${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}**! They gained ${icons.xp_star}***+${XP_PER_PLAY}*** xp.`

					await createCooldown(transaction.query, ctx.user.id, 'self-companion-play', 2 * 60)
					await addXp(transaction.query, ctx.user.id, XP_PER_PLAY)

					if (maxHeal > 0) {
						await lowerStress(transaction.query, ctx.user.id, maxHeal)
					}

					if (companionRow.level !== companionNewLevel) {
						display += `\n\n**${getCompanionDisplay(preCompanion, companionRow, true)} leveled up!** (Lvl. **${companionRow.level}** → **${companionNewLevel}**)`
						await increaseLevel(transaction.query, ctx.user.id, companionNewLevel - companionRow.level)
						companionRow.skillPoints += companionNewLevel - companionRow.level
					}

					companionRow.level = companionNewLevel
					companionRow.xp += XP_PER_PLAY
					companionRow.stress -= maxHeal

					await transaction.commit()

					await buttonCtx.editParent({
						content: display,
						embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow, companionFetchCD).embed]
					})
				}
				else if (buttonCtx.customID === 'feed') {
					const companionRow = await getCompanionRow(query, ctx.user.id)
					const preBackpackRows = await getUserBackpack(query, ctx.user.id)
					const preStashRows = await getUserStash(query, ctx.user.id)
					const preBackpack = getItems(preBackpackRows)
					const preStash = getItems(preStashRows)
					const foodItems = [...preBackpack.items, ...preStash.items].filter(i => i.item.type === 'Food') as ItemWithRow<ItemRow, Food>[]

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}
					else if (!foodItems.length) {
						await buttonCtx.send({
							content: `${icons.cancel} You don't have any **Food** items in your inventory or stash that you can use. You can find food from scavenging or buy some from the \`market\`.`,
							ephemeral: true
						})
						return
					}

					const pages = this.generateItemPages(foodItems)
					let foodComponents: ComponentActionRow[] = []
					let page = 0

					if (pages[page].items.length) {
						foodComponents.push({
							type: ComponentType.ACTION_ROW,
							components: [
								{
									type: ComponentType.SELECT,
									custom_id: 'select',
									placeholder: 'Select food:',
									options: pages[0].items.map(i => {
										const iconID = i.item.icon.match(/:([0-9]*)>/)

										return {
											label: `[${i.row.id}] ${getItemNameDisplay(i.item, i.row)}`,
											value: i.row.id.toString(),
											description: `Reduces hunger by ${i.item.reducesHunger}. Gives ${i.item.xpGiven} XP`,
											emoji: iconID ? {
												id: iconID[1],
												name: i.item.name
											} : undefined
										}
									})
								}
							]
						})
					}

					if (pages.length > 1) {
						foodComponents.push({
							type: ComponentType.ACTION_ROW,
							components: [
								PREVIOUS_BUTTON(true),
								NEXT_BUTTON(false)
							]
						})
					}

					const foodMessage = await ctx.send({
						content: `What do you want to feed ${getCompanionDisplay(preCompanion, companionRow, true)}?`,
						embeds: [pages[page].page.embed],
						components: foodComponents
					}) as Message

					const foodCollector = this.app.componentCollector.createCollector(foodMessage.id, c => c.user.id === ctx.user.id, 20000)

					foodCollector.collector.on('collect', async foodCtx => {
						try {
							await foodCtx.acknowledge()

							foodComponents = []

							if (foodCtx.customID === 'previous' && page !== 0) {
								page--

								foodComponents.push({
									type: ComponentType.ACTION_ROW,
									components: [
										{
											type: ComponentType.SELECT,
											custom_id: 'select',
											placeholder: 'Select food:',
											options: pages[0].items.map(i => {
												const iconID = i.item.icon.match(/:([0-9]*)>/)

												return {
													label: `[${i.row.id}] ${getItemNameDisplay(i.item, i.row)}`,
													value: i.row.id.toString(),
													description: `Reduces hunger by ${i.item.reducesHunger}. Gives ${i.item.xpGiven} XP`,
													emoji: iconID ? {
														id: iconID[1],
														name: i.item.name
													} : undefined
												}
											})
										}
									]
								})

								components.push({
									type: ComponentType.ACTION_ROW,
									components: [
										PREVIOUS_BUTTON(page === 0),
										NEXT_BUTTON(false)
									]
								})

								await foodCtx.editParent({
									embeds: [pages[page].page.embed],
									components: foodComponents
								})
							}
							else if (foodCtx.customID === 'next' && page !== (pages.length - 1)) {
								page++

								foodComponents.push({
									type: ComponentType.ACTION_ROW,
									components: [
										{
											type: ComponentType.SELECT,
											custom_id: 'select',
											placeholder: 'Select food:',
											options: pages[0].items.map(i => {
												const iconID = i.item.icon.match(/:([0-9]*)>/)

												return {
													label: `[${i.row.id}] ${getItemNameDisplay(i.item, i.row)}`,
													value: i.row.id.toString(),
													description: `Reduces hunger by ${i.item.reducesHunger}. Gives ${i.item.xpGiven} XP`,
													emoji: iconID ? {
														id: iconID[1],
														name: i.item.name
													} : undefined
												}
											})
										}
									]
								})

								components.push({
									type: ComponentType.ACTION_ROW,
									components: [
										PREVIOUS_BUTTON(false),
										NEXT_BUTTON(page === (pages.length - 1))
									]
								})

								await foodCtx.editParent({
									embeds: [pages[page].page.embed],
									components: foodComponents
								})
							}
							else if (foodCtx.customID === 'select') {
								const food = pages[page].items.find(i => i.row.id.toString() === foodCtx.values[0])

								if (!food) {
									foodCollector.stopCollector()
									await foodCtx.editParent({
										content: `${icons.danger} Could not find that food item. Try again???`,
										components: disableAllComponents(foodComponents)
									})
									return
								}

								const transaction = await beginTransaction()
								const companionRowV = await getCompanionRow(transaction.query, ctx.user.id, true)

								if (!companionRowV || !preCompanion || companionRowV.type !== preCompanion.name) {
									await transaction.commit()
									foodCollector.stopCollector()

									await foodCtx.editParent({
										content: `${icons.cancel} You don't own this companion anymore.`,
										components: disableAllComponents(foodComponents)
									})
									return
								}

								const backpackRows = await getUserBackpack(transaction.query, ctx.user.id, true)
								const stashRows = await getUserStash(transaction.query, ctx.user.id, true)
								const companionFetchCD = await getCooldown(transaction.query, ctx.user.id, 'companion-fetch', true)
								const userBackpack = getItems(backpackRows)
								const userStash = getItems(stashRows)
								const foundItem = (userBackpack.items.find(itm => itm.row.id === food.row.id) || userStash.items.find(itm => itm.row.id === food.row.id)) as ItemWithRow<ItemRow, Food>

								if (!foundItem) {
									await transaction.commit()

									await foodCtx.editParent({
										content: `${icons.danger} You no longer own ${getItemDisplay(food.item, food.row, { showEquipped: false, showDurability: false })}. Did you sell it or something??`
									})
									return
								}

								const maxHeal = Math.min(companionRowV.hunger, foundItem.item.reducesHunger)
								const companionNewLevel = this.getCompanionLevel(companionRowV.xp + foundItem.item.xpGiven, companionRowV.level)
								let display = `${icons.checkmark} You fed ${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRowV, true)}** your ${getItemDisplay(foundItem.item)}. They gained ${icons.xp_star}***+${foundItem.item.xpGiven}*** xp!`

								if (!foundItem.row.durability || foundItem.row.durability - 1 <= 0) {
									await deleteItem(transaction.query, foundItem.row.id)
								}
								else {
									display += ` Your ${getItemDisplay(foundItem.item, foundItem.row, { showDurability: false })} has **${foundItem.row.durability - 1}** uses left.`
									await lowerItemDurability(transaction.query, foundItem.row.id, 1)
								}

								if (companionRowV.level !== companionNewLevel) {
									display += `\n\n**${getCompanionDisplay(preCompanion, companionRowV, true)} leveled up!** (Lvl. **${companionRowV.level}** → **${companionNewLevel}**)`
									await increaseLevel(transaction.query, ctx.user.id, companionNewLevel - companionRowV.level)
									companionRowV.skillPoints += companionNewLevel - companionRowV.level
								}

								companionRowV.level = companionNewLevel
								companionRowV.xp += foundItem.item.xpGiven
								companionRowV.hunger -= maxHeal

								if (maxHeal > 0) {
									await lowerHunger(transaction.query, ctx.user.id, maxHeal)
								}

								await addXp(transaction.query, ctx.user.id, foundItem.item.xpGiven)
								await transaction.commit()
								foodCollector.stopCollector()

								await foodMessage.delete()
								await buttonCtx.editParent({
									content: display,
									embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRowV, companionFetchCD).embed]
								})
							}
						}
						catch (err) {
							// continue
						}
					})

					foodCollector.collector.on('end', async msg => {
						try {
							if (msg === 'time') {
								await foodMessage.delete()
							}
						}
						catch (err) {
							logger.warn(err)
						}
					})
				}
				else if (buttonCtx.customID === 'fetch') {
					const transaction = await beginTransaction()
					const companionRow = await getCompanionRow(transaction.query, ctx.user.id, true)
					const companionFetchCD = await getCooldown(transaction.query, ctx.user.id, 'companion-fetch', true)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}
					else if (companionRow.fetching && companionFetchCD) {
						await transaction.commit()

						components = [{
							type: ComponentType.ACTION_ROW,
							components: [
								GREEN_BUTTON('Complete Fetch Mission', 'fetch-complete'),
								GRAY_BUTTON('Play', 'play'),
								GRAY_BUTTON('Feed', 'feed'),
								{
									type: ComponentType.BUTTON,
									label: 'Upgrade Skills',
									custom_id: 'upgrade',
									style: ButtonStyle.SECONDARY,
									emoji: {
										name: 'Upgrade Skills',
										id: icons.button_icons.upgrade_skills_icon
									}
								},
								RED_BUTTON('Abandon', 'abandon')
							]
						}]

						await buttonCtx.editParent({
							embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow, companionFetchCD).embed],
							components
						})
						await buttonCtx.send({
							content: `${icons.cancel} Your companion is already fetching.`,
							ephemeral: true
						})
						return
					}
					else if (companionRow.stress >= 100 / 2) {
						await transaction.commit()

						await buttonCtx.send({
							content: `${icons.cancel} ${getCompanionDisplay(preCompanion, companionRow, true)} is too stressed!` +
								` Your companion must have less than **${100 / 2}** (50%) stress to be sent on a fetch mission.` +
								' Play with your companion to lower stress.',
							ephemeral: true
						})
						return
					}

					await setFetching(transaction.query, ctx.user.id, true)
					await createCooldown(transaction.query, ctx.user.id, 'companion-fetch', getFetchTime(companionRow.agility))
					await transaction.commit()

					companionRow.fetching = 1

					components = [{
						type: ComponentType.ACTION_ROW,
						components: [
							GREEN_BUTTON('Complete Fetch Mission', 'fetch-complete'),
							GRAY_BUTTON('Play', 'play'),
							GRAY_BUTTON('Feed', 'feed'),
							{
								type: ComponentType.BUTTON,
								label: 'Upgrade Skills',
								custom_id: 'upgrade',
								style: ButtonStyle.SECONDARY,
								emoji: {
									name: 'Upgrade Skills',
									id: icons.button_icons.upgrade_skills_icon
								}
							},
							RED_BUTTON('Abandon', 'abandon')
						]
					}]

					await buttonCtx.editParent({
						embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow, formatTime(getFetchTime(companionRow.agility) * 1000)).embed],
						components
					})
					await buttonCtx.send({
						content: `${icons.checkmark} ${getCompanionDisplay(preCompanion, companionRow, true)} is now looking for an item to fetch you and will complete their mission in **${formatTime(getFetchTime(companionRow.agility) * 1000)}**.`,
						ephemeral: true
					})
				}
				else if (buttonCtx.customID === 'fetch-complete') {
					const transaction = await beginTransaction()
					const companionRow = await getCompanionRow(transaction.query, ctx.user.id, true)
					const companionFetchCD = await getCooldown(transaction.query, ctx.user.id, 'companion-fetch', true)
					const userData = (await getUserRow(transaction.query, ctx.user.id, true))!

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}
					else if (!companionRow.fetching) {
						await transaction.commit()

						if (companionFetchCD) {
							await clearCooldown(transaction.query, ctx.user.id, 'companion-fetch')
						}

						components = [{
							type: ComponentType.ACTION_ROW,
							components: [
								BLUE_BUTTON('Send Companion on Fetch Mission', 'fetch'),
								GRAY_BUTTON('Play', 'play'),
								GRAY_BUTTON('Feed', 'feed'),
								{
									type: ComponentType.BUTTON,
									label: 'Upgrade Skills',
									custom_id: 'upgrade',
									style: ButtonStyle.SECONDARY,
									emoji: {
										name: 'Upgrade Skills',
										id: icons.button_icons.upgrade_skills_icon
									}
								},
								RED_BUTTON('Abandon', 'abandon')
							]
						}]

						await buttonCtx.editParent({
							embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow).embed],
							components
						})
						await buttonCtx.send({
							content: `${icons.cancel} Your companion is not fetching anything.`,
							ephemeral: true
						})
						return
					}
					else if (companionFetchCD) {
						await transaction.commit()

						await buttonCtx.editParent({
							embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow, companionFetchCD).embed]
						})
						await buttonCtx.send({
							content: `${icons.cancel} Your companion still fetching. They will finish their fetch mission in about **${companionFetchCD}**.`,
							ephemeral: true
						})
						return
					}
					else if (userData.fighting) {
						await transaction.commit()

						await buttonCtx.send({
							content: `${icons.cancel} You are in a fight! You must finish your fight before you can claim these items.`,
							ephemeral: true
						})
						return
					}

					const backpackRows = await getUserBackpack(transaction.query, ctx.user.id, true)
					if (!backpackHasSpace(backpackRows, 0)) {
						await transaction.commit()

						await buttonCtx.send({
							content: `${icons.warning} You are overweight, you need to clear some space in your inventory before you can claim the items from your companion.`,
							ephemeral: true
						})
						return
					}

					const stressToAdd = Math.min(100 - companionRow.stress, preCompanion.stressPerFetch)
					const companionNewLevel = this.getCompanionLevel(companionRow.xp + XP_PER_FETCH, companionRow.level)
					const companionItemLevel = companionRow.perception + 1
					const companionItemsFound = companionRow.strength + 1
					const itemsFound: ItemWithRow<ItemRow>[] = []
					let possibleItems = allItems.filter(i => !i.cannotBeFetched && i.itemLevel <= companionItemLevel + 1 && i.itemLevel > companionItemLevel - 4)
					let loopI = 1
					let display = ''

					// expand the item pool if there aren't many possible items, ensures that companion will find different a variety of items
					while (possibleItems.length < 4 + companionItemsFound) {
						loopI++
						possibleItems = allItems.filter(i =>
							!i.cannotBeFetched &&
							i.itemLevel <= companionItemLevel + 1 &&
							i.itemLevel > companionItemLevel - (4 * loopI)
						)
					}

					for (let i = 0; i < companionItemsFound; i++) {
						const item = possibleItems[Math.floor(Math.random() * possibleItems.length)]
						const randomDurability = item.durability ? getRandomInt(Math.max(1, item.durability / 2), item.durability) : undefined

						// pseudo item row so that I dont need to create the items until user picks them
						itemsFound.push({
							item,
							row: {
								id: i,
								durability: randomDurability,
								item: item.name,
								itemCreatedAt: new Date()
							}
						})
					}

					if (companionRow.level !== companionNewLevel) {
						display += ` **${getCompanionDisplay(preCompanion, companionRow, true)} leveled up!** (Lvl. **${companionRow.level}** → **${companionNewLevel}**)`
						await increaseLevel(transaction.query, ctx.user.id, companionNewLevel - companionRow.level)
						companionRow.skillPoints += companionNewLevel - companionRow.level
					}

					await addStress(transaction.query, ctx.user.id, stressToAdd)
					await setFetching(transaction.query, ctx.user.id, false)
					await addXp(transaction.query, ctx.user.id, XP_PER_FETCH)
					await increaseFetches(transaction.query, ctx.user.id, 1)
					companionRow.xp += XP_PER_FETCH
					companionRow.level = companionNewLevel
					companionRow.stress += stressToAdd
					companionRow.fetching = 0
					companionRow.fetches += 1

					await transaction.commit()

					components = [{
						type: ComponentType.ACTION_ROW,
						components: [
							BLUE_BUTTON('Send Companion on Fetch Mission', 'fetch'),
							GRAY_BUTTON('Play', 'play'),
							GRAY_BUTTON('Feed', 'feed'),
							{
								type: ComponentType.BUTTON,
								label: 'Upgrade Skills',
								custom_id: 'upgrade',
								style: ButtonStyle.SECONDARY,
								emoji: {
									name: 'Upgrade Skills',
									id: icons.button_icons.upgrade_skills_icon
								}
							},
							RED_BUTTON('Abandon', 'abandon')
						]
					}]

					await buttonCtx.editParent({
						content: display,
						embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow).embed],
						components
					})

					// let player pick items to keep (QoL thing, prevents unneeded items from being added to database)
					const pickComponents: ComponentActionRow[] = [
						{
							type: ComponentType.ACTION_ROW,
							components: [
								{
									type: ComponentType.SELECT,
									custom_id: 'select',
									placeholder: 'Select item(s) to keep:',
									min_values: 1,
									max_values: itemsFound.length,
									options: itemsFound.map(i => {
										const iconID = i.item.icon.match(/:([0-9]*)>/)

										return {
											label: getItemNameDisplay(i.item),
											value: i.row.id.toString(),
											description: `Uses ${i.item.slotsUsed} slots.${i.row.durability ? ` ${i.row.durability} uses left. ` : ''}`,
											emoji: iconID ? {
												id: iconID[1],
												name: i.item.name
											} : undefined
										}
									})
								}
							]
						},
						{
							type: ComponentType.ACTION_ROW,
							components: [RED_BUTTON('I don\'t want any of these items', 'cancel')]
						}
					]
					const pickMessage = await buttonCtx.send({
						content: `${icons.checkmark} ${getCompanionDisplay(preCompanion, companionRow, true)} fetched you **${itemsFound.length}** items!` +
							'\n\n**Which items would you like to keep?**',
						components: pickComponents
					}) as Message

					try {
						const itemChoices = (await this.app.componentCollector.awaitClicks(pickMessage.id, c => c.user.id === ctx.user.id, 40000))[0]
						try {
							await itemChoices.acknowledge()
						}
						catch (err) {
							logger.warn(err)
						}

						if (itemChoices.customID !== 'select') {
							await itemChoices.editParent({
								content: `${icons.checkmark} You trash the items, hopefully your companion finds something better next time...`,
								components: []
							})
							return
						}

						const itemsPicked = itemsFound.filter(itm => itemChoices.values.includes(itm.row.id.toString()))

						try {
							// no need for transaction since items are being created regardless of users inventory space (already checked for space earlier and erroring now would be bad ux)
							for (const itemFound of itemsPicked) {
								const itemRow = await createItem(query, itemFound.item.name, { durability: itemFound.row.durability })
								await addItemToBackpack(query, ctx.user.id, itemRow.id)

								itemFound.row = itemRow
							}

							await itemChoices.editParent({
								content: `${icons.checkmark} Transferred **${itemsPicked.length}** items to your inventory:` +
									`\n\n${itemsPicked.map(itm => getItemDisplay(itm.item, itm.row)).join('\n')}`,
								components: []
							})
						}
						catch (err) {
							logger.warn(err)
						}
					}
					catch (err) {
						await pickMessage.edit({
							content: `${icons.danger} You ran out of time to select which items you wanted to keep! That's a shame...`,
							components: disableAllComponents(pickComponents)
						})
					}
				}
				else if (buttonCtx.customID === 'upgrade') {
					const companionRow = await getCompanionRow(query, ctx.user.id)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}

					const spentSkillPoints = (companionRow.level - 1) - companionRow.skillPoints
					const upgradesAvailable = Math.min(preCompanion.maxUpgrades - spentSkillPoints, companionRow.skillPoints)
					let display
					if (spentSkillPoints >= preCompanion.maxUpgrades) {
						display = `**${getCompanionDisplay(preCompanion, companionRow, true)}**'s skills have been upgraded **${preCompanion.maxUpgrades}** times and cannot be upgraded further.` +
							' Better companions can have more upgrades.'
					}
					else {
						display = `${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}** has **${upgradesAvailable}** skill upgrades available.` +
							` ${upgradesAvailable > 0 ? 'What would you like to spend them on?' : 'Earn skill points by leveling up your companion.'}`
					}

					components = [
						{
							type: ComponentType.ACTION_ROW,
							components: [
								this.getSkillUpgradeMenu(companionRow, upgradesAvailable)
							]
						},
						{
							type: ComponentType.ACTION_ROW,
							components: [
								GRAY_BUTTON('Exit Menu', 'upgrade-cancel'),
								RED_BUTTON('Reset Upgrades', 'upgrade-reset')
							]
						}
					]
					await buttonCtx.editParent({
						content: display,
						embeds: [this.getUpgradesEmbed(preCompanion, companionRow, upgradesAvailable).embed],
						components
					})
				}
				else if (buttonCtx.customID === 'upgrade-cancel') {
					const companionRow = await getCompanionRow(query, ctx.user.id)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}

					const companionFetchCD = await getCooldown(query, ctx.user.id, 'companion-fetch')

					components = [{
						type: ComponentType.ACTION_ROW,
						components: [
							companionRow.fetching ? GREEN_BUTTON('Complete Fetch Mission', 'fetch-complete') : BLUE_BUTTON('Send Companion on Fetch Mission', 'fetch'),
							GRAY_BUTTON('Play', 'play'),
							GRAY_BUTTON('Feed', 'feed'),
							{
								type: ComponentType.BUTTON,
								label: 'Upgrade Skills',
								custom_id: 'upgrade',
								style: ButtonStyle.SECONDARY,
								emoji: {
									name: 'Upgrade Skills',
									id: icons.button_icons.upgrade_skills_icon
								}
							},
							RED_BUTTON('Abandon', 'abandon')
						]
					}]
					await buttonCtx.editParent({
						content: `${icons.checkmark} Finished upgrades.`,
						embeds: [this.getCompanionEmbed(ctx.member || ctx.user, preCompanion, companionRow, companionFetchCD).embed],
						components
					})
				}
				else if (buttonCtx.customID === 'upgrade-skill') {
					const skillToUpgrade = buttonCtx.values[0]

					if (
						skillToUpgrade !== 'agility' &&
						skillToUpgrade !== 'strength' &&
						skillToUpgrade !== 'perception' &&
						skillToUpgrade !== 'courage'
					) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.danger} There was an error upgrading that skill, try rerunning the command or tell blobfysh#4679 u saw this.`,
							components: disableAllComponents(components)
						})
						return
					}

					const transaction = await beginTransaction()
					const companionRow = await getCompanionRow(transaction.query, ctx.user.id, true)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}
					else if (companionRow.skillPoints <= 0) {
						await transaction.commit()

						await buttonCtx.editParent({
							content: `${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}** has **0** skill points to spend! Earn skill points by leveling up your companion.`,
							embeds: [this.getUpgradesEmbed(preCompanion, companionRow, 0).embed]
						})
						return
					}

					const spentSkillPoints = (companionRow.level - 1) - companionRow.skillPoints
					if (spentSkillPoints >= preCompanion.maxUpgrades) {
						await transaction.commit()

						await buttonCtx.editParent({
							content: `${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}**'s skills have been upgraded **${preCompanion.maxUpgrades}** times and cannot be upgraded further.` +
								' Better companions can have more upgrades.',
							embeds: [this.getUpgradesEmbed(preCompanion, companionRow, 0).embed]
						})
						return
					}

					await lowerSkillPoints(transaction.query, ctx.user.id, 1)
					await increaseSkill(transaction.query, ctx.user.id, skillToUpgrade, 1)
					companionRow[skillToUpgrade] += 1
					companionRow.skillPoints -= 1
					await transaction.commit()

					const upgradesAvailable = Math.min(preCompanion.maxUpgrades - (spentSkillPoints + 1), companionRow.skillPoints)

					if (upgradesAvailable <= 0) {
						components = [
							{
								type: ComponentType.ACTION_ROW,
								components: [
									this.getSkillUpgradeMenu(companionRow, upgradesAvailable)
								]
							},
							{
								type: ComponentType.ACTION_ROW,
								components: [
									GRAY_BUTTON('Exit Menu', 'upgrade-cancel'),
									RED_BUTTON('Reset Upgrades', 'upgrade-reset')
								]
							}
						]
						await buttonCtx.editParent({
							content: `Increased **${skillToUpgrade}** by 1. Your companion has **0** skill upgrades available.`,
							embeds: [this.getUpgradesEmbed(preCompanion, companionRow, upgradesAvailable).embed],
							components
						})
					}
					else {
						await buttonCtx.editParent({
							content: `Increased **${skillToUpgrade}** by 1. Your companion still has **${upgradesAvailable}** skill upgrades available. What else would you like to spend them on?`,
							embeds: [this.getUpgradesEmbed(preCompanion, companionRow, upgradesAvailable).embed]
						})
					}
				}
				else if (buttonCtx.customID === 'upgrade-reset') {
					const companionRow = await getCompanionRow(query, ctx.user.id)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}

					const spentSkillPoints = (companionRow.level - 1) - companionRow.skillPoints
					const cost = spentSkillPoints * 3000

					if (spentSkillPoints <= 0) {
						await buttonCtx.send({
							content: `${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}**'s skills have never been upgraded. There are no skill points to reset.`,
							ephemeral: true
						})
						return
					}

					const companionFetchCD = await getCooldown(query, ctx.user.id, 'companion-fetch')

					if (companionFetchCD) {
						await buttonCtx.send({
							content: `${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}** is currently fetching. You cannot reset skills while your companion is fetching items.`,
							ephemeral: true
						})
						return
					}

					components = [{
						type: ComponentType.ACTION_ROW,
						components: [GREEN_BUTTON('Confirm', 'upgrade-reset-confirm'), RED_BUTTON('Cancel', 'upgrade')]
					}]
					await buttonCtx.editParent({
						content: `Reset **${spentSkillPoints}x** skill points for **${formatMoney(cost)}**? (You will be able to spend the skill points after they are reset)`,
						embeds: [],
						components
					})
				}
				else if (buttonCtx.customID === 'upgrade-reset-confirm') {
					const transaction = await beginTransaction()
					const userData = (await getUserRow(transaction.query, ctx.user.id, true))!
					const companionRow = await getCompanionRow(transaction.query, ctx.user.id, true)

					if (!companionRow || !preCompanion || companionRow.type !== preCompanion.name) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} You don't own this companion anymore.`,
							components: disableAllComponents(components)
						})
						return
					}

					const spentSkillPoints = (companionRow.level - 1) - companionRow.skillPoints
					const upgradesAvailable = Math.min(preCompanion.maxUpgrades - spentSkillPoints, companionRow.skillPoints)
					const cost = spentSkillPoints * 3000

					if (spentSkillPoints <= 0) {
						await transaction.commit()
						stopCollector()

						await buttonCtx.editParent({
							content: `${icons.cancel} ${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}** has no skill points to reset.`,
							components: disableAllComponents(components)
						})
						return
					}
					else if (userData.money < cost) {
						await transaction.commit()

						components = [
							{
								type: ComponentType.ACTION_ROW,
								components: [
									this.getSkillUpgradeMenu(companionRow, upgradesAvailable)
								]
							},
							{
								type: ComponentType.ACTION_ROW,
								components: [
									GRAY_BUTTON('Exit Menu', 'upgrade-cancel'),
									RED_BUTTON('Reset Upgrades', 'upgrade-reset')
								]
							}
						]
						await buttonCtx.editParent({
							content: `${icons.danger} You don't have enough copper to reset ${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}**'s skill points. You need **${formatMoney(cost)}** but you only have **${formatMoney(userData.money)}**.`,
							embeds: [this.getUpgradesEmbed(preCompanion, companionRow, upgradesAvailable).embed],
							components
						})
						return
					}

					const companionFetchCD = await getCooldown(transaction.query, ctx.user.id, 'companion-fetch', true)

					if (companionFetchCD) {
						await transaction.commit()

						components = [
							{
								type: ComponentType.ACTION_ROW,
								components: [
									this.getSkillUpgradeMenu(companionRow, upgradesAvailable)
								]
							},
							{
								type: ComponentType.ACTION_ROW,
								components: [
									GRAY_BUTTON('Exit Menu', 'upgrade-cancel'),
									RED_BUTTON('Reset Upgrades', 'upgrade-reset')
								]
							}
						]
						await buttonCtx.editParent({
							content: `${icons.danger} cannot reset skills while ${preCompanion.icon} **${getCompanionDisplay(preCompanion, companionRow, true)}** is fetching items.`,
							embeds: [this.getUpgradesEmbed(preCompanion, companionRow, upgradesAvailable).embed],
							components
						})
						return
					}

					companionRow.agility = 0
					companionRow.strength = 0
					companionRow.perception = 0
					companionRow.courage = 0
					companionRow.skillPoints += spentSkillPoints
					await removeMoney(transaction.query, ctx.user.id, cost)
					await resetSkills(transaction.query, ctx.user.id)
					await increaseSkillPoints(transaction.query, ctx.user.id, spentSkillPoints)
					await transaction.commit()

					components = [
						{
							type: ComponentType.ACTION_ROW,
							components: [
								this.getSkillUpgradeMenu(companionRow, upgradesAvailable + spentSkillPoints)
							]
						},
						{
							type: ComponentType.ACTION_ROW,
							components: [
								GRAY_BUTTON('Exit Menu', 'upgrade-cancel'),
								RED_BUTTON('Reset Upgrades', 'upgrade-reset')
							]
						}
					]
					await buttonCtx.editParent({
						content: `${icons.checkmark} Reset **${spentSkillPoints}x** skill points for **${formatMoney(cost)}**!` +
							` You now have **${formatMoney(userData.money - cost)}** copper.`,
						components,
						embeds: [this.getUpgradesEmbed(preCompanion, companionRow, upgradesAvailable + spentSkillPoints).embed]
					})
				}
			}
			catch (err) {
				logger.warn(err)
				stopCollector()
				await buttonCtx.editParent({
					content: `${icons.cancel} There was an error trying to interact with your companion. Try running the command again.`,
					components: []
				})
			}
		})

		collector.on('end', async msg => {
			try {
				if (msg === 'time') {
					await ctx.editOriginal({
						content: 'Buttons timed out.',
						components: disableAllComponents(components)
					})
				}
			}
			catch (err) {
				logger.error(err)
			}
		})
	}

	/**
	 * Checks if a companion should be a higher level than they are
	 * @param xp Companions XP
	 * @param level Companions current level
	 * @returns The level companion should be
	 */
	getCompanionLevel (xp: number, level: number): number {
		// check if companion has enough xp to level up
		let companionXp = getCompanionXp(xp, level)
		let newLevel = level

		// check if user levels up multiple times (prevents sending multiple level-up messages)
		while (companionXp.xpUntilLevelUp <= 0) {
			newLevel += 1
			companionXp = getCompanionXp(xp, newLevel)
		}

		return newLevel
	}

	getCompanionEmbed (member: ResolvedMember | User, companion: Companion, companionRow: CompanionRow, fetchCD?: string, owner = true): Embed {
		const userDisplay = 'user' in member ? member.displayName : `${member.username}#${member.discriminator}`
		const companionXp = getCompanionXp(companionRow.xp, companionRow.level)
		const spentSkillPoints = (companionRow.level - 1) - companionRow.skillPoints
		const upgradesAvailable = Math.min(companion.maxUpgrades - spentSkillPoints, companionRow.skillPoints)
		const companionEmbed = new Embed()
			.setAuthor(`${userDisplay}'s companion`, member.avatarURL)
			.setThumbnail(companion.iconURL)
			.setDescription(`**Lvl. ${companionRow.level}** ${companion.icon} ${getCompanionDisplay(companion, companionRow)}` +
			`\n${formatXP(companionXp.relativeLevelXp, companionXp.levelTotalXpNeeded)} ${formatNumber(companionXp.relativeLevelXp)} / ${formatNumber(companionXp.levelTotalXpNeeded)} XP`)
			.addField('__Skills__', `👟 **Agility**: ${companionRow.agility}\n` +
				`💪 **Strength**: ${companionRow.strength}\n` +
				`👁️ **Perception**: ${companionRow.perception}\n` +
				`🛡️ **Courage**: ${companionRow.courage}` +
				`${upgradesAvailable > 0 ? `\n\nYou have **${upgradesAvailable}** skill points available!` : ''}`,
			true)
			.addField('__Stress__', `${formatRedBar(companionRow.stress, 100)}\n${companionRow.stress} / 100 (+2/hr)`, true)
			.addField('__Hunger__', `${formatRedBar(companionRow.hunger, 100)}\n${companionRow.hunger} / 100 (+2/hr)`, true)
			.addField('__Statistics__', `**Fetch Missions Completed**: ${companionRow.fetches}` +
				`\n**Companion Since**: ${formatTime(Date.now() - companionRow.createdAt.getTime())} ago` +
				`\n**Skill Upgrades**: ${spentSkillPoints} / ${companion.maxUpgrades} max`,
			true)
			.addBlankField()
			.addField('__Fetch Mission Status__', companionRow.fetching ?
				fetchCD ?
					`${icons.timer} ${getCompanionDisplay(companion, companionRow, true)} will complete their fetch mission in about **${fetchCD}**.` :
					`${icons.checkmark} ${getCompanionDisplay(companion, companionRow, true)} has found **${companionRow.strength + 1}** items!` :
				`**${getCompanionDisplay(companion, companionRow, true)} is not fetching anything.**\n\n` +
				`${icons.information} Fetch missions allow companions to retrieve random items for you. ${getCompanionDisplay(companion, companionRow, true)} will take **${formatTime(getFetchTime(companionRow.agility) * 1000)}** to complete a fetch mission.`)

		if (owner) {
			companionEmbed.setFooter('If hunger levels reach 100, your companion will leave you!')
		}

		return companionEmbed
	}

	getUpgradesEmbed (companion: Companion, companionRow: CompanionRow, upgradesAvailable: number): Embed {
		if (upgradesAvailable <= 0) {
			return new Embed()
				.addField(`👟 Agility (${companionRow.agility})`,
					`Reduces time it takes to fetch items. ${getCompanionDisplay(companion, companionRow, true)} will complete a fetch mission in **${formatTime(getFetchTime(companionRow.agility) * 1000)}**.`)
				.addField(`💪 Strength (${companionRow.strength})`,
					`Increases amount of items companion fetches. ${getCompanionDisplay(companion, companionRow, true)} will fetch **${companionRow.strength + 1}** items.`)
				.addField(`👁️ Perception (${companionRow.perception})`,
					`Increases the quality of items your companion fetches. ${getCompanionDisplay(companion, companionRow, true)} will find items with an item level of **${companionRow.perception + 2}** maximum.`)
				.addField(`🛡️ Courage (${companionRow.courage})`,
					`Increases likeliness your companion will protect you from dying. ${getCompanionDisplay(companion, companionRow, true)} has a ${getProtectionChance(companionRow.courage).toFixed(2)}% chance of protecting you from dying in a fight.`)
				.setFooter(`${getCompanionDisplay(companion, companionRow, true)} can be upgraded up to ${companion.maxUpgrades} times.`)
		}

		return new Embed()
			.addField(`👟 Agility (${companionRow.agility} → ${companionRow.agility + 1})`,
				`Decrease the time it takes to complete a fetch mission from **${formatTime(getFetchTime(companionRow.agility) * 1000)}** to **${formatTime(getFetchTime(companionRow.agility + 1) * 1000)}**.`)
			.addField(`💪 Strength (${companionRow.strength} → ${companionRow.strength + 1})`,
				`Increase the amount of items your companion fetches from **${companionRow.strength + 1}** to **${companionRow.strength + 2}**.`)
			.addField(`👁️ Perception (${companionRow.perception} → ${companionRow.perception + 1})`,
				`Your companion will be able to find items with an item level of **${companionRow.perception + 3}** maximum (fetch better items).`)
			.addField(`🛡️ Courage (${companionRow.courage} → ${companionRow.courage + 1})`,
				`Your companion will have a higher chance (${getProtectionChance(companionRow.courage).toFixed(2)}% to ${getProtectionChance(companionRow.courage + 1).toFixed(2)}%) of protecting you from dying in a fight.`)
			.setFooter(`${getCompanionDisplay(companion, companionRow, true)} can be upgraded up to ${companion.maxUpgrades} times.`)
	}

	getSkillUpgradeMenu (companionRow: CompanionRow, upgradesAvailable: number): ComponentSelectMenu {
		return {
			type: ComponentType.SELECT,
			custom_id: 'upgrade-skill',
			placeholder: 'Select a skill to upgrade:',
			disabled: upgradesAvailable <= 0,
			options: [
				{
					label: 'Agility',
					value: 'agility',
					description: `Decrease fetch time to ${formatTime(getFetchTime(companionRow.agility + 1) * 1000)}.`,
					emoji: {
						name: '👟'
					}
				},
				{
					label: 'Strength',
					value: 'strength',
					description: `Companion will fetch ${companionRow.strength + 2}x items.`,
					emoji: {
						name: '💪'
					}
				},
				{
					label: 'Perception',
					value: 'perception',
					description: `Companion will fetch items with item level ${companionRow.perception + 3} max.`,
					emoji: {
						name: '👁️'
					}
				},
				{
					label: 'Courage',
					value: 'courage',
					description: `${getProtectionChance(companionRow.courage + 1).toFixed(2)}% chance companion protects you from dying.`,
					emoji: {
						name: '🛡️'
					}
				}
			]
		}
	}

	/**
	 * @param rows Rows of items
	 * @param showIDs Whether to show the ids of the items in the embeds, defaults true
	 * @returns Array of embeds with the items that are displayed on that embed
	 */
	generateItemPages<T extends Item> (items: ItemWithRow<ItemRow, T>[], showIDs = true): { page: Embed, items: ItemWithRow<ItemRow, T>[] }[] {
		const sortedItems = sortItemsByName(items, true)
		const pages = []
		const maxPage = Math.ceil(sortedItems.length / ITEMS_PER_PAGE) || 1

		for (let i = 1; i < maxPage + 1; i++) {
			const indexFirst = (ITEMS_PER_PAGE * i) - ITEMS_PER_PAGE
			const indexLast = ITEMS_PER_PAGE * i
			const filteredItems = sortedItems.slice(indexFirst, indexLast) as ItemWithRow<ItemRow, T>[]

			const embed = new Embed()
				.setDescription(filteredItems.map(itm => getItemDisplay(itm.item, itm.row, { showID: showIDs })).join('\n') || 'No items found.')

			if (maxPage > 1) {
				embed.setFooter(`Page ${i}/${maxPage}`)
			}

			pages.push({ page: embed, items: filteredItems })
		}

		return pages
	}
}

export default CompanionCommand
