import { CommandOptionType, SlashCreator, CommandContext, User, ComponentType, ComponentActionRow, Message } from 'slash-create'
import { ResolvedMember } from 'slash-create/lib/structures/resolvedMember'
import App from '../app'
import { icons } from '../config'
import CustomSlashCommand from '../structures/CustomSlashCommand'
import Embed from '../structures/Embed'
import { BackpackItemRow, ItemWithRow, UserRow } from '../types/mysql'
import { addItemToStash, getUserBackpack, getUserStash, removeItemFromBackpack } from '../utils/db/items'
import { beginTransaction, query } from '../utils/db/mysql'
import { getUserRow } from '../utils/db/players'
import { formatHealth, formatMoney, formatNumber, formatXP } from '../utils/stringUtils'
import { getBackpackLimit, getEquips, getItemDisplay, getItemNameDisplay, getItemPrice, getItems, sortItemsByName } from '../utils/itemUtils'
import { getPlayerXp } from '../utils/playerUtils'
import { logger } from '../utils/logger'
import { GRAY_BUTTON, NEXT_BUTTON, PREVIOUS_BUTTON } from '../utils/constants'
import { disableAllComponents } from '../utils/messageUtils'
import SellCommand from './sell'

const ITEMS_PER_PAGE = 12

class InventoryCommand extends CustomSlashCommand<'inventory'> {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'inventory',
			description: 'View your player inventory (and transfer items to your stash).',
			longDescription: 'View your player inventory. Your inventory is different from your stash in that the items in your inventory are taken with you into duels.' +
				' If you die in a duel, you will lose the items in your inventory. You can use this command to transfer items to your stash but only when you are not in a duel',
			options: [{
				type: CommandOptionType.USER,
				name: 'user',
				description: 'User to check inventory of.',
				required: false
			}],
			category: 'info',
			guildModsOnly: false,
			worksInDMs: true,
			worksDuringDuel: true,
			guildIDs: [],
			starterTip: 'Welcome to your inventory! These are all the items you are currently holding. Contrary to your `/stash`, these items will be taken' +
				' with you into duels and you will lose them if you die. If you want to keep an item safe, **move it to your stash**!' +
				' You can do so by using the selection menu under your inventory.'
		})

		this.filePath = __filename
	}

	async run (ctx: CommandContext): Promise<void> {
		// using resolved members instead of users to enforce the user being in same guild command is used in
		// this resolved data is REALLY nice btw
		const member = ctx.members.get(ctx.options.user)

		if (member) {
			const userData = await getUserRow(query, member.id)

			if (!userData) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** does not have an account!`
				})
				return
			}

			const userBackpack = await getUserBackpack(query, member.id)
			const pages = this.generatePages(member, userBackpack, userData, false)

			if (pages.length === 1) {
				await ctx.send({
					embeds: [pages[0].page.embed]
				})
			}
			else {
				await this.app.componentCollector.paginateEmbeds(ctx, pages.map(p => p.page))
			}
			return
		}

		const preUserData = (await getUserRow(query, ctx.user.id))!
		const preUserBackpack = await getUserBackpack(query, ctx.user.id)
		const pages = this.generatePages(ctx.member || ctx.user, preUserBackpack, preUserData, true)
		let components: ComponentActionRow[] = []
		let page = 0

		if (pages[0].items.length && !preUserData.fighting) {
			components.push({
				type: ComponentType.ACTION_ROW,
				components: [
					{
						type: ComponentType.SELECT,
						custom_id: 'transfer',
						placeholder: 'Transfer item(s) to your stash:',
						min_values: 1,
						max_values: pages[0].items.length,
						options: pages[0].items.map(i => {
							const iconID = i.item.icon.match(/:([0-9]*)>/)

							return {
								label: `[${i.row.id}] ${getItemNameDisplay(i.item, i.row)}`,
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
			})
		}

		if (pages.length > 1) {
			components.push({
				type: ComponentType.ACTION_ROW,
				components: [
					PREVIOUS_BUTTON(true),
					NEXT_BUTTON(false)
				]
			})
		}

		const fixedPages = pages
		const botMessage = await ctx.send({
			embeds: [pages[0].page.embed],
			components
		}) as Message

		if (components.length) {
			const { collector, stopCollector } = this.app.componentCollector.createCollector(botMessage.id, c => c.user.id === ctx.user.id, 80000)

			collector.on('collect', async c => {
				try {
					await c.acknowledge()

					components = []

					if (c.customID === 'previous' && page !== 0) {
						page--

						if (!preUserData.fighting) {
							components.push({
								type: ComponentType.ACTION_ROW,
								components: [
									{
										type: ComponentType.SELECT,
										custom_id: 'transfer',
										placeholder: 'Transfer item(s) to your stash:',
										min_values: 1,
										max_values: fixedPages[page].items.length,
										options: fixedPages[page].items.map(i => {
											const iconID = i.item.icon.match(/:([0-9]*)>/)

											return {
												label: `[${i.row.id}] ${getItemNameDisplay(i.item, i.row)}`,
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
							})
						}

						components.push({
							type: ComponentType.ACTION_ROW,
							components: [
								PREVIOUS_BUTTON(page === 0),
								NEXT_BUTTON(false)
							]
						})

						await c.editParent({
							embeds: [fixedPages[page].page.embed],
							components
						})
					}
					else if (c.customID === 'next' && page !== (fixedPages.length - 1)) {
						page++

						if (!preUserData.fighting) {
							components.push({
								type: ComponentType.ACTION_ROW,
								components: [
									{
										type: ComponentType.SELECT,
										custom_id: 'transfer',
										placeholder: 'Transfer item(s) to your stash:',
										min_values: 1,
										max_values: fixedPages[page].items.length,
										options: fixedPages[page].items.map(i => {
											const iconID = i.item.icon.match(/:([0-9]*)>/)

											return {
												label: `[${i.row.id}] ${getItemNameDisplay(i.item, i.row)}`,
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
							})
						}

						components.push({
							type: ComponentType.ACTION_ROW,
							components: [
								PREVIOUS_BUTTON(false),
								NEXT_BUTTON(page === (fixedPages.length - 1))
							]
						})

						await c.editParent({
							embeds: [fixedPages[page].page.embed],
							components
						})
					}
					else if (c.customID === 'transfer') {
						// using transaction because users data will be updated
						const transaction = await beginTransaction()
						const userData = (await getUserRow(transaction.query, ctx.user.id, true))!

						if (userData.fighting) {
							await transaction.commit()

							await c.send({
								content: `${icons.danger} You cannot transfer items while in a duel!`,
								ephemeral: true
							})
							return
						}

						const items = fixedPages[page].items.filter(i => c.values.includes(i.row.id.toString()))
						const backpackRows = await getUserBackpack(transaction.query, ctx.user.id, true)
						const stashRows = await getUserStash(transaction.query, ctx.user.id, true)
						const userStashData = getItems(stashRows)
						const userBackpackData = getItems(backpackRows)
						const itemsToDeposit = []

						for (const i of items) {
							const foundItem = userBackpackData.items.find(itm => itm.row.id === i.row.id)

							// make sure user has item
							if (foundItem) {
								itemsToDeposit.push(foundItem)
							}
							else {
								await transaction.commit()

								await c.send({
									content: `${icons.warning} You don't have an item with the ID **${i.row.id}** in your inventory. Did you already transfer it to your stash?`,
									ephemeral: true
								})
								return
							}
						}

						const slotsNeeded = itemsToDeposit.reduce((prev, curr) => prev + curr.item.slotsUsed, 0)
						if (userStashData.slotsUsed + slotsNeeded > userData.stashSlots) {
							await transaction.commit()

							const slotsAvailable = Math.max(0, userData.stashSlots - userStashData.slotsUsed).toFixed(1)

							const sellMessage = await c.send({
								content: `${icons.danger} You don't have enough space in your stash. You need **${slotsNeeded.toFixed(1)}** open slots in your stash but you only have **${slotsAvailable}** slots available.` +
									'\n\nSell items to clear up some space.',
								ephemeral: true,
								components: [{
									type: ComponentType.ACTION_ROW,
									components: [GRAY_BUTTON('Sell Items', 'sell')]
								}]
							}) as Message

							try {
								const confirmed = (await this.app.componentCollector.awaitClicks(sellMessage.id, i => i.user.id === ctx.user.id))[0]

								if (confirmed.customID === 'sell') {
									const sellCommand = new SellCommand(this.app.slashCreator, this.app)

									await sellCommand.run(ctx, true, {
										messageID: sellMessage.id,
										componentCtx: confirmed
									})
								}
							}
							catch (err) {
								// sell button timed out, continue
							}
							return
						}

						for (const i of itemsToDeposit) {
							await removeItemFromBackpack(transaction.query, i.row.id)
							await addItemToStash(transaction.query, ctx.user.id, i.row.id)
						}

						await transaction.commit()
						stopCollector()

						await c.editParent({
							content: `${icons.checkmark} Moved the following from your inventory to your stash:\n\n${itemsToDeposit.map(i => getItemDisplay(i.item, i.row, { showEquipped: false })).join('\n')}`,
							embeds: [],
							components: []
						})
					}
				}
				catch (err) {
					// continue
				}
			})

			collector.on('end', async msg => {
				try {
					if (msg === 'time') {
						await botMessage.edit({
							content: `${icons.warning} Buttons timed out.`,
							embeds: [fixedPages[page].page.embed],
							components: disableAllComponents(components)
						})
					}
				}
				catch (err) {
					logger.warn(err)
				}
			})
		}
	}

	generatePages (member: ResolvedMember | User, rows: BackpackItemRow[], userData: UserRow, isSelf: boolean): { page: Embed, items: ItemWithRow<BackpackItemRow>[] }[] {
		const userDisplay = 'user' in member ? member.displayName : `${member.username}#${member.username}`
		const itemData = getItems(rows)
		const playerXp = getPlayerXp(userData.xp, userData.level)
		const equips = getEquips(rows)
		const sortedItems = sortItemsByName(itemData.items, true)
		const pages = []
		const maxPage = Math.ceil(sortedItems.length / ITEMS_PER_PAGE) || 1
		const invValue = itemData.items.reduce((prev, curr) => prev + Math.floor(getItemPrice(curr.item, curr.row) * this.app.currentShopSellMultiplier), 0)

		for (let i = 1; i < maxPage + 1; i++) {
			const indexFirst = (ITEMS_PER_PAGE * i) - ITEMS_PER_PAGE
			const indexLast = ITEMS_PER_PAGE * i
			const filteredItems = sortedItems.slice(indexFirst, indexLast)
			const backpackLimit = getBackpackLimit(equips.backpack?.item)

			const embed = new Embed()
				.setAuthor(`${userDisplay}'s Inventory`, member.avatarURL)
				.setDescription(`**Number of Items**: ${itemData.items.length}` +
					`\n**Inventory Value**: ${formatMoney(invValue)}` +
					`${isSelf && itemData.slotsUsed > backpackLimit ? `\n\n${icons.warning} You are currently overweight, you should sell items to clear space.` : ''}`)
				.addField('__Health__', `**${userData.health} / ${userData.maxHealth}** (+5HP/5 mins)\n${formatHealth(userData.health, userData.maxHealth)}`, true)
				.addField('__Experience__', `**Lvl. ${userData.level}** ${formatXP(playerXp.relativeLevelXp, playerXp.levelTotalXpNeeded)}\n${formatNumber(playerXp.relativeLevelXp)} / ${formatNumber(playerXp.levelTotalXpNeeded)} XP`, true)
				.addField('__Equips__', 'Equip an item with `/equip <item id>`.\n' +
					`**Backpack**: ${equips.backpack ? getItemDisplay(equips.backpack.item, equips.backpack.row, { showEquipped: false, showID: false }) : 'None'}\n` +
					`**Helmet**: ${equips.helmet ? getItemDisplay(equips.helmet.item, equips.helmet.row, { showEquipped: false, showID: false }) : 'None'}\n` +
					`**Body Armor**: ${equips.armor ? getItemDisplay(equips.armor.item, equips.armor.row, { showEquipped: false, showID: false }) : 'None'}`)
				.addField(`__Items in Inventory__ (Space: ${itemData.slotsUsed.toFixed(1)} / ${backpackLimit.toFixed(1)})`,
					filteredItems.map(itm => getItemDisplay(itm.item, itm.row)).join('\n') || `No items found.\n\n${icons.information} Move items from your stash to your inventory with \`/stash\`.`)

			if (isSelf) {
				if (maxPage > 1) {
					embed.setFooter(`Page ${i}/${maxPage} · Inventory items will be lost if you die, put items in your stash for safekeeping`)
				}
				else {
					embed.setFooter('Inventory items will be lost if you die, put items in your stash for safekeeping')
				}
			}

			pages.push({ page: embed, items: filteredItems })
		}

		return pages
	}
}

export default InventoryCommand
