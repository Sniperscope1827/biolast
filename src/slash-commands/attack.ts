import { CommandOptionType, SlashCreator, CommandContext, ComponentType, ButtonStyle, Message } from 'slash-create'
import App from '../app'
import { icons, raidCooldown, webhooks } from '../config'
import { allItems, items } from '../resources/items'
import { allNPCs } from '../resources/npcs'
import CustomSlashCommand from '../structures/CustomSlashCommand'
import Embed from '../structures/Embed'
import { Ammunition, Item, RangedWeapon } from '../types/Items'
import { clearCooldown, createCooldown, formatTime, getCooldown } from '../utils/db/cooldowns'
import { createItem, deleteItem, dropItemToGround, getGroundItems, getUserBackpack, lowerItemDurability, removeItemFromBackpack } from '../utils/db/items'
import { beginTransaction } from '../utils/db/mysql'
import { deleteNPC, getNPC, lowerHealth as lowerNPCHealth } from '../utils/db/npcs'
import { addXp, getUserRow, increaseDeaths, increaseKills, lowerHealth } from '../utils/db/players'
import { getUserQuests, increaseProgress } from '../utils/db/quests'
import { getUsersRaid, removeUserFromRaid } from '../utils/db/raids'
import { combineArrayWithAnd, formatHealth, getBodyPartEmoji } from '../utils/stringUtils'
import { getEquips, getItemDisplay, getItems, sortItemsByAmmo, sortItemsByLevel } from '../utils/itemUtils'
import { logger } from '../utils/logger'
import { messageUser } from '../utils/messageUtils'
import { BodyPart, getAttackDamage, getBodyPartHit, getRaidType } from '../utils/raidUtils'
import getRandomInt from '../utils/randomInt'
import { addStatusEffects, getActiveStimulants, getAfflictions } from '../utils/playerUtils'
import { BackpackItemRow, ItemWithRow } from '../types/mysql'
import Eris from 'eris'
import { Location } from '../types/Raids'

type ItemWithRowOfType<T extends Item> = ItemWithRow<BackpackItemRow> & { item: T }

