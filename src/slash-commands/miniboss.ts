import { SlashCreator, CommandContext, ComponentType, Message } from 'slash-create'
import App from '../app'
import { icons, webhooks } from '../config'
import { NPC } from '../types/NPCs'
import { isValidLocation, locations } from '../resources/locations'
import CustomSlashCommand from '../structures/CustomSlashCommand'
import Embed from '../structures/Embed'
import { MeleeWeapon, RangedWeapon, Stimulant, ThrowableWeapon } from '../types/Items'
import { Location } from '../types/Locations'
import { addItemToBackpack, createItem, deleteItem, getUserBackpack, lowerItemDurability } from '../utils/db/items'
import { beginTransaction, query } from '../utils/db/mysql'
import { addHealth, addXp, getUserRow, increaseKills, setFighting } from '../utils/db/players'
import { getUserQuest, increaseProgress } from '../utils/db/quests'
import { backpackHasSpace, getEquips, getItemDisplay, getItems, sortItemsByLevel } from '../utils/itemUtils'
import { logger } from '../utils/logger'
import getRandomInt from '../utils/randomInt'
import { combineArrayWithAnd, formatHealth, getAfflictionEmoji, getBodyPartEmoji, getRarityDisplay } from '../utils/stringUtils'
import { BackpackItemRow, ItemRow, ItemWithRow, UserRow } from '../types/mysql'
import { Affliction, AfflictionName, afflictions } from '../resources/afflictions'
import { addStatusEffects, getEffectsDisplay } from '../utils/playerUtils'
import { ResolvedMember } from 'slash-create/lib/structures/resolvedMember'
import { awaitPlayerChoices, getAttackDamage, getAttackString, getBodyPartHit, isFleeChoice, isHealChoice, isStimulantChoice, PlayerChoice } from '../utils/duelUtils'
import { GRAY_BUTTON, GREEN_BUTTON, RED_BUTTON } from '../utils/constants'
import { attackPlayer, getMobChoice, getMobDisplay, getMobDrop } from '../utils/npcUtils'
import { createCooldown, getCooldown } from '../utils/db/cooldowns'
import { EmbedOptions } from 'eris'
import SellCommand from './sell'

interface Player {
	member: ResolvedMember
	data: UserRow
	stimulants: Stimulant[]
	afflictions: Affliction[]
	inventory: BackpackItemRow[]
}

interface BaseOrderedChoice {
	type: 'player' | 'npc'
	speed: number
	random: number
}
interface OrderedPlayerChoice extends BaseOrderedChoice, Player {
	type: 'player'
	selection?: PlayerChoice
}
interface OrderedMobChoice extends BaseOrderedChoice {
	type: 'npc'
}
type OrderedChoice = OrderedPlayerChoice | OrderedMobChoice

