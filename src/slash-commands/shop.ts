import { CommandOptionType, SlashCreator, CommandContext, Message } from 'slash-create'
import App from '../app'
import { allItems } from '../resources/items'
import Corrector from '../structures/Corrector'
import CustomSlashCommand from '../structures/CustomSlashCommand'
import Embed from '../structures/Embed'
import { Item } from '../types/Items'
import { ShopItemRow } from '../types/mysql'
import { getItem } from '../utils/argParsers'
import { CONFIRM_BUTTONS } from '../utils/constants'
import { addItemToShop, addItemToStash, getAllShopItems, getShopItem, getUserBackpack, getUserStash, removeItemFromBackpack, removeItemFromShop, removeItemFromStash } from '../utils/db/items'
import { beginTransaction, query } from '../utils/db/mysql'
import { addMoney, getUserRow, removeMoney } from '../utils/db/players'
import formatNumber from '../utils/formatNumber'
import { getItemDisplay, getItems } from '../utils/itemUtils'
import getRandomInt from '../utils/randomInt'

const ITEMS_PER_PAGE = 10
const itemCorrector = new Corrector([...allItems.map(itm => itm.name), ...allItems.map(itm => itm.aliases).flat(1)])

class ShopCommand extends CustomSlashCommand {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'shop',
			description: 'View the item shop.',
			longDescription: 'Used to view the item shop. When you sell an item to the shop, it will appear in the shop for sale! Prices are random.',
			options: [
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'sell',
					description: 'Sell an item from your inventory or stash to the shop.',
					options: [
						{
							type: CommandOptionType.INTEGER,
							name: 'item',
							description: 'ID of item to sell.',
							required: true
						},
						{
							type: CommandOptionType.INTEGER,
							name: 'item-2',
							description: 'ID of another item to sell.',
							required: false
						},
						{
							type: CommandOptionType.INTEGER,
							name: 'item-3',
							description: 'ID of another item to sell.',
							required: false
						}
					]
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'buy',
					description: 'Purchase an item from the shop.',
					options: [
						{
							type: CommandOptionType.INTEGER,
							name: 'item',
							description: 'ID of item to purchase.',
							required: true
						}
					]
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'view',
					description: 'View the items for sale in the shop.',
					options: [
						{
							type: CommandOptionType.STRING,
							name: 'item',
							description: 'Name of item to search for.',
							required: false
						}
					]
				}
			],
			category: 'items',
			guildModsOnly: false,
			worksInDMs: true,
			onlyWorksInRaidGuild: false,
			canBeUsedInRaid: false,
			guildIDs: []
		})

		this.filePath = __filename
	}

	async run (ctx: CommandContext): Promise<void> {
		if (ctx.options.sell) {
			const items: number[] = [ctx.options.sell.item, ctx.options.sell['item-2'], ctx.options.sell['item-3']].filter(Boolean)

			if ((new Set(items)).size !== items.length) {
				await ctx.send({
					content: '❌ You specified the same item multiple times! Are you trying to break me?? >:('
				})
				return
			}

			const stashRows = await getUserStash(query, ctx.user.id)
			const backpackRows = await getUserBackpack(query, ctx.user.id)
			const userStashData = getItems(stashRows)
			const userBackpackData = getItems(backpackRows)
			const itemsToSell = []
			let price = 0

			for (const i of items) {
				const foundItem = userStashData.items.find(itm => itm.row.id === i) || userBackpackData.items.find(itm => itm.row.id === i)

				// make sure user has item
				if (!foundItem) {
					await ctx.send({
						content: `❌ You don't have an item with the ID **${i}** in your inventory or stash. You can find the IDs of items in your \`/inventory\` or \`/stash\`.`
					})
					return
				}
				else if (!foundItem.item.sellPrice) {
					/* this will prevent users from being able to get rid of unsellable items.
					await ctx.send({
						content: `❌ ${getItemDisplay(foundItem.item)} cannot be sold.`
					})
					return
					*/
					itemsToSell.push(foundItem)
					price += 0
				}
				else {
					itemsToSell.push(foundItem)
					price += Math.floor(foundItem.item.sellPrice * this.app.shopSellMultiplier)
				}
			}

			const botMessage = await ctx.send({
				content: `Sell **${itemsToSell.length}x** items for **${formatNumber(price)}**?\n\n${itemsToSell.map(i => getItemDisplay(i.item, i.row)).join('\n')}`,
				components: CONFIRM_BUTTONS
			}) as Message

			try {
				const confirmed = (await this.app.componentCollector.awaitClicks(botMessage.id, i => i.user.id === ctx.user.id))[0]

				if (confirmed.customID === 'confirmed') {
					// using transaction because users data will be updated
					const transaction = await beginTransaction()
					const userDataV = (await getUserRow(transaction.query, ctx.user.id, true))!
					const stashRowsV = await getUserStash(transaction.query, ctx.user.id, true)
					const backpackRowsV = await getUserBackpack(transaction.query, ctx.user.id, true)
					const userStashDataV = getItems(stashRowsV)
					const userBackpackDataV = getItems(backpackRowsV)

					for (const i of itemsToSell) {
						const foundItem = userStashDataV.items.find(itm => itm.row.id === i.row.id) || userBackpackDataV.items.find(itm => itm.row.id === i.row.id)

						if (!foundItem) {
							await transaction.commit()

							await confirmed.editParent({
								content: `❌ You don't have an item with the ID **${i.row.id}** in your inventory or stash. You can find the IDs of items in your \`/inventory\` or \`/stash\`.`,
								components: []
							})
							return
						}
					}

					// verified user has items, continue selling
					for (const i of itemsToSell) {
						const isStashItem = userStashDataV.items.find(itm => itm.row.id === i.row.id)

						if (isStashItem) {
							await removeItemFromStash(transaction.query, i.row.id)
						}
						else {
							await removeItemFromBackpack(transaction.query, i.row.id)
						}

						if (i.item.sellPrice) {
							const sellPrice = Math.floor(i.item.sellPrice! * this.app.shopSellMultiplier)
							await addItemToShop(transaction.query, i.row.id, getRandomInt(sellPrice * 2, sellPrice * 3))
						}
					}

					await addMoney(transaction.query, ctx.user.id, price)
					await transaction.commit()

					await confirmed.editParent({
						content: `✅ Sold **${itemsToSell.length}x** items for **${formatNumber(price)}**.\n\n${itemsToSell.map(i => `~~${getItemDisplay(i.item, i.row)}~~`).join('\n')}\n\n` +
							`You now have **${formatNumber(userDataV.money + price)}** rubles.`,
						components: []
					})
				}
				else {
					await botMessage.delete()
				}
			}
			catch (err) {
				await botMessage.edit({
					content: '❌ Command timed out.',
					components: []
				})
			}
		}
		else if (ctx.options.buy) {
			const itemID = ctx.options.buy.item as number
			const shopItemRow = await getShopItem(query, itemID)
			const shopItem = allItems.find(i => i.name === shopItemRow?.item)

			if (!shopItemRow || !shopItem) {
				await ctx.send({
					content: `❌ Could not find an item available in the shop with the ID **${itemID}**. You view the shop with \`/shop view\`.`
				})
				return
			}

			const userData = (await getUserRow(query, ctx.user.id))!
			const stashRows = await getUserStash(query, ctx.user.id)
			const userStashData = getItems(stashRows)

			if (userStashData.slotsUsed + shopItem.slotsUsed > userData.stashSlots) {
				await ctx.send({
					content: `❌ You don't have enough space in your stash. You need **${shopItem.slotsUsed}** open slots in your stash. Sell items to clear up some space.`
				})
				return
			}
			else if (userData.money < shopItemRow.price) {
				await ctx.send({
					content: `❌ You don't have enough rubles. You need **${formatNumber(shopItemRow.price)}** but you only have **${formatNumber(userData.money)}**.`
				})
				return
			}

			const botMessage = await ctx.send({
				content: `Purchase ${getItemDisplay(shopItem, shopItemRow)} for **${formatNumber(shopItemRow.price)}**?`,
				components: CONFIRM_BUTTONS
			}) as Message

			try {
				const confirmed = (await this.app.componentCollector.awaitClicks(botMessage.id, i => i.user.id === ctx.user.id))[0]

				if (confirmed.customID === 'confirmed') {
					// using transaction because users data will be updated
					const transaction = await beginTransaction()
					const shopItemRowV = await getShopItem(transaction.query, itemID, true)

					if (!shopItemRowV) {
						await transaction.commit()

						await confirmed.editParent({
							content: `❌ Could not find an item available in the shop with the ID **${itemID}**. You view the shop with \`/shop view\`.`,
							components: []
						})
						return
					}

					const userDataV = (await getUserRow(transaction.query, ctx.user.id, true))!
					const stashRowsV = await getUserStash(transaction.query, ctx.user.id, true)
					const userStashDataV = getItems(stashRowsV)

					if (userStashDataV.slotsUsed + shopItem.slotsUsed > userDataV.stashSlots) {
						await transaction.commit()

						await confirmed.editParent({
							content: `❌ You don't have enough space in your stash. You need **${shopItem.slotsUsed}** open slots in your stash. Sell items to clear up some space.`,
							components: []
						})
						return
					}
					else if (userDataV.money < shopItemRowV.price) {
						await confirmed.editParent({
							content: `❌ You don't have enough rubles. You need **${formatNumber(shopItemRowV.price)}** but you only have **${formatNumber(userDataV.money)}**.`,
							components: []
						})
						return
					}

					await removeMoney(transaction.query, ctx.user.id, shopItemRowV.price)
					await removeItemFromShop(transaction.query, shopItemRowV.id)
					await addItemToStash(transaction.query, ctx.user.id, shopItemRowV.id)
					await transaction.commit()

					await confirmed.editParent({
						content: `✅ Purchased ${getItemDisplay(shopItem, shopItemRowV)} for **${formatNumber(shopItemRowV.price)}**. You can find this item in your stash.\n\n` +
							`You now have **${formatNumber(userDataV.money - shopItemRowV.price)}** rubles.`,
						components: []
					})
				}
				else {
					await botMessage.delete()
				}
			}
			catch (err) {
				await botMessage.edit({
					content: '❌ Command timed out.',
					components: []
				})
			}
		}
		else {
			const searchedItem = getItem([ctx.options.view.item])
			const shopItems = await getAllShopItems(query)
			let pages

			if (ctx.options.view.item) {
				// user tried searching for item

				if (!searchedItem) {
					const related = itemCorrector.getWord(ctx.options.view.item, 5)

					await ctx.send({
						content: related ? `❌ Could not find an item matching that name. Did you mean \`${related}\`?` : '❌ Could not find an item matching that name.'
					})
					return
				}

				pages = this.generatePages(shopItems.filter(i => i.item === searchedItem.name), searchedItem)
			}
			else {
				pages = this.generatePages(shopItems)
			}

			if (pages.length === 1) {
				await ctx.send({
					embeds: [pages[0].embed]
				})
			}
			else {
				await this.app.componentCollector.paginateEmbeds(ctx, pages)
			}
		}
	}

	generatePages (rows: ShopItemRow[], searchedItem?: Item): Embed[] {
		const itemData = getItems(rows)
		const pages = []
		const maxPage = Math.ceil(itemData.items.length / ITEMS_PER_PAGE) || 1

		for (let i = 1; i < maxPage + 1; i++) {
			const indexFirst = (ITEMS_PER_PAGE * i) - ITEMS_PER_PAGE
			const indexLast = ITEMS_PER_PAGE * i
			const filteredItems = itemData.items.slice(indexFirst, indexLast)

			const embed = new Embed()
				.setDescription(`**${searchedItem ? `Market Results For: ${getItemDisplay(searchedItem)}` : 'Market'}**\n\nUse \`/shop buy <item id>\` to purchase an item.`)
				.setFooter('These deals will expire after 1 day!')

			embed.addField('__Items Available__ (Sorted newest to oldest)',
				filteredItems.map(itm => `<t:${itm.row.createdAt.getTime() / 1000}:R> ${getItemDisplay(itm.item, itm.row)} - ${formatNumber(itm.row.price)}`).join('\n') ||
				`There no ${searchedItem ? `${getItemDisplay(searchedItem)}'s` : 'items'} available right now. When a player sells an item, you will see it for sale here.`)

			pages.push(embed)
		}

		return pages
	}
}

export default ShopCommand