class AttackCommand extends CustomSlashCommand {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'attack',
			description: 'Attack another player using your equipped weapon.',
			longDescription: 'Attack another player using your equipped weapon. Make sure you have ammunition for the weapon you want to shoot.' +
				' If you specify a body part to target, your weapon accuracy will determine your chance to hit that target.',
			options: [
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'user',
					description: 'Attack another player using your equipped weapon.',
					options: [
						{
							type: CommandOptionType.USER,
							name: 'target',
							description: 'User to attack.',
							required: true
						},
						{
							type: CommandOptionType.STRING,
							name: 'limb',
							description: 'The body part to target. Your chance of successfully hitting it is based on your weapon\'s accuracy.',
							required: false,
							choices: [
								{
									name: 'Head',
									value: 'head'
								},
								{
									name: 'Chest',
									value: 'chest'
								},
								{
									name: 'Arm',
									value: 'arm'
								},
								{
									name: 'Leg',
									value: 'leg'
								}
							]
						}
					]
				},
				{
					type: CommandOptionType.SUB_COMMAND,
					name: 'npc',
					description: 'Attack an NPC in this channel using your equipped weapon.',
					options: [
						{
							type: CommandOptionType.STRING,
							name: 'limb',
							description: 'The body part to target. Your chance of successfully hitting it is based on your weapon\'s accuracy.',
							required: false,
							choices: [
								{
									name: 'Head',
									value: 'head'
								},
								{
									name: 'Chest',
									value: 'chest'
								},
								{
									name: 'Arm',
									value: 'arm'
								},
								{
									name: 'Leg',
									value: 'leg'
								}
							]
						}
					]
				}
			],
			category: 'items',
			guildModsOnly: false,
			worksInDMs: false,
			onlyWorksInRaidGuild: true,
			canBeUsedInRaid: true,
			guildIDs: [],

			// can't defer this command because it pings users and editing the original
			// message will cause users not to get pinged
			noDefer: true
		})

		this.filePath = __filename
	}

	async run (ctx: CommandContext): Promise<void> {
		const guild = this.app.bot.guilds.get(ctx.guildID as string)
		if (!guild) {
			throw new Error('Guild not found in Eris cache')
		}
		const channel = guild.channels.get(ctx.channelID)
		if (!channel) {
			throw new Error('Could not find channel in Eris cache')
		}
		else if (channel.type !== 0) {
			throw new Error(`Raid channel (${channel.name} ID: ${channel.id}) is not of type: Text Channel`)
		}
		const raidType = getRaidType(guild.id)
		if (!raidType) {
			throw new Error(`Could not find raid location for guild (${guild.name} ID: ${guild.id})`)
		}

		if (ctx.options.npc) {
			// attacking npc
			await this.attackNPC(ctx, guild, channel, raidType)
		}
		else if (ctx.options.user) {
			// attacking player
			await this.attackUser(ctx, guild, raidType)
		}
	}

	/**
	 * Performs all validations and attacks an NPC using an SQL transaction
	 * @param ctx Slash creator CommandContext
	 * @param guild Guild (for spawning the NPC in)
	 * @param channel Channel (for spawning the NPC in)
	 * @param raidType Location command was used in
	 * @param userAmmoChoice The ammo user used (if they had to pick one)
	 */
	async attackNPC (ctx: CommandContext, guild: Eris.Guild, channel: Eris.TextChannel, raidType: Location, userAmmoChoice?: ItemWithRowOfType<Ammunition>): Promise<void> {
		if (!ctx.member) {
			throw new Error('Member not attached to interaction')
		}

		const transaction = await beginTransaction()
		const npcRow = await getNPC(transaction.query, ctx.channelID, true)
		const userData = (await getUserRow(transaction.query, ctx.user.id, true))!
		const attackCD = await getCooldown(transaction.query, ctx.user.id, 'attack')
		const partChoice: BodyPart | undefined = ctx.options.npc.limb

		if (!npcRow) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.warning} There are no NPC's in this channel.`
			})
			return
		}

		const npc = allNPCs.find(n => n.id === npcRow?.id)

		if (!npc) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.warning} There are no NPC's in this channel.`
			})
			return
		}
		else if (attackCD) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.timer} Your attack is on cooldown for **${attackCD}**. This is based on the attack rate of your weapon.`
			})
			return
		}

		const activeStimulants = await getActiveStimulants(transaction.query, ctx.user.id, ['damage', 'fireRate', 'accuracy'], true)
		const activeAfflictions = await getAfflictions(transaction.query, ctx.user.id, true)
		const stimulantEffects = addStatusEffects(activeStimulants.map(stim => stim.stimulant), activeAfflictions.map(aff => aff.type))

		const userBackpack = await getUserBackpack(transaction.query, ctx.user.id, true)
		const userBackpackData = getItems(userBackpack)
		const userEquips = getEquips(userBackpack)

		if (!userEquips.weapon) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.warning} You don't have a weapon equipped. Equip a weapon from your inventory with \`/equip <item id>\`.`
			})
			return
		}

		const bodyPartHit = getBodyPartHit(userEquips.weapon.item.accuracy + stimulantEffects.accuracyBonus, partChoice)
		const missedPartChoice = partChoice && (partChoice !== bodyPartHit.result || !bodyPartHit.accurate)
		const attackCooldown = Math.max(1, Math.round(userEquips.weapon.item.fireRate * (1 - (stimulantEffects.fireRate / 100))))
		const messages = []
		const removedItems = []
		const limbsHit = []
		const npcDisplayName = npc.type === 'boss' ? `**${npc.display}**` : `the \`${npc.type}\``
		const npcDisplayCapitalized = npc.type === 'boss' ? `**${npc.display}**` : `The \`${npc.type}\``
		let totalDamage
		let ammoPicked

		if (userEquips.weapon.item.type === 'Ranged Weapon') {
			const weaponUsed = userEquips.weapon.item
			const userPossibleAmmo = userBackpackData.items.filter((row, i) =>
				row.item.type === 'Ammunition' &&
				row.item.ammoFor.includes(weaponUsed) &&
				userBackpackData.items.map(r => r.item.name).indexOf(row.item.name) === i
			)

			if (!userPossibleAmmo.length) {
				await transaction.commit()

				await ctx.send({
					content: `${icons.danger} You don't have any ammo for your ${getItemDisplay(userEquips.weapon.item, userEquips.weapon.row, { showEquipped: false })}.` +
						` You need one of the following ammunitions in your inventory:\n\n${allItems.filter(i => i.type === 'Ammunition' && i.ammoFor.includes(weaponUsed)).map(i => getItemDisplay(i)).join(', ')}.`
				})
				return
			}
			else if (userAmmoChoice) {
				if (!userPossibleAmmo.some(i => i.row.id === userAmmoChoice.row.id)) {
					// the ammo user selected from pickAmmo() is no longer in their inventory (this could happen if the user dropped the ammo on ground while selecting)
					await transaction.commit()

					await ctx.send({
						content: `${icons.danger} You don't have a ${getItemDisplay(userAmmoChoice.item, userAmmoChoice.row)} in your inventory.`
					})
					return
				}

				ammoPicked = userAmmoChoice
			}
			else if (userPossibleAmmo.length === 1) {
				ammoPicked = userPossibleAmmo[0] as ItemWithRowOfType<Ammunition>
			}
			else {
				// have to commit transaction since user has to pick ammo and this can take up to 15 seconds
				await transaction.commit()

				ammoPicked = await this.pickAmmo(ctx, userEquips.weapon.item, userPossibleAmmo)

				if (!ammoPicked) {
					await ctx.send({
						content: `${icons.danger} There was an error with the ammo selection. The attack has been canceled.`
					})
					return
				}

				// rerun all validation with the users ammo choice (have to run all validations again after
				// user picks ammo because the users inventory could have changed while they were selecting)
				return this.attackNPC(ctx, guild, channel, raidType, ammoPicked)
			}

			await deleteItem(transaction.query, ammoPicked.row.id)
			removedItems.push(ammoPicked.row.id)

			if (ammoPicked.item.spreadsDamageToLimbs) {
				limbsHit.push({
					damage: getAttackDamage((ammoPicked.item.damage * (1 + (stimulantEffects.damageBonus / 100))) / ammoPicked.item.spreadsDamageToLimbs, ammoPicked.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
					limb: bodyPartHit.result
				})

				for (let i = 0; i < ammoPicked.item.spreadsDamageToLimbs - 1; i++) {
					let limb = getBodyPartHit(userEquips.weapon.item.accuracy)

					// make sure no duplicate limbs are hit
					while (limbsHit.find(l => l.limb === limb.result)) {
						limb = getBodyPartHit(userEquips.weapon.item.accuracy)
					}

					limbsHit.push({
						damage: getAttackDamage((ammoPicked.item.damage * (1 + (stimulantEffects.damageBonus / 100))) / ammoPicked.item.spreadsDamageToLimbs, ammoPicked.item.penetration, limb.result, npc.armor, npc.helmet),
						limb: limb.result
					})
				}
			}
			else {
				limbsHit.push({
					damage: getAttackDamage((ammoPicked.item.damage * (1 + (stimulantEffects.damageBonus / 100))), ammoPicked.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
					limb: bodyPartHit.result
				})
			}

			totalDamage = limbsHit.reduce((prev, curr) => prev + curr.damage.total, 0)

			if (missedPartChoice) {
				messages.push(`${icons.danger} You try to shoot ${npcDisplayName} in the ${getBodyPartEmoji(partChoice!)} **${partChoice}** with your ${getItemDisplay(userEquips.weapon.item)} (ammo: ${getItemDisplay(ammoPicked.item)}) **BUT YOU MISS DUE TO WEAPON ACCURACY!**\n`)
			}
			else if (ammoPicked.item.spreadsDamageToLimbs) {
				const limbsHitStrings = []

				for (const limbHit of limbsHit) {
					limbsHitStrings.push(limbHit.limb === 'head' ? `${getBodyPartEmoji(limbHit.limb)} ***HEAD*** for **${limbHit.damage.total}** damage` : `${getBodyPartEmoji(limbHit.limb)} **${limbHit.limb}** for **${limbHit.damage.total}** damage`)
				}

				messages.push(`You shot ${npcDisplayName} in the ${combineArrayWithAnd(limbsHitStrings)} with your ${getItemDisplay(userEquips.weapon.item)} (ammo: ${getItemDisplay(ammoPicked.item)}). **${totalDamage}** damage dealt.\n`)
			}
			else {
				messages.push(`You shot ${npcDisplayName} in the ${getBodyPartEmoji(bodyPartHit.result)} **${bodyPartHit.result === 'head' ? '*HEAD*' : bodyPartHit.result}** with your ${getItemDisplay(userEquips.weapon.item)} (ammo: ${getItemDisplay(ammoPicked.item)}). **${totalDamage}** damage dealt.\n`)
			}
		}
		else {
			limbsHit.push({
				damage: getAttackDamage((userEquips.weapon.item.damage * (1 + (stimulantEffects.damageBonus / 100))), userEquips.weapon.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
				limb: bodyPartHit.result
			})
			totalDamage = limbsHit[0].damage.total

			if (missedPartChoice) {
				messages.push(`${icons.danger} You try to hit ${npcDisplayName} in the ${getBodyPartEmoji(partChoice!)} **${partChoice}** with your ${getItemDisplay(userEquips.weapon.item)} **BUT YOU MISS DUE TO WEAPON ACCURACY!**\n`)
			}
			else {
				messages.push(`You hit ${npcDisplayName} in the ${getBodyPartEmoji(bodyPartHit.result)} **${bodyPartHit.result === 'head' ? '*HEAD*' : bodyPartHit.result}** with your ${getItemDisplay(userEquips.weapon.item)}. **${totalDamage}** damage dealt.\n`)
			}
		}

		// add attack cooldown based on weapon attack rate
		await createCooldown(transaction.query, ctx.user.id, 'attack', attackCooldown)
		// in case npc dies and need to update ground items
		await getGroundItems(transaction.query, ctx.channelID, true)

		// add message if users weapon accuracy allowed them to hit their targeted body part
		if (bodyPartHit.accurate) {
			messages.push(`${icons.crosshair} You hit the targeted limb (**${bodyPartHit.result}**)`)
		}

		// remove weapon annd ammo
		if (userEquips.weapon.row.durability - 1 <= 0) {
			messages.push(`${icons.danger} Your ${getItemDisplay(userEquips.weapon.item, userEquips.weapon.row, { showDurability: false, showEquipped: false })} broke from this attack.`)

			await deleteItem(transaction.query, userEquips.weapon.row.id)
			removedItems.push(userEquips.weapon.row.id)
		}
		else {
			messages.push(`Your ${getItemDisplay(userEquips.weapon.item, userEquips.weapon.row, { showDurability: false, showEquipped: false })} now has **${userEquips.weapon.row.durability - 1}** durability.`)

			await lowerItemDurability(transaction.query, userEquips.weapon.row.id, 1)
		}

		if (!missedPartChoice) {
			for (const result of limbsHit) {
				if (result.limb === 'head' && npc.helmet) {
					messages.push(`${npcDisplayCapitalized}'s helmet (${getItemDisplay(npc.helmet)}) reduced the damage by **${result.damage.reduced}**.`)
				}
				else if (result.limb === 'chest' && npc.armor) {
					messages.push(`${npcDisplayCapitalized}'s armor (${getItemDisplay(npc.armor)}) reduced the damage by **${result.damage.reduced}**.`)
				}
			}
		}

		messages.push(`${icons.timer} Your attack is on cooldown for **${formatTime(attackCooldown * 1000)}**.`)

		if (!missedPartChoice && npcRow.health - totalDamage <= 0) {
			const userQuests = (await getUserQuests(transaction.query, ctx.user.id, true)).filter(q => q.questType === 'NPC Kills' || q.questType === 'Any Kills' || q.questType === 'Boss Kills')
			const droppedItems = []

			if (npc.armor) {
				const armorDura = getRandomInt(Math.max(1, npc.armor.durability / 4), npc.armor.durability)
				const armorRow = await createItem(transaction.query, npc.armor.name, { durability: armorDura })
				await dropItemToGround(transaction.query, ctx.channelID, armorRow.id)

				droppedItems.push({
					item: npc.armor,
					row: armorRow
				})
			}

			if (npc.helmet) {
				const helmDura = getRandomInt(Math.max(1, npc.helmet.durability / 4), npc.helmet.durability)
				const helmRow = await createItem(transaction.query, npc.helmet.name, { durability: helmDura })
				await dropItemToGround(transaction.query, ctx.channelID, helmRow.id)

				droppedItems.push({
					item: npc.helmet,
					row: helmRow
				})
			}

			if (npc.type === 'raider' || (npc.type === 'boss' && npc.subtype !== 'walker')) {
				// drop weapon and ammo on ground

				if (npc.subtype === 'ranged') {
					// drop random amount of bullets
					const ammoToDrop = getRandomInt(1, 3)

					for (let i = 0; i < ammoToDrop; i++) {
						const ammoRow = await createItem(transaction.query, npc.ammo.name, { durability: npc.ammo.durability })
						await dropItemToGround(transaction.query, ctx.channelID, ammoRow.id)

						droppedItems.push({
							item: npc.ammo,
							row: ammoRow
						})
					}
				}

				// weapon durability is random
				const weapDurability = getRandomInt(Math.max(1, npc.weapon.durability / 4), npc.weapon.durability)
				const weapRow = await createItem(transaction.query, npc.weapon.name, { durability: weapDurability })
				await dropItemToGround(transaction.query, ctx.channelID, weapRow.id)

				droppedItems.push({
					item: npc.weapon,
					row: weapRow
				})
			}

			// roll random loot drops
			for (let i = 0; i < npc.drops.rolls; i++) {
				const lootDrop = this.app.npcHandler.getDrop(npc)

				if (lootDrop) {
					let itemDurability

					// item durability is random when dropped by npc
					if (lootDrop.durability) {
						itemDurability = getRandomInt(Math.max(1, lootDrop.durability / 4), lootDrop.durability)
					}

					const lootDropRow = await createItem(transaction.query, lootDrop.name, { durability: itemDurability })
					await dropItemToGround(transaction.query, ctx.channelID, lootDropRow.id)

					droppedItems.push({
						item: lootDrop,
						row: lootDropRow
					})
				}
			}

			await increaseKills(transaction.query, ctx.user.id, npc.type === 'boss' ? 'boss' : 'npc', 1)
			await addXp(transaction.query, ctx.user.id, npc.xp)
			await deleteNPC(transaction.query, ctx.channelID)
			// stop sending messages saying that an NPC is in the channel
			this.app.npcHandler.clearNPCInterval(ctx.channelID)
			// start timer to spawn a new NPC
			await this.app.npcHandler.spawnNPC(channel)

			// check if user had any npc kill quests
			for (const quest of userQuests) {
				if (quest.progress < quest.progressGoal) {
					if (
						(quest.questType === 'Boss Kills' && npc.type === 'boss') ||
						(quest.questType === 'Any Kills' || quest.questType === 'NPC Kills')
					) {
						await increaseProgress(transaction.query, quest.id, 1)
					}
				}
			}

			await transaction.commit()

			messages.push(`\n☠️ ${npcDisplayCapitalized} **DIED!** You earned 🌟 ***+${npc.xp}*** xp for this kill.`)

			const lootEmbed = new Embed()
				.setTitle('Items Dropped')
				.setDescription(sortItemsByLevel(droppedItems, true).map(itm => getItemDisplay(itm.item, itm.row)).join('\n'))
				.setFooter('These items were dropped onto the ground.')

			await ctx.send({
				content: messages.join('\n'),
				embeds: [lootEmbed.embed]
			})

			if (webhooks.pvp.id && webhooks.pvp.token) {
				await this.app.bot.executeWebhook(webhooks.pvp.id, webhooks.pvp.token, {
					content: `☠️ **${ctx.user.username}#${ctx.user.discriminator}** killed **${npcDisplayName}** using their ${getItemDisplay(userEquips.weapon.item)}.` +
						`${ammoPicked ? ` (ammo: ${getItemDisplay(ammoPicked.item)})` : ''}.`,
					embeds: [lootEmbed.embed]
				})
			}
		}
		else {
			if (!missedPartChoice) {
				await lowerNPCHealth(transaction.query, ctx.channelID, totalDamage)
				messages.push(`\n${npcDisplayCapitalized} is left with ${formatHealth(npcRow.health - totalDamage, npc.health)} **${npcRow.health - totalDamage}** health.`)
			}

			const attackResult = await this.app.npcHandler.attackPlayer(transaction.query, ctx.member, userData, userBackpack, npc, ctx.channelID, removedItems, raidType)

			await transaction.commit()

			// user attack npc message
			await ctx.send({
				content: messages.join('\n')
			})

			// npc attacks user message
			await ctx.send({
				content: attackResult.messages.join('\n'),
				embeds: attackResult.lootEmbed ? [attackResult.lootEmbed.embed] : undefined
			})

			if (userData.health - attackResult.damage <= 0) {
				// player died
				try {
					const member = await this.app.fetchMember(guild, ctx.user.id)
					this.app.clearRaidTimer(ctx.user.id)

					if (member) {
						await member.kick(`User was killed by NPC: ${npc.type} (${npc.display})`)
					}
				}
				catch (err) {
					logger.error(err)
				}

				const erisUser = await this.app.fetchUser(ctx.user.id)
				if (erisUser) {
					await messageUser(erisUser, {
						content: `${icons.danger} Raid failed!\n\n` +
							`You were killed by ${npc.type === 'boss' ? npc.display : `a ${npc.type}`} who hit you for **${attackResult.damage}** damage. Next time make sure you're well equipped to attack enemies.\n` +
							`You lost all the items in your inventory (**${userBackpackData.items.length - attackResult.removedItems}** items).`,
						embeds: attackResult.lootEmbed ? [attackResult.lootEmbed.embed] : undefined
					})
				}

				if (webhooks.pvp.id && webhooks.pvp.token) {
					await this.app.bot.executeWebhook(webhooks.pvp.id, webhooks.pvp.token, {
						content: `☠️ **${npcDisplayName}** killed **${ctx.user.username}#${ctx.user.discriminator}**!`,
						embeds: attackResult.lootEmbed ? [attackResult.lootEmbed.embed] : undefined
					})
				}
			}
		}
	}

	/**
	 * Performs all validations and attacks a user using an SQL transaction
	 * @param ctx Slash creator CommandContext
	 * @param guild Guild (for spawning the NPC in)
	 * @param raidType Location command was used in
	 * @param userAmmoChoice The ammo user used (if they had to pick one)
	 */
	async attackUser (ctx: CommandContext, guild: Eris.Guild, raidType: Location, userAmmoChoice?: ItemWithRowOfType<Ammunition>): Promise<void> {
		const member = ctx.members.get(ctx.options.user.target)
		const partChoice: BodyPart | undefined = ctx.options.user.limb

		if (!member) {
			await ctx.send({
				content: `${icons.danger} You need to pick someone to attack!`
			})
			return
		}
		else if (member.id === ctx.user.id) {
			await ctx.send({
				content: `${icons.warning} What are you doing? You can't attack yourself...`
			})
			return
		}

		const transaction = await beginTransaction()
		const victimData = await getUserRow(transaction.query, member.id, true)
		const userData = (await getUserRow(transaction.query, ctx.user.id, true))!
		const victimRaidRow = await getUsersRaid(transaction.query, member.id, true)

		if (!victimData || !victimRaidRow) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.warning} **${member.displayName}** is not active in this raid!`
			})
			return
		}

		const attackCD = await getCooldown(transaction.query, ctx.user.id, 'attack')
		const victimAttackShieldCD = await getCooldown(transaction.query, member.id, 'attack-shield')

		if (attackCD) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.timer} Your attack is on cooldown for **${attackCD}**. This is based on the attack rate of your weapon.`
			})
			return
		}

		else if (victimAttackShieldCD) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.timer} **${member.displayName}** has PvP protection for **${victimAttackShieldCD}** because they recently killed another player (this helps prevent kill sniping).`
			})
			return
		}

		else if (userData.level <= 1) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.danger} You are level **${userData.level}** and cannot engage in PvP until you reach level **2** (this is to help protect new players).`
			})
			return
		}

		else if (victimData.level <= 1) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.danger} **${member.displayName}** is only level **${victimData.level}** and has PvP protection until they reach level 2.`
			})
			return
		}

		const userBackpack = await getUserBackpack(transaction.query, ctx.user.id, true)
		const victimBackpack = await getUserBackpack(transaction.query, member.id, true)
		const activeStimulants = await getActiveStimulants(transaction.query, ctx.user.id, ['damage', 'fireRate', 'accuracy'], true)
		const victimStimulants = await getActiveStimulants(transaction.query, member.id, ['damage'], true)
		const activeAfflictions = await getAfflictions(transaction.query, ctx.user.id, true)
		const stimulantEffects = addStatusEffects(activeStimulants.map(stim => stim.stimulant), activeAfflictions.map(aff => aff.type))
		const victimEffects = addStatusEffects(victimStimulants.map(stim => stim.stimulant))
		const stimulantDamageMulti = (1 + (stimulantEffects.damageBonus / 100) - (victimEffects.damageReduction / 100))

		// in case victim dies and need to update ground items
		await getGroundItems(transaction.query, ctx.channelID, true)

		const userBackpackData = getItems(userBackpack)
		const victimBackpackData = getItems(victimBackpack)
		const userEquips = getEquips(userBackpack)
		const victimEquips = getEquips(victimBackpack)
		const victimItemsRemoved: number[] = []

		if (!userEquips.weapon) {
			await transaction.commit()

			await ctx.send({
				content: `${icons.warning} You don't have a weapon equipped. Equip a weapon from your inventory with \`/equip <item id>\`.`
			})
			return
		}

		const bodyPartHit = getBodyPartHit(userEquips.weapon.item.accuracy + stimulantEffects.accuracyBonus, partChoice)
		const missedPartChoice = partChoice && (partChoice !== bodyPartHit.result || !bodyPartHit.accurate)
		const attackCooldown = Math.max(1, Math.round(userEquips.weapon.item.fireRate * (1 - (stimulantEffects.fireRate / 100))))
		const messages = []
		const limbsHit = []
		let totalDamage
		let ammoPicked
		let lootEmbed
		let attackPenetration

		if (userEquips.weapon.item.type === 'Ranged Weapon') {
			const weaponUsed = userEquips.weapon.item
			const userPossibleAmmo = userBackpackData.items.filter((row, i) =>
				row.item.type === 'Ammunition' &&
				row.item.ammoFor.includes(weaponUsed) &&
				userBackpackData.items.map(r => r.item.name).indexOf(row.item.name) === i
			)

			if (!userPossibleAmmo.length) {
				await transaction.commit()

				await ctx.send({
					content: `${icons.danger} You don't have any ammo for your ${getItemDisplay(userEquips.weapon.item, userEquips.weapon.row, { showEquipped: false })}.` +
						` You need one of the following ammunitions in your inventory:\n\n${allItems.filter(i => i.type === 'Ammunition' && i.ammoFor.includes(weaponUsed)).map(i => getItemDisplay(i)).join(', ')}.`
				})
				return
			}
			else if (userAmmoChoice) {
				if (!userPossibleAmmo.some(i => i.row.id === userAmmoChoice.row.id)) {
					// the ammo user selected from pickAmmo() is no longer in their inventory (this could happen if the user dropped the ammo on ground while selecting)
					await transaction.commit()

					await ctx.send({
						content: `${icons.danger} You don't have a ${getItemDisplay(userAmmoChoice.item, userAmmoChoice.row)} in your inventory.`
					})
					return
				}

				ammoPicked = userAmmoChoice
			}
			else if (userPossibleAmmo.length === 1) {
				ammoPicked = userPossibleAmmo[0] as ItemWithRowOfType<Ammunition>
			}
			else {
				// have to commit transaction since user has to pick ammo and this can take up to 15 seconds
				await transaction.commit()

				ammoPicked = await this.pickAmmo(ctx, userEquips.weapon.item, userPossibleAmmo)

				if (!ammoPicked) {
					await ctx.send({
						content: `${icons.danger} There was an error with the ammo selection. The attack has been canceled.`
					})
					return
				}

				// rerun all validation with the users ammo choice (have to run all validations again after
				// user picks ammo because the users inventory could have changed while they were selecting)
				return this.attackUser(ctx, guild, raidType, ammoPicked)
			}

			attackPenetration = ammoPicked.item.penetration
			await deleteItem(transaction.query, ammoPicked.row.id)

			if (ammoPicked.item.spreadsDamageToLimbs) {
				limbsHit.push({
					damage: getAttackDamage((ammoPicked.item.damage * stimulantDamageMulti) / ammoPicked.item.spreadsDamageToLimbs, ammoPicked.item.penetration, bodyPartHit.result, victimEquips.armor?.item, victimEquips.helmet?.item),
					limb: bodyPartHit.result
				})

				for (let i = 0; i < ammoPicked.item.spreadsDamageToLimbs - 1; i++) {
					let limb = getBodyPartHit(userEquips.weapon.item.accuracy)

					// make sure no duplicate limbs are hit
					while (limbsHit.find(l => l.limb === limb.result)) {
						limb = getBodyPartHit(userEquips.weapon.item.accuracy)
					}

					limbsHit.push({
						damage: getAttackDamage((ammoPicked.item.damage * stimulantDamageMulti) / ammoPicked.item.spreadsDamageToLimbs, ammoPicked.item.penetration, limb.result, victimEquips.armor?.item, victimEquips.helmet?.item),
						limb: limb.result
					})
				}
			}
			else {
				limbsHit.push({
					damage: getAttackDamage((ammoPicked.item.damage * stimulantDamageMulti), ammoPicked.item.penetration, bodyPartHit.result, victimEquips.armor?.item, victimEquips.helmet?.item),
					limb: bodyPartHit.result
				})
			}

			totalDamage = limbsHit.reduce((prev, curr) => prev + curr.damage.total, 0)

			if (missedPartChoice) {
				messages.push(`${icons.danger} You try to shoot <@${member.id}> in the ${getBodyPartEmoji(partChoice!)} **${partChoice}** with your ${getItemDisplay(userEquips.weapon.item)} (ammo: ${getItemDisplay(ammoPicked.item)}) **BUT YOU MISS DUE TO WEAPON ACCURACY!**\n`)
			}
			else if (ammoPicked.item.spreadsDamageToLimbs) {
				const limbsHitStrings = []

				for (const limbHit of limbsHit) {
					limbsHitStrings.push(limbHit.limb === 'head' ? `${getBodyPartEmoji(limbHit.limb)} ***HEAD*** for **${limbHit.damage.total}** damage` : `${getBodyPartEmoji(limbHit.limb)} **${limbHit.limb}** for **${limbHit.damage.total}** damage`)
				}

				messages.push(`You shot <@${member.id}> in the ${combineArrayWithAnd(limbsHitStrings)} with your ${getItemDisplay(userEquips.weapon.item)} (ammo: ${getItemDisplay(ammoPicked.item)}). **${totalDamage}** damage dealt.\n`)
			}
			else {
				messages.push(`You shot <@${member.id}> in the ${getBodyPartEmoji(bodyPartHit.result)} **${bodyPartHit.result === 'head' ? '*HEAD*' : bodyPartHit.result}** with your ${getItemDisplay(userEquips.weapon.item)} (ammo: ${getItemDisplay(ammoPicked.item)}). **${totalDamage}** damage dealt.\n`)
			}
		}
		else {
			attackPenetration = userEquips.weapon.item.penetration
			limbsHit.push({
				damage: getAttackDamage((userEquips.weapon.item.damage * stimulantDamageMulti), userEquips.weapon.item.penetration, bodyPartHit.result, victimEquips.armor?.item, victimEquips.helmet?.item),
				limb: bodyPartHit.result
			})
			totalDamage = limbsHit[0].damage.total

			if (missedPartChoice) {
				messages.push(`${icons.danger} You try to hit <@${member.id}> in the ${getBodyPartEmoji(partChoice!)} **${partChoice}** with your ${getItemDisplay(userEquips.weapon.item)} **BUT YOU MISS DUE TO WEAPON ACCURACY!**\n`)
			}
			else {
				messages.push(`You hit <@${member.id}> in the ${getBodyPartEmoji(bodyPartHit.result)} **${bodyPartHit.result === 'head' ? '*HEAD*' : bodyPartHit.result}** with your ${getItemDisplay(userEquips.weapon.item)}. **${totalDamage}** damage dealt.\n`)
			}
		}

		// add attack cooldown based on weapon attack rate
		await createCooldown(transaction.query, ctx.user.id, 'attack', attackCooldown)

		// check if attacker has PvP protection and remove it if they attack another player
		if (await getCooldown(transaction.query, ctx.user.id, 'attack-shield')) {
			await clearCooldown(transaction.query, ctx.user.id, 'attack-shield')
		}

		// add message if users weapon accuracy allowed them to hit their targeted body part
		if (bodyPartHit.accurate) {
			messages.push(`${icons.crosshair} You hit the targeted limb (**${bodyPartHit.result}**)`)
		}

		// remove weapon annd ammo
		if (userEquips.weapon.row.durability - 1 <= 0) {
			messages.push(`${icons.danger} Your ${getItemDisplay(userEquips.weapon.item, userEquips.weapon.row, { showDurability: false, showEquipped: false })} broke from this attack.`)

			await deleteItem(transaction.query, userEquips.weapon.row.id)
		}
		else {
			messages.push(`Your ${getItemDisplay(userEquips.weapon.item, userEquips.weapon.row, { showDurability: false, showEquipped: false })} now has **${userEquips.weapon.row.durability - 1}** durability.`)

			await lowerItemDurability(transaction.query, userEquips.weapon.row.id, 1)
		}

		if (!missedPartChoice) {
			for (const result of limbsHit) {
				if (result.limb === 'head' && victimEquips.helmet) {
					messages.push(`**${member.displayName}**'s helmet (${getItemDisplay(victimEquips.helmet.item)}) reduced the damage by **${result.damage.reduced}**.`)

					// only lower helmet durability if attackers weapon penetrates at least 50% of
					// the level of armor victim is wearing (so if someone used a knife with 1.0 level penetration
					// against someone who had level 3 armor, the armor would NOT lose durability)
					if (attackPenetration >= victimEquips.helmet.item.level / 2) {
						if (victimEquips.helmet.row.durability - 1 <= 0) {
							messages.push(`**${member.displayName}**'s ${getItemDisplay(victimEquips.helmet.item)} broke from this attack!`)

							await deleteItem(transaction.query, victimEquips.helmet.row.id)
							victimItemsRemoved.push(victimEquips.helmet.row.id)
						}
						else {
							await lowerItemDurability(transaction.query, victimEquips.helmet.row.id, 1)
						}
					}
				}
				else if (result.limb === 'chest' && victimEquips.armor) {
					messages.push(`**${member.displayName}**'s armor (${getItemDisplay(victimEquips.armor.item)}) reduced the damage by **${result.damage.reduced}**.`)

					// only lower armor durability if attackers weapon penetrates at least 50% of
					// the level of armor victim is wearing (so if someone used a knife with 1.0 level penetration
					// against someone who had level 3 armor, the armor would NOT lose durability)
					if (attackPenetration >= victimEquips.armor.item.level / 2) {
						if (victimEquips.armor.row.durability - 1 <= 0) {
							messages.push(`**${member.displayName}**'s ${getItemDisplay(victimEquips.armor.item)} broke from this attack!`)

							await deleteItem(transaction.query, victimEquips.armor.row.id)
							victimItemsRemoved.push(victimEquips.armor.row.id)
						}
						else {
							await lowerItemDurability(transaction.query, victimEquips.armor.row.id, 1)
						}
					}
				}
				else if (result.limb === 'arm' && Math.random() <= 0.2) {
					messages.push(`**${member.displayName}**'s arm was broken! (+15% attack cooldown for 4 minutes)`)
					await createCooldown(transaction.query, member.id, 'broken-arm', 4 * 60)
				}
			}
		}

		// have to filter out the removed armor/helmet to prevent sql reference errors
		const victimLoot = victimBackpackData.items.filter(i => !victimItemsRemoved.includes(i.row.id))
		messages.push(`${icons.timer} Your attack is on cooldown for **${formatTime(attackCooldown * 1000)}**.`)

		if (!missedPartChoice && victimData.health - totalDamage <= 0) {
			const userQuests = (await getUserQuests(transaction.query, ctx.user.id, true)).filter(q => q.questType === 'Player Kills' || q.questType === 'Any Kills')
			let xpEarned = 15

			for (const victimItem of victimLoot) {
				// 3 xp per level of the item
				xpEarned += victimItem.item.itemLevel * 3

				await removeItemFromBackpack(transaction.query, victimItem.row.id)
				await dropItemToGround(transaction.query, ctx.channelID, victimItem.row.id)
			}

			// create dog tags for victim
			const dogTagsRow = await createItem(transaction.query, items.dog_tags.name, { displayName: `${member.user.username.replace(/`/g, '')}#${member.user.discriminator}'s dog tags` })
			await dropItemToGround(transaction.query, ctx.channelID, dogTagsRow.id)
			victimLoot.push({
				item: items.dog_tags,
				row: { ...dogTagsRow, equipped: 0 }
			})

			await increaseKills(transaction.query, ctx.user.id, 'player', 1)
			await increaseDeaths(transaction.query, member.id, 1)
			await addXp(transaction.query, ctx.user.id, xpEarned)
			await removeUserFromRaid(transaction.query, member.id)
			await createCooldown(transaction.query, member.id, `raid-${raidType.id}`, raidCooldown)

			// add attack shield since user killed another player
			await createCooldown(transaction.query, ctx.user.id, 'attack-shield', 40)

			// check if user has any kill quests
			for (const quest of userQuests) {
				if (quest.progress < quest.progressGoal) {
					await increaseProgress(transaction.query, quest.id, 1)
				}
			}

			messages.push(`\n☠️ **${member.displayName}** DIED! They dropped **${victimLoot.length}** items on the ground. Check the items they dropped with \`/ground view\`.`, `You earned 🌟 ***+${xpEarned}*** xp for this kill and PvP protection for **40 seconds**.`)
			lootEmbed = new Embed()
				.setTitle('Items Dropped')
				.setDescription(victimLoot.length ?
					`${sortItemsByLevel(victimLoot, true).slice(0, 10).map(victimItem => getItemDisplay(victimItem.item)).join('\n')}` +
						`${victimLoot.length > 10 ? `\n...and **${victimLoot.length - 10}** other item${victimLoot.length - 10 > 1 ? 's' : ''}` : ''}` :
					'No items were dropped.')
				.setFooter('These items were dropped onto the ground.')
		}
		else if (!missedPartChoice) {
			await lowerHealth(transaction.query, member.id, totalDamage)

			messages.push(`\n**${member.displayName}** is left with ${formatHealth(victimData.health - totalDamage, victimData.maxHealth)} **${victimData.health - totalDamage}** health.`)
		}

		// commit changes
		await transaction.commit()

		// send message to victim if they were killed.
		// this has to go after the transaction.commit() because if discord api is laggy,
		// it will cause the transaction to timeout (since the transaction would have to wait on discord to receive our message).
		if (!missedPartChoice && victimData.health - totalDamage <= 0) {
			try {
				const erisMember = await this.app.fetchMember(guild, member.id)
				this.app.clearRaidTimer(member.id)

				if (erisMember) {
					await erisMember.kick(`User was killed by ${ctx.user.username}#${ctx.user.discriminator} (${ctx.user.id})`)

					await messageUser(erisMember.user, {
						content: `${icons.danger} Raid failed!\n\n` +
							`You were killed by **${ctx.user.username}#${ctx.user.discriminator}** who hit you for **${totalDamage}** damage using their ${getItemDisplay(userEquips.weapon.item)}${ammoPicked ? ` (ammo: ${getItemDisplay(ammoPicked.item)})` : ''}.\n` +
							`You lost all the items in your inventory (**${victimLoot.length}** items).`,
						embeds: lootEmbed ? [lootEmbed.embed] : undefined
					})
				}

				if (webhooks.pvp.id && webhooks.pvp.token) {
					await this.app.bot.executeWebhook(webhooks.pvp.id, webhooks.pvp.token, {
						content: `☠️ **${ctx.user.username}#${ctx.user.discriminator}** killed **${member.user.username}#${member.user.discriminator}** using their ${getItemDisplay(userEquips.weapon.item)}.` +
							`${ammoPicked ? ` (ammo: ${getItemDisplay(ammoPicked.item)})` : ''}.`,
						embeds: lootEmbed ? [lootEmbed.embed] : undefined
					})
				}
			}
			catch (err) {
				logger.error(err)
			}
		}

		await ctx.send({
			content: messages.join('\n'),
			embeds: lootEmbed ? [lootEmbed.embed] : undefined
		})
	}

	async pickAmmo (ctx: CommandContext, weaponUsed: RangedWeapon, possibleAmmos: ItemWithRow<BackpackItemRow>[]): Promise<ItemWithRowOfType<Ammunition> | undefined> {
		await ctx.defer()

		const ammoSortedByBest = sortItemsByAmmo(possibleAmmos, true)
		const botMessage = await ctx.send({
			content: `You have multiple ammo types for your ${getItemDisplay(weaponUsed)}, which ammo do you want to use?`,
			components: [{
				type: ComponentType.ACTION_ROW,
				components: ammoSortedByBest.map(ammo => {
					const iconID = ammo.item.icon.match(/:([0-9]*)>/)

					return {
						type: ComponentType.BUTTON,
						label: ammo.item.name,
						custom_id: ammo.item.name,
						style: ButtonStyle.SECONDARY,
						emoji: iconID ? {
							id: iconID[1]
						} : undefined
					}
				})
			}]
		}) as Message

		try {
			const ammoPickedCtx = (await this.app.componentCollector.awaitClicks(botMessage.id, i => i.user.id === ctx.user.id))[0]
			const ammoPicked = possibleAmmos.find(i => i.item.name === ammoPickedCtx.customID)

			await ammoPickedCtx.editParent({
				content: `You have multiple ammo types for your ${getItemDisplay(weaponUsed)}, which ammo do you want to use?`,
				components: [{
					type: ComponentType.ACTION_ROW,
					components: ammoSortedByBest.map(ammo => {
						const iconID = ammo.item.icon.match(/:([0-9]*)>/)

						return {
							type: ComponentType.BUTTON,
							label: ammo.item.name,
							custom_id: ammo.item.name,
							style: ammoPicked?.item.name === ammo.item.name ? ButtonStyle.PRIMARY : ButtonStyle.SECONDARY,
							emoji: iconID ? {
								id: iconID[1]
							} : undefined,
							disabled: true
						}
					})
				}]
			})

			return ammoPicked as ItemWithRowOfType<Ammunition> | undefined
		}
		catch (err) {
			await botMessage.edit({
				content: `You have multiple ammo types for your ${getItemDisplay(weaponUsed)}, which ammo do you want to use?`,
				components: [{
					type: ComponentType.ACTION_ROW,
					components: ammoSortedByBest.map((ammo, index) => {
						const iconID = ammo.item.icon.match(/:([0-9]*)>/)

						return {
							type: ComponentType.BUTTON,
							label: ammo.item.name,
							custom_id: ammo.item.name,
							style: index === 0 ? ButtonStyle.PRIMARY : ButtonStyle.SECONDARY,
							emoji: iconID ? {
								id: iconID[1]
							} : undefined,
							disabled: true
						}
					})
				}]
			})

			// user didn't pick anything, return the best possible ammo
			return ammoSortedByBest[0] as ItemWithRowOfType<Ammunition>
		}
	}
}

export default AttackCommand