class BossCommand extends CustomSlashCommand<'miniboss'> {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'miniboss',
			description: 'Fight the miniboss of your current region!',
			longDescription: 'Fight the miniboss of the region you are currently at.' +
				' Minibosses may drop key items used to fight the main boss of the region.' +
				' The difference is you cannot invite your friends to help you fight the miniboss.',
			options: [],
			category: 'scavenging',
			guildModsOnly: false,
			worksInDMs: false,
			worksDuringDuel: false,
			noDefer: true,
			guildIDs: [],
			minimumLocationLevel: 3
		})

		this.filePath = __filename
	}

	async run (ctx: CommandContext): Promise<void> {
		if (!ctx.member) {
			throw new Error('Member not attached to interaction')
		}

		const teammates = [ctx.members.get(ctx.options.user), ctx.members.get(ctx.options['user-2'])].filter(Boolean) as ResolvedMember[]
		const preUserData = (await getUserRow(query, ctx.user.id))!
		const preUserBackpack = await getUserBackpack(query, ctx.user.id)

		if (!isValidLocation(preUserData.currentLocation)) {
			await ctx.send({
				content: `${icons.warning} You need to travel to a region. Use the \`/travel\` command to travel to a region you want to fight the boss of.`
			})
			return
		}
		else if (!backpackHasSpace(preUserBackpack, 0)) {
			const botMessage = await ctx.send({
				content: `${icons.warning} You are overweight, you will need to clear some space in your inventory to start a boss fight.`,
				components: [{
					type: ComponentType.ACTION_ROW,
					components: [GRAY_BUTTON('Sell Items', 'sell')]
				}]
			}) as Message

			try {
				const confirmed = (await this.app.componentCollector.awaitClicks(botMessage.id, i => i.user.id === ctx.user.id))[0]

				if (confirmed.customID === 'sell') {
					const sellCommand = new SellCommand(this.app.slashCreator, this.app)

					await sellCommand.run(ctx)
				}
			}
			catch (err) {
				// continue
				await botMessage.edit({
					components: [{
						type: ComponentType.ACTION_ROW,
						components: [GRAY_BUTTON('Sell Items', 'sell', true)]
					}]
				})
			}
			return
		}
		else if (this.app.channelsWithActiveDuel.has(ctx.channelID)) {
			await ctx.send({
				content: `${icons.error_pain} There is already another fight occuring in this channel! Wait for other scavengers to finish their fight or head to a different channel.`
			})
			return
		}

		const location = locations[preUserData.currentLocation]
		const preMembersData: { member: ResolvedMember, data: UserRow }[] = [{ member: ctx.member, data: preUserData }]
		const preBossCD = await getCooldown(query, ctx.user.id, `miniboss-${location.display}`)

		if (!location.miniboss) {
			await ctx.send({
				content: `${icons.danger} There is no miniboss in ${location.icon} **${location.display}**.`
			})
			return
		}

		for (const member of teammates) {
			if (member.id === ctx.user.id) {
				await ctx.send({
					content: `${icons.danger} Are you trying to invite yourself to fight the boss? Try inviting someone else, perhaps a friend...`
				})
				return
			}

			const memberData = await getUserRow(query, member.id)
			if (!memberData) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** does not have an account!`
				})
				return
			}
			else if (memberData.fighting) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** is in another fight right now!`
				})
				return
			}
			else if (memberData.locationLevel !== preUserData.locationLevel) {
				if (memberData.locationLevel > preUserData.locationLevel) {
					await ctx.send({
						content: `${icons.warning} **${member.displayName}** has traveled to a higher tiered region than you. You can only invite players who are the same region tier as you (Region tier ${preUserData.locationLevel}).`
					})
				}
				else {
					await ctx.send({
						content: `${icons.warning} You cannot assist **${member.displayName}** because you are a higher region tier than them. You can only invite players who are the same region tier as you (Region tier ${preUserData.locationLevel}).`
					})
				}
				return
			}
			else if (!isValidLocation(memberData.currentLocation) || memberData.currentLocation !== preUserData.currentLocation) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** is not located in the same region, they need to \`/travel\` to **${location.display}**.`
				})
				return
			}

			const memberBossCD = await getCooldown(query, member.id, `miniboss-${location.display}`)

			if (memberBossCD) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** recently fought **${location.miniboss.npc.display}**, they can attempt the boss fight again in **${memberBossCD}**.`
				})
				return
			}

			const memberBackpack = await getUserBackpack(query, member.id)

			if (!backpackHasSpace(memberBackpack, 0)) {
				await ctx.send({
					content: `${icons.warning} **${member.displayName}** is overweight, they will need to clear some space in their inventory.`
				})
				return
			}

			preMembersData.push({ member, data: memberData })
		}

		await ctx.send({
			content: preBossCD ?
				`<@${ctx.user.id}>, You recently fought **${location.miniboss.npc.display}**, you can attempt the boss fight again in **${preBossCD}**.` :
				`${preMembersData.map(d => `<@${d.member.id}>`).join(' ')}, You must ready up to start the fight.`,
			embeds: [this.getAgreementEmbed(location, preMembersData.map(d => d.member), []).embed],
			components: [{
				type: ComponentType.ACTION_ROW,
				components: [GREEN_BUTTON('Ready Up', 'accept', !!preBossCD)]
			}]
		})

		if (preBossCD) {
			return
		}

		let botMessage = await ctx.fetch()

		try {
			await this.awaitPlayerAgreements(botMessage, location, preMembersData.map(d => d.member))
		}
		catch (err) {
			await botMessage.edit({
				content: `${icons.danger} You did not ready up! The fight has been canceled.`,
				components: []
			})
			return
		}

		const preTransaction = await beginTransaction()
		let players: Player[] = []

		for (const player of preMembersData) {
			const memberData = await getUserRow(preTransaction.query, player.member.id, true)

			if (!memberData) {
				await preTransaction.commit()

				await botMessage.edit({
					content: `${icons.danger} **${player.member.displayName}** does not have an account!`,
					components: []
				})
				return
			}
			else if (memberData.fighting) {
				await preTransaction.commit()

				await botMessage.edit({
					content: `${icons.warning} **${player.member.displayName}** is in another fight right now!`,
					components: []
				})
				return
			}
			else if (!isValidLocation(memberData.currentLocation) || memberData.currentLocation !== preUserData.currentLocation) {
				await preTransaction.commit()

				await botMessage.edit({
					content: `${icons.warning} **${player.member.displayName}** traveled to a different region, they need to \`/travel\` to **${location.display}**.`,
					components: []
				})
				return
			}

			const memberBossCD = await getCooldown(preTransaction.query, player.member.id, `miniboss-${location.display}`)

			if (memberBossCD) {
				await preTransaction.commit()

				await botMessage.edit({
					content: `${icons.warning} **${player.member.displayName}** recently fought **${location.miniboss.npc.display}**, they can attempt the boss fight again in **${memberBossCD}**.`,
					components: []
				})
				return
			}

			const memberBackpack = await getUserBackpack(preTransaction.query, player.member.id, true)

			if (!backpackHasSpace(memberBackpack, 0)) {
				await preTransaction.commit()

				await botMessage.edit({
					content: `${icons.warning} **${player.member.displayName}** is overweight, they will need to clear some space in their inventory.`,
					components: []
				})
				return
			}
			else if (this.app.channelsWithActiveDuel.has(ctx.channelID)) {
				await preTransaction.commit()

				await botMessage.edit({
					content: `${icons.error_pain} There is already another fight occuring in this channel! Wait for other scavengers to finish their fight or head to a different channel.`,
					components: []
				})
				return
			}

			await setFighting(preTransaction.query, player.member.id, true)
			await createCooldown(preTransaction.query, player.member.id, `miniboss-${location.display}`, location.miniboss.cooldown)
			players.push({ member: player.member, data: memberData, stimulants: [], afflictions: [], inventory: memberBackpack })
		}

		await preTransaction.commit()

		const npcStimulants: Stimulant[] = []
		const npcAfflictions: Affliction[] = []
		let npcHealth = location.miniboss.npc.health
		let turnNumber = 1
		let duelIsActive = true

		this.app.channelsWithActiveDuel.add(ctx.channelID)

		await botMessage.edit({
			content: `${players.map(p => `<@${p.member.id}>`).join(' ')}, Turn #1 - select your action:`,
			embeds: [
				this.getMobDuelEmbed(
					players,
					location.miniboss.npc,
					npcHealth,
					turnNumber,
					npcStimulants,
					npcAfflictions
				).embed
			],
			components: [{
				type: ComponentType.ACTION_ROW,
				components: [GRAY_BUTTON('Attack', 'attack', false, '🗡️'), GRAY_BUTTON('Use Medical Item', 'heal', false, '🩹'), GRAY_BUTTON('Use Stimulant', 'stimulant', false, '💉'), RED_BUTTON('Try to Flee', 'flee')]
			}]
		})

		while (duelIsActive) {
			try {
				const playerChoices = await awaitPlayerChoices(
					this.app.componentCollector,
					botMessage,
					players.map(p => ({ member: p.member, stims: p.stimulants, afflictions: p.afflictions })),
					turnNumber
				)

				const playersWithChoices = players.map(p => ({ ...p, selection: playerChoices.get(p.member.id) }))
				const npcChoice = getMobChoice(location.miniboss.npc, npcStimulants, npcHealth, turnNumber)
				const orderedChoices: OrderedChoice[] = [
					{ type: ('npc' as const), speed: npcChoice.speed, random: Math.random() },
					...playersWithChoices.map(c => ({ ...c, type: ('player' as const), speed: c.selection?.speed || 0, random: Math.random() }))]
					.sort((a, b) => {
						if (a.speed > b.speed) {
							return -1
						}
						else if (a.speed < b.speed) {
							return 1
						}

						return b.random - a.random
					})
				const messages: string[][] = [[], ...players.map(p => [])]
				const npcDisplayName = `**${location.miniboss.npc.display}**`
				const lootEmbeds: EmbedOptions[] = []
				let msgContent

				for (let i = 0; i < orderedChoices.length; i++) {
					const choiceInfo = orderedChoices[i]

					if (choiceInfo.type === 'npc') {
						// npc turn

						if (npcChoice.choice === 'attack') {
							const playerToAttack = players[Math.floor(Math.random() * players.length)]
							const atkTransaction = await beginTransaction()

							const playerRow = (await getUserRow(atkTransaction.query, playerToAttack.member.id, true))!
							const playerBackpackRows = await getUserBackpack(atkTransaction.query, playerToAttack.member.id, true)
							const attackResult = await attackPlayer(
								atkTransaction.query,
								playerToAttack.member,
								playerRow,
								playerBackpackRows,
								location.miniboss.npc,
								playerToAttack.stimulants,
								playerToAttack.afflictions,
								npcStimulants,
								npcAfflictions
							)

							messages[i].push(...attackResult.messages)

							await atkTransaction.commit()

							if (playerRow.health - attackResult.damage <= 0) {
								players = players.filter(p => p.member.id !== playerToAttack.member.id)

								if (!attackResult.savedByCompanion) {
									const lootLostEmbed = new Embed()
										.setAuthor(`${playerToAttack.member.user.username}#${playerToAttack.member.user.discriminator}'s Loot Lost`, playerToAttack.member.avatarURL)
										.setColor(16734296)
										.setDescription(attackResult.lostItems.length ?
											`${sortItemsByLevel(attackResult.lostItems, true).slice(0, 15).map(victimItem => getItemDisplay(victimItem.item, victimItem.row, { showEquipped: false, showDurability: false })).join('\n')}` +
											`${attackResult.lostItems.length > 15 ? `\n...and **${attackResult.lostItems.length - 15}** other item${attackResult.lostItems.length - 15 > 1 ? 's' : ''}` : ''}` :
											'No items were lost.')

									lootEmbeds.push({ ...lootLostEmbed.embed })

									// removing the author field because I dont want user avatars to show in the global kill feed,
									// who knows what kind of weird pfp someone could have
									lootLostEmbed.embed.author = undefined
									lootLostEmbed.setTitle('__Loot Lost__')

									if (webhooks.pvp.id && webhooks.pvp.token) {
										try {
											await this.app.bot.executeWebhook(webhooks.pvp.id, webhooks.pvp.token, {
												content: `☠️ ${npcDisplayName} (${location.display} Boss) killed **${playerToAttack.member.user.username}#${playerToAttack.member.user.discriminator}**!`,
												embeds: [lootLostEmbed.embed]
											})
										}
										catch (err) {
											logger.warn(err)
										}
									}
								}

								if (!players.length) {
									// all players died, end the duel
									duelIsActive = false
									this.app.channelsWithActiveDuel.delete(ctx.channelID)
									break
								}
							}
						}
						else if (npcChoice.choice === 'use a medical item') {
							const maxHeal = Math.min(location.miniboss.npc.health - npcHealth, npcChoice.item.healsFor)
							const curedAfflictions = []

							if (npcChoice.item.curesBitten || npcChoice.item.curesBrokenArm || npcChoice.item.curesBurning) {
								for (let affIndex = npcAfflictions.length - 1; affIndex >= 0; affIndex--) {
									const affliction = npcAfflictions[affIndex]

									if (npcChoice.item.curesBitten && affliction.name === 'Bitten') {
										curedAfflictions.push(affliction)
										npcAfflictions.splice(affIndex, 1)
									}
									else if (npcChoice.item.curesBrokenArm && affliction.name === 'Broken Arm') {
										curedAfflictions.push(affliction)
										npcAfflictions.splice(affIndex, 1)
									}
									else if (npcChoice.item.curesBurning && affliction.name === 'Burning') {
										curedAfflictions.push(affliction)
										npcAfflictions.splice(affIndex, 1)
									}
								}
							}

							npcHealth += maxHeal

							messages[i].push(`${npcDisplayName} uses a ${getItemDisplay(npcChoice.item)} to heal for **${maxHeal}** health.` +
								`\n${npcDisplayName} now has ${formatHealth(npcHealth, location.miniboss.npc.health)} **${npcHealth} / ${location.miniboss.npc.health}** health.` +
								`${curedAfflictions.length ? `\n${npcDisplayName} cured the following afflictions: ${combineArrayWithAnd(curedAfflictions.map(a => a.name))}` : ''}`)
						}
						else if (npcChoice.choice === 'use a stimulant') {
							const effectsDisplay = getEffectsDisplay(npcChoice.item.effects)

							npcStimulants.push(npcChoice.item)

							messages[i].push(`${npcDisplayName} injects themself with ${getItemDisplay(npcChoice.item)}.` +
								`\n\n__Effects Received__\n${effectsDisplay.join('\n')}`)
						}
						else {
							messages[i].push(`${npcDisplayName} sits this turn out.`)
						}
					}
					else if (!players.some(p => p.member.id === choiceInfo.member.id)) {
						messages[i].push(`<@${choiceInfo.member.id}> died before they could ${choiceInfo.selection?.choice || 'take action'}.`)
					}
					else if (!choiceInfo.selection) {
						messages[i].push(`<@${choiceInfo.member.id}> did not select an action.`)
					}
					else if (isFleeChoice(choiceInfo.selection)) {
						const chance = 0.15

						if (Math.random() <= chance) {
							// success
							messages[i].push(`<@${choiceInfo.member.id}> flees from the duel!`)
							players = players.filter(p => p.member.id !== choiceInfo.member.id)

							await setFighting(query, choiceInfo.member.id, false)

							if (!players.length) {
								// end duel if all players flee or died
								this.app.channelsWithActiveDuel.delete(ctx.channelID)
								duelIsActive = false
								break
							}
						}
						else {
							messages[i].push(`${icons.danger} <@${choiceInfo.member.id}> tries to flee from the duel (15% chance) but fails!`)
						}
					}
					else if (isHealChoice(choiceInfo.selection)) {
						const choice = choiceInfo.selection
						const healTransaction = await beginTransaction()
						const playerData = (await getUserRow(healTransaction.query, choiceInfo.member.id, true))!
						const playerBackpackRows = await getUserBackpack(healTransaction.query, choiceInfo.member.id, true)
						const playerInventory = getItems(playerBackpackRows)

						const hasItem = playerInventory.items.find(itm => itm.row.id === choice.itemRow.row.id)

						if (!hasItem) {
							await healTransaction.commit()
							messages[i].push(`${icons.danger} <@${choiceInfo.member.id}> did not have the item they wanted to heal with. Their turn has been skipped.`)
							continue
						}

						const maxHeal = Math.min(playerData.maxHealth - playerData.health, choice.itemRow.item.healsFor)
						const curedAfflictions = []

						if (!choice.itemRow.row.durability || choice.itemRow.row.durability - 1 <= 0) {
							await deleteItem(healTransaction.query, choice.itemRow.row.id)
						}
						else {
							await lowerItemDurability(healTransaction.query, choice.itemRow.row.id, 1)
						}

						if (choice.itemRow.item.curesBitten || choice.itemRow.item.curesBrokenArm || choice.itemRow.item.curesBurning) {
							for (let affIndex = choiceInfo.afflictions.length - 1; affIndex >= 0; affIndex--) {
								const affliction = choiceInfo.afflictions[affIndex]

								if (choice.itemRow.item.curesBitten && affliction.name === 'Bitten') {
									curedAfflictions.push(affliction)
									choiceInfo.afflictions.splice(affIndex, 1)
								}
								else if (choice.itemRow.item.curesBrokenArm && affliction.name === 'Broken Arm') {
									curedAfflictions.push(affliction)
									choiceInfo.afflictions.splice(affIndex, 1)
								}
								else if (choice.itemRow.item.curesBurning && affliction.name === 'Burning') {
									curedAfflictions.push(affliction)
									choiceInfo.afflictions.splice(affIndex, 1)
								}
							}
						}

						await addHealth(healTransaction.query, choiceInfo.member.id, maxHeal)
						await healTransaction.commit()

						const itemDisplay = getItemDisplay(choice.itemRow.item, {
							...choice.itemRow.row,
							durability: choice.itemRow.row.durability ? choice.itemRow.row.durability - 1 : undefined
						}, {
							showID: false
						})

						messages[i].push(`<@${choiceInfo.member.id}> uses a ${itemDisplay} to heal for **${maxHeal}** health.` +
							`\n**${choiceInfo.member.displayName}** now has ${formatHealth(playerData.health + maxHeal, playerData.maxHealth)} **${playerData.health + maxHeal} / ${playerData.maxHealth}** health.` +
							`${curedAfflictions.length ? `\n**${choiceInfo.member.displayName}** cured the following afflictions: ${combineArrayWithAnd(curedAfflictions.map(a => a.name))}` : ''}`)
					}
					else if (isStimulantChoice(choiceInfo.selection)) {
						const choice = choiceInfo.selection
						const stimTransaction = await beginTransaction()
						const playerBackpackRows = await getUserBackpack(stimTransaction.query, choiceInfo.member.id, true)
						const playerInventory = getItems(playerBackpackRows)

						const hasItem = playerInventory.items.find(itm => itm.row.id === choice.itemRow.row.id)

						if (!hasItem) {
							await stimTransaction.commit()
							messages[i].push(`${icons.danger} <@${choiceInfo.member.id}> did not have the stimulant they wanted to use. Their turn has been skipped.`)
							continue
						}

						if (!choice.itemRow.row.durability || choice.itemRow.row.durability - 1 <= 0) {
							await deleteItem(stimTransaction.query, choice.itemRow.row.id)
						}
						else {
							await lowerItemDurability(stimTransaction.query, choice.itemRow.row.id, 1)
						}

						// ensure multiple of the same stimulant don't stack
						if (!choiceInfo.stimulants.includes(choice.itemRow.item)) {
							choiceInfo.stimulants.push(choice.itemRow.item)
						}

						await stimTransaction.commit()

						const itemDisplay = getItemDisplay(choice.itemRow.item, {
							...choice.itemRow.row,
							durability: choice.itemRow.row.durability ? choice.itemRow.row.durability - 1 : undefined
						}, {
							showID: false
						})
						const effectsDisplay = getEffectsDisplay(choice.itemRow.item.effects)

						messages[i].push(`<@${choiceInfo.member.id}> injects themself with ${itemDisplay}.` +
							`\n\n__Effects Received__\n${effectsDisplay.join('\n')}`)
					}
					else {
						// user chose to attack
						const atkTransaction = await beginTransaction()
						const choice = choiceInfo.selection

						const playerBackpackRows = await getUserBackpack(atkTransaction.query, choiceInfo.member.id, true)
						const playerInventory = getItems(playerBackpackRows)
						const stimulantEffects = addStatusEffects(choiceInfo.stimulants, choiceInfo.afflictions)
						const victimEffects = addStatusEffects(npcStimulants, npcAfflictions)
						const stimulantDamageMulti = (1 + (stimulantEffects.damageBonus / 100) - ((victimEffects.damageTaken * -1) / 100))

						const weaponChoice = choice.weapon
						const hasWeapon = !weaponChoice.row || playerInventory.items.find(itm => itm.row.id === weaponChoice.row.id)
						const hasAmmo = playerInventory.items.find(itm => itm.row.id === choice.ammo?.row.id)
						const bodyPartHit = getBodyPartHit(choice.weapon.item.accuracy + stimulantEffects.accuracyBonus, choice.limbTarget)
						const missedPartChoice = choice.limbTarget && (choice.limbTarget !== bodyPartHit.result || !bodyPartHit.accurate)
						const limbsHit = []
						let totalDamage

						// verify user has weapon they want to attack with
						if (!hasWeapon || !choice.weapon) {
							await atkTransaction.commit()
							messages[i].push(`${icons.danger} <@${choiceInfo.member.id}> did not have the weapon they wanted to use. Their turn has been skipped.`)
							continue
						}
						else if (choice.weapon.item.type === 'Ranged Weapon') {
							if (!hasAmmo || !choice.ammo) {
								await atkTransaction.commit()
								messages[i].push(`${icons.danger} <@${choiceInfo.member.id}> did not have the ammunition they wanted to use. Their turn has been skipped.`)
								continue
							}

							await deleteItem(atkTransaction.query, choice.ammo.row.id)

							if (choice.ammo.item.spreadsDamageToLimbs) {
								limbsHit.push({
									damage: getAttackDamage((choice.ammo.item.damage * stimulantDamageMulti) / choice.ammo.item.spreadsDamageToLimbs, choice.ammo.item.penetration, bodyPartHit.result, location.miniboss.npc.armor, location.miniboss.npc.helmet),
									limb: bodyPartHit.result
								})

								for (let i2 = 0; i2 < choice.ammo.item.spreadsDamageToLimbs - 1; i2++) {
									let limb = getBodyPartHit(choice.weapon.item.accuracy)

									// make sure no duplicate limbs are hit
									while (limbsHit.find(l => l.limb === limb.result)) {
										limb = getBodyPartHit(choice.weapon.item.accuracy)
									}

									limbsHit.push({
										damage: getAttackDamage((choice.ammo.item.damage * stimulantDamageMulti) / choice.ammo.item.spreadsDamageToLimbs, choice.ammo.item.penetration, limb.result, location.miniboss.npc.armor, location.miniboss.npc.helmet),
										limb: limb.result
									})
								}
							}
							else {
								limbsHit.push({
									damage: getAttackDamage((choice.ammo.item.damage * stimulantDamageMulti), choice.ammo.item.penetration, bodyPartHit.result, location.miniboss.npc.armor, location.miniboss.npc.helmet),
									limb: bodyPartHit.result
								})
							}

							totalDamage = limbsHit.reduce((prev, curr) => prev + curr.damage.total, 0)

							if (missedPartChoice) {
								messages[i].push(`<@${choiceInfo.member.id}> tries to shoot ${npcDisplayName} in the ${getBodyPartEmoji(choice.limbTarget!)} **${choice.limbTarget}** with their ${getItemDisplay(choice.weapon.item, choice.weapon.row, { showDurability: false })} (ammo: ${getItemDisplay(choice.ammo.item)}) **BUT MISSES!**\n`)
							}
							else {
								messages[i].push(getAttackString(choice.weapon as ItemWithRow<ItemRow, RangedWeapon>, `<@${choiceInfo.member.id}>`, npcDisplayName, limbsHit, totalDamage, choice.ammo.item))
							}
						}
						else if (choice.weapon.item.type === 'Throwable Weapon') {
							if (choice.weapon.item.spreadsDamageToLimbs) {
								limbsHit.push({
									damage: getAttackDamage((choice.weapon.item.damage * stimulantDamageMulti) / choice.weapon.item.spreadsDamageToLimbs, choice.weapon.item.penetration, bodyPartHit.result, location.miniboss.npc.armor, location.miniboss.npc.helmet),
									limb: bodyPartHit.result
								})

								for (let i2 = 0; i2 < choice.weapon.item.spreadsDamageToLimbs - 1; i2++) {
									let limb = getBodyPartHit(choice.weapon.item.accuracy)

									// make sure no duplicate limbs are hit
									while (limbsHit.find(l => l.limb === limb.result)) {
										limb = getBodyPartHit(choice.weapon.item.accuracy)
									}

									limbsHit.push({
										damage: getAttackDamage((choice.weapon.item.damage * stimulantDamageMulti) / choice.weapon.item.spreadsDamageToLimbs, choice.weapon.item.penetration, limb.result, location.miniboss.npc.armor, location.miniboss.npc.helmet),
										limb: limb.result
									})
								}
							}
							else {
								limbsHit.push({
									damage: getAttackDamage((choice.weapon.item.damage * stimulantDamageMulti), choice.weapon.item.penetration, bodyPartHit.result, location.miniboss.npc.armor, location.miniboss.npc.helmet),
									limb: bodyPartHit.result
								})
							}

							totalDamage = limbsHit.reduce((prev, curr) => prev + curr.damage.total, 0)

							if (missedPartChoice) {
								messages[i].push(`${icons.danger} <@${choiceInfo.member.id}> tries to throw a ${getItemDisplay(choice.weapon.item, choice.weapon.row)} at ${npcDisplayName}'s ${getBodyPartEmoji(choice.limbTarget!)} **${choice.limbTarget}** **BUT MISSES!**\n`)
							}
							else {
								messages[i].push(getAttackString(choice.weapon as ItemWithRow<ItemRow, ThrowableWeapon>, `<@${choiceInfo.member.id}>`, `${npcDisplayName}`, limbsHit, totalDamage))

								if (choice.weapon.item.subtype === 'Incendiary Grenade' && !npcAfflictions.includes(afflictions.Burning)) {
									messages[i].push(`${icons.postive_effect_debuff} ${npcDisplayName} is ${getAfflictionEmoji('Burning')} Burning! (${combineArrayWithAnd(getEffectsDisplay(afflictions.Burning.effects))})`)

									npcAfflictions.push(afflictions.Burning)
								}
							}
						}
						else {
							// melee weapon
							limbsHit.push({
								damage: getAttackDamage((choice.weapon.item.damage * stimulantDamageMulti), choice.weapon.item.penetration, bodyPartHit.result, location.miniboss.npc.armor, location.miniboss.npc.helmet),
								limb: bodyPartHit.result
							})
							totalDamage = limbsHit[0].damage.total

							if (missedPartChoice) {
								messages[i].push(`${icons.danger} <@${choiceInfo.member.id}> tries to hit ${npcDisplayName} in the ${getBodyPartEmoji(choice.limbTarget!)} **${choice.limbTarget}** with their ${getItemDisplay(choice.weapon.item, choice.weapon.row)} **BUT MISSES!**\n`)
							}
							else {
								messages[i].push(getAttackString(choice.weapon as ItemWithRow<ItemRow, MeleeWeapon>, `<@${choiceInfo.member.id}>`, `${npcDisplayName}`, limbsHit, totalDamage))
							}
						}

						// remove weapon
						if (choice.weapon.row && (!choice.weapon.row.durability || choice.weapon.row.durability - 1 <= 0)) {
							messages[i].push(`${icons.danger} **${choiceInfo.member.displayName}**'s ${getItemDisplay(choice.weapon.item)} broke from this attack.`)

							await deleteItem(atkTransaction.query, choice.weapon.row.id)
						}
						else if (choice.weapon.row && choice.weapon.row.durability) {
							messages[i].push(`**${choiceInfo.member.displayName}**'s ${getItemDisplay(choice.weapon.item)} now has **${choice.weapon.row.durability - 1}** durability.`)

							await lowerItemDurability(atkTransaction.query, choice.weapon.row.id, 1)
						}

						if (!missedPartChoice) {
							for (const result of limbsHit) {
								if (result.limb === 'head' && location.miniboss.npc.helmet) {
									messages[i].push(`${npcDisplayName}'s helmet (${getItemDisplay(location.miniboss.npc.helmet)}) reduced the damage by **${result.damage.reduced}**.`)
								}
								else if (result.limb === 'chest' && location.miniboss.npc.armor) {
									messages[i].push(`${npcDisplayName}'s armor (${getItemDisplay(location.miniboss.npc.armor)}) reduced the damage by **${result.damage.reduced}**.`)
								}
								else if (result.limb === 'arm' && Math.random() <= 0.2 && !npcAfflictions.includes(afflictions['Broken Arm'])) {
									messages[i].push(`${icons.postive_effect_debuff} ${npcDisplayName}'s ${getAfflictionEmoji('Broken Arm')} arm was broken! (${combineArrayWithAnd(getEffectsDisplay(afflictions['Broken Arm'].effects))})`)

									npcAfflictions.push(afflictions['Broken Arm'])
								}
							}

							npcHealth -= totalDamage
						}

						const bossKilledEmbeds: Embed[] = []

						if (!missedPartChoice && npcHealth <= 0) {
							const weaponReceiver = players[Math.floor(Math.random() * players.length)].member.id
							const armorReceiver = players[Math.floor(Math.random() * players.length)].member.id
							const helmetReceiver = players[Math.floor(Math.random() * players.length)].member.id

							messages[i].push(`☠️ ${npcDisplayName} **DIED!**`)

							msgContent = `${players.map(p => `<@${p.member.id}>`).join(' ')}, You have defeated **${location.miniboss.npc.display}**!`

							for (const player of players) {
								// eslint-disable-next-line @typescript-eslint/no-unused-vars
								const userData = (await getUserRow(atkTransaction.query, player.member.id, true))!
								const userQuest = await getUserQuest(atkTransaction.query, player.member.id, true)
								const droppedItems = []

								if (location.miniboss.npc.armor && armorReceiver === player.member.id) {
									const armorDura = getRandomInt(Math.max(1, location.miniboss.npc.armor.durability / 2), location.miniboss.npc.armor.durability)
									const armorRow = await createItem(atkTransaction.query, location.miniboss.npc.armor.name, { durability: armorDura })
									await addItemToBackpack(atkTransaction.query, player.member.id, armorRow.id)

									droppedItems.push({
										item: location.miniboss.npc.armor,
										row: armorRow
									})
								}

								if (location.miniboss.npc.helmet && helmetReceiver === player.member.id) {
									const helmDura = getRandomInt(Math.max(1, location.miniboss.npc.helmet.durability / 2), location.miniboss.npc.helmet.durability)
									const helmRow = await createItem(atkTransaction.query, location.miniboss.npc.helmet.name, { durability: helmDura })
									await addItemToBackpack(atkTransaction.query, player.member.id, helmRow.id)

									droppedItems.push({
										item: location.miniboss.npc.helmet,
										row: helmRow
									})
								}

								if (location.miniboss.npc.type === 'raider') {
									if ('ammo' in location.miniboss.npc) {
										// drop random amount of bullets
										const ammoToDrop = getRandomInt(1, 2)

										for (let a = 0; a < ammoToDrop; a++) {
											const ammoRow = await createItem(atkTransaction.query, location.miniboss.npc.ammo.name, { durability: location.miniboss.npc.ammo.durability })
											await addItemToBackpack(atkTransaction.query, player.member.id, ammoRow.id)

											droppedItems.push({
												item: location.miniboss.npc.ammo,
												row: ammoRow
											})
										}
									}

									if (weaponReceiver === player.member.id) {
										// weapon durability is random
										const weapDurability = location.miniboss.npc.weapon.durability ? getRandomInt(Math.max(1, location.miniboss.npc.weapon.durability / 2), location.miniboss.npc.weapon.durability) : undefined
										const weapRow = await createItem(atkTransaction.query, location.miniboss.npc.weapon.name, { durability: weapDurability })
										await addItemToBackpack(atkTransaction.query, player.member.id, weapRow.id)

										droppedItems.push({
											item: location.miniboss.npc.weapon,
											row: weapRow
										})
									}
								}

								// roll random loot drops
								for (let l = 0; l < location.miniboss.npc.drops.rolls; l++) {
									const lootDrop = getMobDrop(location.miniboss.npc)

									if (lootDrop) {
										let itemDurability

										// item durability is random when dropped by npc
										if (lootDrop.item.durability) {
											itemDurability = getRandomInt(Math.max(1, lootDrop.item.durability / 4), lootDrop.item.durability)
										}

										const lootDropRow = await createItem(atkTransaction.query, lootDrop.item.name, { durability: itemDurability })
										await addItemToBackpack(atkTransaction.query, player.member.id, lootDropRow.id)

										droppedItems.push({
											item: lootDrop.item,
											row: lootDropRow,
											rarityDisplay: lootDrop.rarityDisplay
										})
									}
								}

								await setFighting(atkTransaction.query, player.member.id, false)
								await increaseKills(atkTransaction.query, player.member.id, 'boss', 1)
								await addXp(atkTransaction.query, player.member.id, location.miniboss.npc.xp)

								// check if user has any kill quests
								if (userQuest && userQuest.progress < userQuest.progressGoal) {
									if (
										userQuest.questType === 'Boss Kills' ||
										userQuest.questType === 'Any Kills' ||
										userQuest.questType === 'NPC Kills'
									) {
										await increaseProgress(atkTransaction.query, player.member.id, 1)
									}
								}

								// have to put loot in a separate embed to avoid character limit issues (up to 18 mob drops can be displayed by using an embed description)
								const killEmbed = new Embed()
									.setAuthor(`${player.member.user.username}#${player.member.user.discriminator}'s Loot Received`, player.member.avatarURL)
									.setColor(9043800)
									.setDescription(`${(sortItemsByLevel(droppedItems, true) as (ItemWithRow<ItemRow> & { rarityDisplay?: string })[])
										.map(itm => 'rarityDisplay' in itm ? `${itm.rarityDisplay} ${getItemDisplay(itm.item, itm.row)}` : `${getRarityDisplay('Common')} ${getItemDisplay(itm.item, itm.row)}`).join('\n')}` +
										`\n${icons.xp_star}***+${location.miniboss.npc.xp}** xp!*`)

								lootEmbeds.push({ ...killEmbed.embed })

								// removing the author field because I dont want user avatars to show in the global kill feed
								killEmbed.embed.author = undefined
								killEmbed.setTitle(`__${player.member.user.username}#${player.member.user.discriminator}'s Loot Received__`)
								bossKilledEmbeds.push(killEmbed)
							}
						}
						else if (!missedPartChoice) {
							messages[i].push(`${npcDisplayName} is left with ${formatHealth(npcHealth, location.miniboss.npc.health)} **${npcHealth}** health.`)
						}

						// commit changes
						await atkTransaction.commit()

						if (!missedPartChoice && npcHealth <= 0) {
							// end the duel
							this.app.channelsWithActiveDuel.delete(ctx.channelID)
							duelIsActive = false

							if (webhooks.pvp.id && webhooks.pvp.token) {
								try {
									await this.app.bot.executeWebhook(webhooks.pvp.id, webhooks.pvp.token, {
										content: `☠️ ${combineArrayWithAnd(players.map(p => `**${p.member.user.username}#${p.member.user.discriminator}**`))} killed ${npcDisplayName} (${location.display} Boss)`,
										embeds: bossKilledEmbeds.map(e => e.embed)
									})
								}
								catch (err) {
									logger.warn(err)
								}
							}

							// break out of the loop to prevent other players turn
							break
						}
					}
				}

				const playersDisplay = orderedChoices.filter((c): c is OrderedPlayerChoice => c.type === 'player').map(c => c.member.displayName)
				const actionsEmbed = new Embed()
					.setTitle(`Boss Fight${players.length ?
						` - ${combineArrayWithAnd(playersDisplay)}` :
						''} vs ${location.miniboss.npc.display}`)
					.setFooter(`Turn #${turnNumber} · actions are ordered by speed (higher speed action goes first)`)

				const filteredMessages = messages.filter(m => m.length)
				for (let i = 0; i < filteredMessages.length; i++) {
					actionsEmbed.addField('\u200b', `${i + 1}. ${filteredMessages[i].join('\n')}`)
				}

				await ctx.sendFollowUp({
					content: msgContent,
					embeds: lootEmbeds.length ? [actionsEmbed.embed, ...lootEmbeds] : [actionsEmbed.embed]
				})
			}
			catch (err) {
				logger.error(err)

				duelIsActive = false
				this.app.channelsWithActiveDuel.delete(ctx.channelID)

				for (const player of players) {
					await setFighting(query, player.member.id, false)
				}

				try {
					await ctx.sendFollowUp({
						content: `${icons.danger} ${players.map(p => `<@${p.member.id}>`).join(' ')}, An error occured, the boss fight had to be ended. Sorry about that...` +
							'\n\nHEY IF YOU JOIN THE SUPPORT SERVER AND LET A DEV KNOW, WE MIGHT COMPENSATE YOU!'
					})
				}
				catch (msgErr) {
					logger.warn(msgErr)
				}
			}

			if (duelIsActive) {
				if (turnNumber >= 20) {
					duelIsActive = false
					this.app.channelsWithActiveDuel.delete(ctx.channelID)

					for (const player of players) {
						await setFighting(query, player.member.id, false)
					}

					await ctx.sendFollowUp({
						content: `${icons.danger} ${players.map(p => `<@${p.member.id}>`).join(' ')}, **The max turn limit (20) has been reached!** The boss fight ends in a tie.`
					})
				}
				else {
					players = await Promise.all(players.map(async p => ({
						...p,
						data: (await getUserRow(query, p.member.id))!,
						inventory: await getUserBackpack(query, p.member.id)
					})))

					turnNumber += 1

					botMessage = await ctx.sendFollowUp({
						content: `${players.map(p => `<@${p.member.id}>`).join(' ')}, Turn #${turnNumber} - select your action:`,
						embeds: [
							this.getMobDuelEmbed(
								players,
								location.miniboss.npc,
								npcHealth,
								turnNumber,
								npcStimulants,
								npcAfflictions
							).embed
						],
						components: [{
							type: ComponentType.ACTION_ROW,
							components: [GRAY_BUTTON('Attack', 'attack', false, '🗡️'), GRAY_BUTTON('Use Medical Item', 'heal', false, '🩹'), GRAY_BUTTON('Use Stimulant', 'stimulant', false, '💉'), RED_BUTTON('Try to Flee', 'flee')]
						}]
					})
				}
			}
		}
	}

	getMobDuelEmbed (
		players: Player[],
		mob: NPC,
		npcHealth: number,
		turnNumber: number,
		npcStimulants: Stimulant[],
		npcAfflictions: Affliction[]
	): Embed {
		const npcEffects = addStatusEffects(npcStimulants, npcAfflictions)
		const npcEffectsDisplay = getEffectsDisplay(npcEffects)

		const duelEmb = new Embed()
			.setTitle(`${mob.display} (Boss Fight)`)
			.addField('\u200b', `**${npcHealth} / ${mob.health}** HP\n${formatHealth(npcHealth, mob.health, { emojisLength: 17 })}`)
			.addField('\u200b', getMobDisplay(mob, npcHealth, { showHealth: false }).join('\n'), true)
			.addField('\u200b', `__**Stimulants**__\n${npcStimulants.length ? npcStimulants.map(i => getItemDisplay(i)).join('\n') : 'None'}` +
				`\n\n__**Afflictions**__\n${npcAfflictions.length ? combineArrayWithAnd(npcAfflictions.map(a => `${getAfflictionEmoji(a.name as AfflictionName)} ${a.name}`)) : 'None'}` +
				`${npcEffectsDisplay.length ? `\n\n__**Effects**__\n${npcEffectsDisplay.join('\n')}` : ''}`, true)
			.addBlankField()
			.setFooter(`Turn #${turnNumber} / 20 max · 40 seconds to make selection`)

		if (mob.quotes && mob.quotes.length) {
			duelEmb.setDescription(`**${mob.display}**: ${mob.quotes[Math.floor(Math.random() * mob.quotes.length)]}`)
		}

		for (const player of players) {
			const playerEquips = getEquips(player.inventory)
			const playerEffects = addStatusEffects(player.stimulants, player.afflictions)
			const playerEffectsDisplay = getEffectsDisplay(playerEffects)

			duelEmb.addField(`${player.member.user.username}#${player.member.user.discriminator} (Level ${player.data.level})`,
				`**${player.data.health} / ${player.data.maxHealth}** HP\n${formatHealth(player.data.health, player.data.maxHealth)}` +
				`\n\n__**Equipment**__\n**Backpack**: ${playerEquips.backpack ? getItemDisplay(playerEquips.backpack.item, playerEquips.backpack.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n**Helmet**: ${playerEquips.helmet ? getItemDisplay(playerEquips.helmet.item, playerEquips.helmet.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n**Body Armor**: ${playerEquips.armor ? getItemDisplay(playerEquips.armor.item, playerEquips.armor.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n\n__**Stimulants**__\n${player.stimulants.length ? player.stimulants.map(i => getItemDisplay(i)).join('\n') : 'None'}` +
				`\n\n__**Afflictions**__\n${player.afflictions.length ? combineArrayWithAnd(player.afflictions.map(a => `${getAfflictionEmoji(a.name as AfflictionName)} ${a.name}`)) : 'None'}` +
				`${playerEffectsDisplay.length ? `\n\n__**Effects**__\n${playerEffectsDisplay.join('\n')}` : ''}`,
				true)
		}

		return duelEmb
	}

	getAgreementEmbed (location: Location, users: ResolvedMember[], agreedUsers: string[]): Embed {
		if (!location.miniboss) {
			throw new Error(`there is no miniboss for location ${location.display}`)
		}

		const embed = new Embed()
			.setTitle(`Miniboss - ${location.display}`)
			.setDescription(`${icons.warning} If you die, you will lose everything in your inventory.`)
			.addField(location.miniboss.npc.display, getMobDisplay(location.miniboss.npc, location.miniboss.npc.health).join('\n'), true)
			.addField('\u200b', users.map(u => agreedUsers.includes(u.id) ?
				`${icons.checkmark} ${u.displayName} - Ready!` :
				`${icons.cancel} ${u.displayName} - Not ready`
			).join('\n'), true)
			.setFooter('You must ready up to start the fight')

		return embed
	}

	async awaitPlayerAgreements (botMessage: Message, location: Location, users: ResolvedMember[]): Promise<void> {
		return new Promise((resolve, reject) => {
			const { collector, stopCollector } = this.app.componentCollector.createCollector(botMessage.id, c => users.some(m => m.id === c.user.id), 30000)
			const agreedUsers: string[] = []

			collector.on('collect', async c => {
				try {
					await c.acknowledge()

					if (c.customID === 'accept') {
						if (agreedUsers.includes(c.user.id)) {
							await c.send({
								ephemeral: true,
								content: 'You have already readied up!'
							})
							return
						}

						agreedUsers.push(c.user.id)

						if (users.every(m => agreedUsers.includes(m.id))) {
							stopCollector()
							resolve()
						}
						else {
							await c.editParent({
								embeds: [this.getAgreementEmbed(location, users, agreedUsers).embed]
							})
						}
					}
				}
				catch (err) {
					// continue
				}
			})

			collector.on('end', msg => {
				if (msg === 'time') {
					reject(new Error('time'))
				}
			})
		})
	}
}

export default BossCommand
