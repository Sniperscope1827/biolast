import { SlashCreator, CommandContext, ComponentType, Message, ComponentSelectMenu } from 'slash-create'
import App from '../app'
import { icons, webhooks } from '../config'
import { NPC } from '../types/NPCs'
import { isValidLocation, locations } from '../resources/locations'
import CustomSlashCommand from '../structures/CustomSlashCommand'
import Embed from '../structures/Embed'
import { Item, Stimulant } from '../types/Items'
import { Area } from '../types/Locations'
import { addItemToBackpack, createItem, deleteItem, getUserBackpack, lowerItemDurability } from '../utils/db/items'
import { beginTransaction, query } from '../utils/db/mysql'
import { addHealth, addXp, getUserRow, increaseKills, setFighting } from '../utils/db/players'
import { getUserQuest, increaseProgress } from '../utils/db/quests'
import { backpackHasSpace, getBackpackLimit, getEquips, getItemDisplay, getItems, sortItemsByDurability, sortItemsByLevel } from '../utils/itemUtils'
import { logger } from '../utils/logger'
import getRandomInt from '../utils/randomInt'
import { combineArrayWithAnd, combineArrayWithOr, formatHealth, getAfflictionEmoji, getBodyPartEmoji, getRarityDisplay } from '../utils/stringUtils'
import { BackpackItemRow, ItemRow, ItemWithRow, UserRow } from '../types/mysql'
import { Affliction, AfflictionName, afflictions } from '../resources/afflictions'
import { addStatusEffects, getEffectsDisplay } from '../utils/playerUtils'
import { ResolvedMember } from 'slash-create/lib/structures/resolvedMember'
import { awaitPlayerChoices, getAttackDamage, getAttackString, getBodyPartHit, PlayerChoice } from '../utils/duelUtils'
import { GRAY_BUTTON, RED_BUTTON } from '../utils/constants'
import { attackPlayer, getMobChoice, getMobDisplay, getMobDrop } from '../utils/npcUtils'
import { createCooldown, formatTime, getCooldown } from '../utils/db/cooldowns'
import { allQuests } from '../resources/quests'

class ScavengeCommand extends CustomSlashCommand {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'scavenge',
			description: 'Explore areas for loot. You may encounter threats, so be prepared!',
			longDescription: 'Select an area to explore. Different areas have different loot and enemies. Some areas may also require you to use a key to scavenge them.' +
				' As you level up, more locations will become available to you to explore.',
			options: [],
			category: 'scavenging',
			guildModsOnly: false,
			worksInDMs: false,
			worksDuringDuel: false,
			guildIDs: []
		})

		this.filePath = __filename
	}

	async run (ctx: CommandContext): Promise<void> {
		if (!ctx.member) {
			throw new Error('Member not attached to interaction')
		}

		const preUserData = (await getUserRow(query, ctx.user.id))!

		if (!isValidLocation(preUserData.currentLocation)) {
			await ctx.send({
				content: `${icons.warning} You need to travel to a region. Use the \`/travel\` command to travel to a region you want to scavenge.`
			})
			return
		}

		const preBackpackRows = await getUserBackpack(query, ctx.user.id)

		if (!backpackHasSpace(preBackpackRows, 0)) {
			await ctx.send({
				content: `${icons.warning} You are overweight, you will need to clear some space in your inventory before scavenging.`
			})
			return
		}

		const locationChoice = locations[preUserData.currentLocation]
		const areasDescription = []
		const availableAreas: Area[] = []
		const areasGuardedByNPC: Area[] = []
		const areasEmbed = new Embed()
			.setAuthor(`You scout around ${locationChoice.display.toLowerCase()} and spot ${locationChoice.areas.length} points of interest.`, ctx.user.avatarURL)
			.addField('__**Region Boss**__', `**${locationChoice.boss.display}**\nUse \`/boss\` to view stats and fight the boss. Defeating the boss will unlock a new region for you to travel to.`)

		for (const area of locationChoice.areas) {
			const areaCD = await getCooldown(query, ctx.user.id, `scavenge-${locationChoice.display}-${area.display}`)
			const areaDescription = []

			if (!areaCD) {
				availableAreas.push(area)
			}
			else {
				areaDescription.push(`${icons.timer} Recently scavenged, you can scavenge this area again in **${areaCD}**.`)
			}

			if (area.requiresKey) {
				areaDescription.push(`Requires a ${combineArrayWithOr(area.requiresKey.map(key => getItemDisplay(key)))} to be scavenged.`)
			}

			if (area.npcSpawns) {
				const mobKilledCD = await getCooldown(query, ctx.user.id, `npcdead-${locationChoice.display}-${area.display}`)

				if (!mobKilledCD) {
					areasGuardedByNPC.push(area)

					const npcsInArea = Array.from(new Set(area.npcSpawns.map(npc => npc.boss ? `**powerful ${npc.type}**` : `**${npc.type}**`)))

					areaDescription.push(`Guarded by a ${combineArrayWithOr(npcsInArea)}. You can scavenge this area after defeating the patrolling mob.`)
				}
				else {
					areaDescription.push(`The mob guarding this area has been defeated (**${mobKilledCD}** until they return)`)
				}
			}

			if (!areaCD && !area.requiresKey && !area.npcSpawns) {
				areaDescription.push('No enemies spotted in this area. Looks safe!')
			}

			areasDescription.push(`**${area.display}**\n${areaDescription.join(' ')}`)
		}

		areasEmbed.addField(`__**Areas**__ (${locationChoice.areas.length})`, areasDescription.join('\n\n'))

		const components: ComponentSelectMenu[] = [
			{
				type: ComponentType.SELECT,
				custom_id: 'areas',
				placeholder: 'Select an area to scavenge:',
				options: availableAreas.map(area => {
					const iconID = area.requiresKey ? icons.key.match(/:([0-9]*)>/) : area.npcSpawns && areasGuardedByNPC.includes(area) ? icons.warning.match(/:([0-9]*)>/) : icons.checkmark.match(/:([0-9]*)>/)
					const description = []

					if (area.requiresKey) {
						description.push('Requires key.')
					}
					if (area.npcSpawns && areasGuardedByNPC.includes(area)) {
						const npcsInArea = Array.from(new Set(area.npcSpawns.map(npc => npc.boss ? `powerful ${npc.type}` : npc.type)))
						description.push(`Guarded by a ${combineArrayWithOr(npcsInArea)}.`)
					}
					else {
						description.push('No enemies spotted in this area.')
					}

					return {
						label: area.display,
						value: area.display,
						description: description.join(' '),
						emoji: iconID ? {
							id: iconID[1],
							name: 'warning'
						} : undefined
					}
				})
			}
		]
		let botMessage = await ctx.send({
			content: `${preUserData.health / preUserData.maxHealth <= 0.5 ? `${icons.danger} Hey <@${ctx.user.id}>, you are currently low health! You should heal using \`/heal\` before starting a fight.\n\n` : ''}` +
				'Which area do you want to scavenge?',
			embeds: [areasEmbed.embed],
			components: [
				{
					type: ComponentType.ACTION_ROW,
					components
				}
			]
		}) as Message

		try {
			const areaCtx = (await this.app.componentCollector.awaitClicks(botMessage.id, i => i.user.id === ctx.user.id, 30000))[0]
			const areaChoice = locationChoice.areas.find(a => a.display === areaCtx.values[0])
			const transaction = await beginTransaction()
			const userData = (await getUserRow(transaction.query, ctx.user.id, true))!

			if (!areaChoice) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.danger} Could not find area.`,
					components: [],
					embeds: []
				})
				return
			}
			else if (userData.fighting) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.danger} You cannot scavenge while in a duel.`,
					components: [],
					embeds: []
				})
				return
			}

			const areaCD = await getCooldown(transaction.query, ctx.user.id, `scavenge-${locationChoice.display}-${areaChoice.display}`, true)
			const mobKilledCD = await getCooldown(transaction.query, ctx.user.id, `npcdead-${locationChoice.display}-${areaChoice.display}`, true)

			if (areaCD) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.timer} You recently scavenged **${areaChoice.display}**, you can scavenge this area again in **${areaCD}**.`,
					components: [],
					embeds: []
				})
				return
			}
			else if (areaChoice.npcSpawns && !areasGuardedByNPC.includes(areaChoice) && !mobKilledCD) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.timer} Unfortunately, a mob arrived to **${areaChoice.display}** while you were deciding which area to scavenge.`,
					components: [],
					embeds: []
				})
				return
			}

			const backpackRows = await getUserBackpack(transaction.query, ctx.user.id, true)
			const backpackData = getItems(backpackRows)
			const userEquips = getEquips(backpackRows)
			const keysRequired = areaChoice.requiresKey
			const hasRequiredKey = sortItemsByDurability(backpackData.items, true).reverse().find(i => keysRequired?.some(key => i.item.name === key.name))
			const backpackLimit = getBackpackLimit(userEquips.backpack?.item)

			if (keysRequired && !areaChoice.keyIsOptional && !hasRequiredKey) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.information} You need a ${combineArrayWithOr(keysRequired.map(key => getItemDisplay(key)))} to scavenge **${areaChoice.display}**.`,
					components: [],
					embeds: []
				})
				return
			}
			else if (
				backpackData.slotsUsed -
				(
					hasRequiredKey &&
					(!hasRequiredKey.row.durability || hasRequiredKey.row.durability - 1 <= 0) ? hasRequiredKey.item.slotsUsed : 0
				) > backpackLimit
			) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.danger} You don't have enough space in your inventory to scavenge **${areaChoice.display}**. Sell items to clear up some space.`,
					components: [],
					embeds: []
				})
				return
			}

			const preUserQuest = await getUserQuest(transaction.query, ctx.user.id, true)

			if (preUserQuest?.questType === 'Scavenge With A Key' || preUserQuest?.questType === 'Scavenge') {
				const quest = allQuests.find(q => q.id === preUserQuest.questId)

				if (preUserQuest.progress < preUserQuest.progressGoal) {
					if (
						(
							quest &&
							quest.questType === 'Scavenge With A Key' &&
							hasRequiredKey &&
							quest.key.name === hasRequiredKey.item.name
						) ||
						preUserQuest.questType === 'Scavenge'
					) {
						await increaseProgress(transaction.query, ctx.user.id, 1)
					}
				}
			}

			// lower durability or remove key
			if (hasRequiredKey) {
				if (!hasRequiredKey.row.durability || hasRequiredKey.row.durability - 1 <= 0) {
					await deleteItem(transaction.query, hasRequiredKey.row.id)
				}
				else {
					await lowerItemDurability(transaction.query, hasRequiredKey.row.id, 1)
				}
			}

			// player scavenges without encountering mob
			if (!areaChoice.npcSpawns || mobKilledCD) {
				const scavengedLoot = []
				let xpEarned = 0

				for (let i = 0; i < areaChoice.loot.rolls; i++) {
					const randomLoot = hasRequiredKey && areaChoice.keyIsOptional ?
						{ ...this.getRandomSpecialItem(areaChoice), rarityDisplay: getRarityDisplay('Rare') } :
						this.getRandomItem(areaChoice)

					if (randomLoot) {
						const itemRow = await createItem(transaction.query, randomLoot.item.name, { durability: randomLoot.item.durability })

						xpEarned += randomLoot.xp

						scavengedLoot.push({
							item: randomLoot.item,
							row: itemRow,
							rarity: randomLoot.rarityDisplay
						})

						await addItemToBackpack(transaction.query, ctx.user.id, itemRow.id)

						// check if users backpack has space for another item, otherwise stop scavenging
						if (
							backpackData.slotsUsed + scavengedLoot.reduce((prev, curr) => prev + curr.item.slotsUsed, 0) -
							(
								hasRequiredKey &&
								(!hasRequiredKey.row.durability || hasRequiredKey.row.durability - 1 <= 0) ? hasRequiredKey.item.slotsUsed : 0
							) >= backpackLimit
						) {
							break
						}
					}
				}

				await createCooldown(transaction.query, ctx.user.id, `scavenge-${locationChoice.display}-${areaChoice.display}`, areaChoice.scavengeCooldown)
				await addXp(transaction.query, ctx.user.id, xpEarned)
				await transaction.commit()

				const finalMessage = `You ${hasRequiredKey ?
					`use your ${getItemDisplay(hasRequiredKey.item, { ...hasRequiredKey.row, durability: hasRequiredKey.row.durability ? hasRequiredKey.row.durability - 1 : undefined })} to ` :
					''}scavenge **${areaChoice.display}** and find:\n\n${scavengedLoot.map(itm => `${itm.rarity} ${getItemDisplay(itm.item, itm.row)}`).join('\n') || '**nothing**!'}\n🌟 ***+${xpEarned}** xp!*`

				if (!scavengedLoot.length) {
					await areaCtx.editParent({
						content: finalMessage,
						components: [],
						embeds: []
					})
					return
				}

				await areaCtx.editParent({
					content: `${finalMessage}\n\n` +
						`${icons.checkmark} These items were added to your inventory.`,
					components: [],
					embeds: []
				})
				return
			}

			// player encountered mob
			await setFighting(transaction.query, ctx.user.id, true)
			await transaction.commit()

			const npc = areaChoice.npcSpawns[Math.floor(Math.random() * areaChoice.npcSpawns.length)]
			const finalMessage = `${icons.danger} You ${hasRequiredKey ?
				`use your ${getItemDisplay(hasRequiredKey.item, { ...hasRequiredKey.row, durability: hasRequiredKey.row.durability ? hasRequiredKey.row.durability - 1 : undefined })} to ` :
				''}try and scavenge **${areaChoice.display}** but **ENCOUNTER A ${npc.type.toUpperCase()}!**`
			const playerChoices = new Map<string, PlayerChoice>()
			const playerStimulants: Stimulant[] = []
			const playerAfflictions: Affliction[] = []
			const npcStimulants: Stimulant[] = []
			const npcAfflictions: Affliction[] = []
			let npcHealth = npc.health
			let turnNumber = 1
			let duelIsActive = true

			await areaCtx.editParent({
				content: finalMessage,
				embeds: [
					this.getMobDuelEmbed(
						ctx.member,
						npc,
						userData,
						npcHealth,
						backpackRows,
						1,
						playerStimulants,
						npcStimulants,
						playerAfflictions,
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
					await awaitPlayerChoices(this.app.componentCollector, botMessage, playerChoices, [
						{ member: ctx.member, stims: playerStimulants, afflictions: playerAfflictions }
					], turnNumber)

					const playerChoice = playerChoices.get(ctx.user.id)
					const npcChoice = getMobChoice(npc, npcStimulants, npcHealth)
					const orderedChoices = [{ type: 'player', speed: playerChoice?.speed || 0 }, { type: 'npc', speed: npcChoice.speed }]
						.map(c => ({ ...c, random: Math.random() }))
						.sort((a, b) => {
							if (a.speed > b.speed) {
								return -1
							}
							else if (a.speed < b.speed) {
								return 1
							}

							return b.random - a.random
						})
						.map(c => ({ type: c.type }))
					const messages: string[][] = [[], []]
					const npcDisplayName = npc.boss ? `**${npc.display}**` : `the **${npc.type}**`
					const npcDisplayCapitalized = npc.boss ? `**${npc.display}**` : `The **${npc.type}**`
					let lootEmbed
					let msgContent

					for (let i = 0; i < orderedChoices.length; i++) {
						const choiceType = orderedChoices[i]

						if (choiceType.type === 'npc') {
							// npc turn

							if (npcChoice.choice === 'attack') {
								const atkTransaction = await beginTransaction()

								const playerRow = (await getUserRow(atkTransaction.query, ctx.user.id, true))!
								const playerBackpackRows = await getUserBackpack(atkTransaction.query, ctx.user.id, true)
								const attackResult = await attackPlayer(
									atkTransaction.query,
									ctx.member,
									playerRow,
									playerBackpackRows,
									npc,
									playerStimulants,
									playerAfflictions,
									npcStimulants,
									npcAfflictions
								)

								messages[i].push(...attackResult.messages)

								await atkTransaction.commit()

								if (playerRow.health - attackResult.damage <= 0) {
									// end the duel
									duelIsActive = false

									lootEmbed = new Embed()
										.setTitle('__Loot Lost__')
										.setColor(16734296)
										.setDescription(attackResult.lostItems.length ?
											`${sortItemsByLevel(attackResult.lostItems, true).slice(0, 15).map(victimItem => getItemDisplay(victimItem.item, victimItem.row, { showEquipped: false, showDurability: false })).join('\n')}` +
											`${attackResult.lostItems.length > 15 ? `\n...and **${attackResult.lostItems.length - 15}** other item${attackResult.lostItems.length - 15 > 1 ? 's' : ''}` : ''}` :
											'No items were lost.')

									if (webhooks.pvp.id && webhooks.pvp.token) {
										try {
											await this.app.bot.executeWebhook(webhooks.pvp.id, webhooks.pvp.token, {
												content: `☠️ ${npc.boss ? `**${npc.display}**` : `A **${npc.display}**`} killed **${ctx.user.username}#${ctx.user.discriminator}** at **${locationChoice.display}**!`,
												embeds: [lootEmbed.embed]
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
							else if (npcChoice.choice === 'use a medical item') {
								const maxHeal = Math.min(npc.health - npcHealth, npcChoice.item.healsFor)
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

								messages[i].push(`${npcDisplayCapitalized} uses a ${getItemDisplay(npcChoice.item)} to heal for **${maxHeal}** health.` +
									`\n${npcDisplayCapitalized} now has ${formatHealth(npcHealth + maxHeal, npc.health)} **${npcHealth + maxHeal} / ${npc.health}** health.` +
									`${curedAfflictions.length ? `\n${npcDisplayCapitalized} cured the following afflictions: ${combineArrayWithAnd(curedAfflictions.map(a => a.name))}` : ''}`)
							}
							else if (npcChoice.choice === 'use a stimulant') {
								const effectsDisplay = getEffectsDisplay(npcChoice.item.effects)

								npcStimulants.push(npcChoice.item)

								messages[i].push(`${npcDisplayCapitalized} injects themself with ${getItemDisplay(npcChoice.item)}.` +
									`\n\n__Effects Received__\n${effectsDisplay.join('\n')}`)
							}
							else {
								messages[i].push(`${npcDisplayCapitalized} sits this turn out.`)
							}
						}
						else if (!playerChoice) {
							messages[i].push(`<@${ctx.user.id}> did not select an action.`)
						}
						else if (playerChoice.choice === 'try to flee') {
							const chance = 0.15

							if (Math.random() <= chance) {
								// success
								duelIsActive = false
								messages[i].push(`<@${ctx.user.id}> flees from the duel! The duel has ended.`)
								await setFighting(query, ctx.user.id, false)
								break
							}
							else {
								messages[i].push(`${icons.danger} <@${ctx.user.id}> tries to flee from the duel (15% chance) but fails!`)
							}
						}
						else if (playerChoice.choice === 'use a medical item') {
							const choice = playerChoice
							const healTransaction = await beginTransaction()
							const playerData = (await getUserRow(healTransaction.query, ctx.user.id, true))!
							const playerBackpackRows = await getUserBackpack(healTransaction.query, ctx.user.id, true)
							const playerInventory = getItems(playerBackpackRows)

							const hasItem = playerInventory.items.find(itm => itm.row.id === choice.itemRow.row.id)

							if (!hasItem) {
								await healTransaction.commit()
								messages[i].push(`${icons.danger} <@${ctx.user.id}> did not have the item they wanted to heal with. Their turn has been skipped.`)
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
								for (let affIndex = playerAfflictions.length - 1; affIndex >= 0; affIndex--) {
									const affliction = playerAfflictions[affIndex]

									if (choice.itemRow.item.curesBitten && affliction.name === 'Bitten') {
										curedAfflictions.push(affliction)
										playerAfflictions.splice(affIndex, 1)
									}
									else if (choice.itemRow.item.curesBrokenArm && affliction.name === 'Broken Arm') {
										curedAfflictions.push(affliction)
										playerAfflictions.splice(affIndex, 1)
									}
									else if (choice.itemRow.item.curesBurning && affliction.name === 'Burning') {
										curedAfflictions.push(affliction)
										playerAfflictions.splice(affIndex, 1)
									}
								}
							}

							await addHealth(healTransaction.query, ctx.user.id, maxHeal)
							await healTransaction.commit()

							const itemDisplay = getItemDisplay(choice.itemRow.item, {
								...choice.itemRow.row,
								durability: choice.itemRow.row.durability ? choice.itemRow.row.durability - 1 : undefined
							}, {
								showID: false
							})

							messages[i].push(`<@${ctx.user.id}> uses a ${itemDisplay} to heal for **${maxHeal}** health.` +
								`\n**${ctx.member.displayName}** now has ${formatHealth(playerData.health + maxHeal, playerData.maxHealth)} **${playerData.health + maxHeal} / ${playerData.maxHealth}** health.` +
								`${curedAfflictions.length ? `\n**${ctx.member.displayName}** cured the following afflictions: ${combineArrayWithAnd(curedAfflictions.map(a => a.name))}` : ''}`)
						}
						else if (playerChoice.choice === 'use a stimulant') {
							const choice = playerChoice
							const stimTransaction = await beginTransaction()
							const playerBackpackRows = await getUserBackpack(stimTransaction.query, ctx.user.id, true)
							const playerInventory = getItems(playerBackpackRows)

							const hasItem = playerInventory.items.find(itm => itm.row.id === choice.itemRow.row.id)

							if (!hasItem) {
								await stimTransaction.commit()
								messages[i].push(`${icons.danger} <@${ctx.user.id}> did not have the stimulant they wanted to use. Their turn has been skipped.`)
								continue
							}

							if (!choice.itemRow.row.durability || choice.itemRow.row.durability - 1 <= 0) {
								await deleteItem(stimTransaction.query, choice.itemRow.row.id)
							}
							else {
								await lowerItemDurability(stimTransaction.query, choice.itemRow.row.id, 1)
							}

							// ensure multiple of the same stimulant don't stack
							if (!playerStimulants.includes(choice.itemRow.item)) {
								playerStimulants.push(choice.itemRow.item)
							}

							await stimTransaction.commit()

							const itemDisplay = getItemDisplay(choice.itemRow.item, {
								...choice.itemRow.row,
								durability: choice.itemRow.row.durability ? choice.itemRow.row.durability - 1 : undefined
							}, {
								showID: false
							})
							const effectsDisplay = getEffectsDisplay(choice.itemRow.item.effects)

							messages[i].push(`<@${ctx.user.id}> injects themself with ${itemDisplay}.` +
								`\n\n__Effects Received__\n${effectsDisplay.join('\n')}`)
						}
						else {
							// user chose to attack
							const atkTransaction = await beginTransaction()

							// fetch user row to prevent changes during attack
							await getUserRow(atkTransaction.query, ctx.user.id, true)

							const playerBackpackRows = await getUserBackpack(atkTransaction.query, ctx.user.id, true)
							const playerInventory = getItems(playerBackpackRows)
							const stimulantEffects = addStatusEffects(playerStimulants, playerAfflictions)
							const victimEffects = addStatusEffects(npcStimulants, npcAfflictions)
							const stimulantDamageMulti = (1 + (stimulantEffects.damageBonus / 100) - ((victimEffects.damageTaken * -1) / 100))

							const weaponChoice = playerChoice.weapon
							const hasWeapon = !weaponChoice.row || playerInventory.items.find(itm => itm.row.id === weaponChoice.row.id)
							const hasAmmo = playerInventory.items.find(itm => itm.row.id === playerChoice.ammo?.row.id)
							const bodyPartHit = getBodyPartHit(playerChoice.weapon.item.accuracy + stimulantEffects.accuracyBonus, playerChoice.limbTarget)
							const missedPartChoice = playerChoice.limbTarget && (playerChoice.limbTarget !== bodyPartHit.result || !bodyPartHit.accurate)
							const limbsHit = []
							let totalDamage

							// verify user has weapon they want to attack with
							if (!hasWeapon || !playerChoice.weapon) {
								await atkTransaction.commit()
								messages[i].push(`${icons.danger} <@${ctx.user.id}> did not have the weapon they wanted to use. Their turn has been skipped.`)
								continue
							}
							else if (playerChoice.weapon.item.type === 'Ranged Weapon') {
								if (!hasAmmo || !playerChoice.ammo) {
									await atkTransaction.commit()
									messages[i].push(`${icons.danger} <@${ctx.user.id}> did not have the ammunition they wanted to use. Their turn has been skipped.`)
									continue
								}

								await deleteItem(atkTransaction.query, playerChoice.ammo.row.id)

								if (playerChoice.ammo.item.spreadsDamageToLimbs) {
									limbsHit.push({
										damage: getAttackDamage((playerChoice.ammo.item.damage * stimulantDamageMulti) / playerChoice.ammo.item.spreadsDamageToLimbs, playerChoice.ammo.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
										limb: bodyPartHit.result
									})

									for (let i2 = 0; i2 < playerChoice.ammo.item.spreadsDamageToLimbs - 1; i2++) {
										let limb = getBodyPartHit(playerChoice.weapon.item.accuracy)

										// make sure no duplicate limbs are hit
										while (limbsHit.find(l => l.limb === limb.result)) {
											limb = getBodyPartHit(playerChoice.weapon.item.accuracy)
										}

										limbsHit.push({
											damage: getAttackDamage((playerChoice.ammo.item.damage * stimulantDamageMulti) / playerChoice.ammo.item.spreadsDamageToLimbs, playerChoice.ammo.item.penetration, limb.result, npc.armor, npc.helmet),
											limb: limb.result
										})
									}
								}
								else {
									limbsHit.push({
										damage: getAttackDamage((playerChoice.ammo.item.damage * stimulantDamageMulti), playerChoice.ammo.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
										limb: bodyPartHit.result
									})
								}

								totalDamage = limbsHit.reduce((prev, curr) => prev + curr.damage.total, 0)

								if (missedPartChoice) {
									messages[i].push(`<@${ctx.user.id}> tries to shoot ${npcDisplayName} in the ${getBodyPartEmoji(playerChoice.limbTarget!)} **${playerChoice.limbTarget}** with their ${getItemDisplay(playerChoice.weapon.item)} (ammo: ${getItemDisplay(playerChoice.ammo.item)}) **BUT MISSES!**\n`)
								}
								else {
									messages[i].push(getAttackString(playerChoice.weapon.item, `<@${ctx.user.id}>`, npcDisplayName, limbsHit, totalDamage, playerChoice.ammo.item))
								}
							}
							else if (playerChoice.weapon.item.type === 'Throwable Weapon') {
								if (playerChoice.weapon.item.spreadsDamageToLimbs) {
									limbsHit.push({
										damage: getAttackDamage((playerChoice.weapon.item.damage * stimulantDamageMulti) / playerChoice.weapon.item.spreadsDamageToLimbs, playerChoice.weapon.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
										limb: bodyPartHit.result
									})

									for (let i2 = 0; i2 < playerChoice.weapon.item.spreadsDamageToLimbs - 1; i2++) {
										let limb = getBodyPartHit(playerChoice.weapon.item.accuracy)

										// make sure no duplicate limbs are hit
										while (limbsHit.find(l => l.limb === limb.result)) {
											limb = getBodyPartHit(playerChoice.weapon.item.accuracy)
										}

										limbsHit.push({
											damage: getAttackDamage((playerChoice.weapon.item.damage * stimulantDamageMulti) / playerChoice.weapon.item.spreadsDamageToLimbs, playerChoice.weapon.item.penetration, limb.result, npc.armor, npc.helmet),
											limb: limb.result
										})
									}
								}
								else {
									limbsHit.push({
										damage: getAttackDamage((playerChoice.weapon.item.damage * stimulantDamageMulti), playerChoice.weapon.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
										limb: bodyPartHit.result
									})
								}

								totalDamage = limbsHit.reduce((prev, curr) => prev + curr.damage.total, 0)

								if (missedPartChoice) {
									messages[i].push(`${icons.danger} <@${ctx.user.id}> tries to throw a ${getItemDisplay(playerChoice.weapon.item)} at ${npcDisplayName}'s ${getBodyPartEmoji(playerChoice.limbTarget!)} **${playerChoice.limbTarget}** **BUT MISSES!**\n`)
								}
								else {
									messages[i].push(getAttackString(playerChoice.weapon.item, `<@${ctx.user.id}>`, `${npcDisplayName}`, limbsHit, totalDamage))

									if (playerChoice.weapon.item.subtype === 'Incendiary Grenade' && !npcAfflictions.includes(afflictions.Burning)) {
										messages[i].push(`${icons.postive_effect_debuff} ${npcDisplayCapitalized} is ${getAfflictionEmoji('Burning')} Burning! (${combineArrayWithAnd(getEffectsDisplay(afflictions.Burning.effects))})`)

										npcAfflictions.push(afflictions.Burning)
									}
								}
							}
							else {
								// melee weapon
								limbsHit.push({
									damage: getAttackDamage((playerChoice.weapon.item.damage * stimulantDamageMulti), playerChoice.weapon.item.penetration, bodyPartHit.result, npc.armor, npc.helmet),
									limb: bodyPartHit.result
								})
								totalDamage = limbsHit[0].damage.total

								if (missedPartChoice) {
									messages[i].push(`${icons.danger} <@${ctx.user.id}> tries to hit ${npcDisplayName} in the ${getBodyPartEmoji(playerChoice.limbTarget!)} **${playerChoice.limbTarget}** with their ${getItemDisplay(playerChoice.weapon.item)} **BUT MISSES!**\n`)
								}
								else {
									messages[i].push(getAttackString(playerChoice.weapon.item, `<@${ctx.user.id}>`, `${npcDisplayName}`, limbsHit, totalDamage))
								}
							}

							// remove weapon
							if (playerChoice.weapon.row && (!playerChoice.weapon.row.durability || playerChoice.weapon.row.durability - 1 <= 0)) {
								messages[i].push(`${icons.danger} **${ctx.member.displayName}**'s ${getItemDisplay(playerChoice.weapon.item, playerChoice.weapon.row, { showDurability: false, showEquipped: false })} broke from this attack.`)

								await deleteItem(atkTransaction.query, playerChoice.weapon.row.id)
							}
							else if (playerChoice.weapon.row && playerChoice.weapon.row.durability) {
								messages[i].push(`**${ctx.member.displayName}**'s ${getItemDisplay(playerChoice.weapon.item, playerChoice.weapon.row, { showDurability: false, showEquipped: false })} now has **${playerChoice.weapon.row.durability - 1}** durability.`)

								await lowerItemDurability(atkTransaction.query, playerChoice.weapon.row.id, 1)
							}

							if (!missedPartChoice) {
								for (const result of limbsHit) {
									if (result.limb === 'head' && npc.helmet) {
										messages[i].push(`${npcDisplayCapitalized}'s helmet (${getItemDisplay(npc.helmet)}) reduced the damage by **${result.damage.reduced}**.`)
									}
									else if (result.limb === 'chest' && npc.armor) {
										messages[i].push(`${npcDisplayCapitalized}'s armor (${getItemDisplay(npc.armor)}) reduced the damage by **${result.damage.reduced}**.`)
									}
									else if (result.limb === 'arm' && Math.random() <= 0.2 && !npcAfflictions.includes(afflictions['Broken Arm'])) {
										messages[i].push(`${icons.postive_effect_debuff} ${npcDisplayCapitalized}'s ${getAfflictionEmoji('Broken Arm')} arm was broken! (${combineArrayWithAnd(getEffectsDisplay(afflictions['Broken Arm'].effects))})`)

										npcAfflictions.push(afflictions['Broken Arm'])
									}
								}

								npcHealth -= totalDamage
							}

							if (!missedPartChoice && npcHealth <= 0) {
								const userQuest = await getUserQuest(atkTransaction.query, ctx.user.id, true)
								const droppedItems = []

								if (npc.armor) {
									const armorDura = getRandomInt(Math.max(1, npc.armor.durability / 4), npc.armor.durability)
									const armorRow = await createItem(atkTransaction.query, npc.armor.name, { durability: armorDura })
									await addItemToBackpack(atkTransaction.query, ctx.user.id, armorRow.id)

									droppedItems.push({
										item: npc.armor,
										row: armorRow
									})
								}

								if (npc.helmet) {
									const helmDura = getRandomInt(Math.max(1, npc.helmet.durability / 4), npc.helmet.durability)
									const helmRow = await createItem(atkTransaction.query, npc.helmet.name, { durability: helmDura })
									await addItemToBackpack(atkTransaction.query, ctx.user.id, helmRow.id)

									droppedItems.push({
										item: npc.helmet,
										row: helmRow
									})
								}

								if (npc.type === 'raider') {
									if ('ammo' in npc) {
										// drop random amount of bullets
										const ammoToDrop = getRandomInt(1, 3)

										for (let a = 0; a < ammoToDrop; a++) {
											const ammoRow = await createItem(atkTransaction.query, npc.ammo.name, { durability: npc.ammo.durability })
											await addItemToBackpack(atkTransaction.query, ctx.user.id, ammoRow.id)

											droppedItems.push({
												item: npc.ammo,
												row: ammoRow
											})
										}
									}

									// weapon durability is random
									const weapDurability = npc.weapon.durability ? getRandomInt(Math.max(1, npc.weapon.durability / 4), npc.weapon.durability) : undefined
									const weapRow = await createItem(atkTransaction.query, npc.weapon.name, { durability: weapDurability })
									await addItemToBackpack(atkTransaction.query, ctx.user.id, weapRow.id)

									droppedItems.push({
										item: npc.weapon,
										row: weapRow
									})
								}

								// roll random loot drops
								for (let l = 0; l < npc.drops.rolls; l++) {
									const lootDrop = getMobDrop(npc)

									if (lootDrop) {
										let itemDurability

										// item durability is random when dropped by npc
										if (lootDrop.item.durability) {
											itemDurability = getRandomInt(Math.max(1, lootDrop.item.durability / 4), lootDrop.item.durability)
										}

										const lootDropRow = await createItem(atkTransaction.query, lootDrop.item.name, { durability: itemDurability })
										await addItemToBackpack(atkTransaction.query, ctx.user.id, lootDropRow.id)

										droppedItems.push({
											item: lootDrop.item,
											row: lootDropRow,
											rarityDisplay: lootDrop.rarityDisplay
										})
									}
								}

								await setFighting(atkTransaction.query, ctx.user.id, false)
								await createCooldown(atkTransaction.query, ctx.user.id, `npcdead-${locationChoice.display}-${areaChoice.display}`, npc.respawnTime)
								await increaseKills(atkTransaction.query, ctx.user.id, npc.boss ? 'boss' : 'npc', 1)
								await addXp(atkTransaction.query, ctx.user.id, npc.xp)

								// check if user has any kill quests
								if (userQuest && userQuest.progress < userQuest.progressGoal) {
									if (
										(userQuest.questType === 'Boss Kills' && npc.boss) ||
										(userQuest.questType === 'Any Kills' || userQuest.questType === 'NPC Kills')
									) {
										await increaseProgress(atkTransaction.query, ctx.user.id, 1)
									}
								}

								msgContent = `<@${ctx.user.id}>, You defeated ${npcDisplayName}!`
								messages[i].push(`☠️ ${npcDisplayCapitalized} **DIED!** You have **${formatTime(npc.respawnTime * 1000)}** to scavenge **${areaChoice.display}** before the enemy respawns.`)

								// have to put loot in a separate embed to avoid character limit issues (up to 18 mob drops can be displayed by using an embed description)
								lootEmbed = new Embed()
									.setTitle('__Loot Received__')
									.setColor(9043800)
									.setDescription(`🌟 ***+${npc.xp}** xp!*` +
										`\n${(sortItemsByLevel(droppedItems, true) as (ItemWithRow<ItemRow> & { rarityDisplay?: string })[])
											.map(itm => 'rarityDisplay' in itm ? `${itm.rarityDisplay} ${getItemDisplay(itm.item, itm.row)}` : `${getRarityDisplay('Common')} ${getItemDisplay(itm.item, itm.row)}`).join('\n')}`)
							}
							else if (!missedPartChoice) {
								messages[i].push(`${npcDisplayCapitalized} is left with ${formatHealth(npcHealth, npc.health)} **${npcHealth}** health.`)
							}

							// commit changes
							await atkTransaction.commit()

							if (!missedPartChoice && npcHealth <= 0) {
								// end the duel
								duelIsActive = false

								if (webhooks.pvp.id && webhooks.pvp.token) {
									try {
										await this.app.bot.executeWebhook(webhooks.pvp.id, webhooks.pvp.token, {
											content: `☠️ **${ctx.user.username}#${ctx.user.discriminator}** killed ${npc.boss ? `**${npc.display}**` : `a **${npc.display}**`} at **${locationChoice.display}** using their ${getItemDisplay(playerChoice.weapon.item)}` +
												`${playerChoice.ammo ? ` (ammo: ${getItemDisplay(playerChoice.ammo.item)})` : ''}.`,
											embeds: lootEmbed ? [lootEmbed.embed] : undefined
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

					const actionsEmbed = new Embed()
						.setTitle(`Duel - ${ctx.member.displayName} vs ${npc.display} (${npc.boss ? 'boss' : 'mob'})`)
						.setFooter(`Turn #${turnNumber} · actions are ordered by speed (higher speed action goes first)`)

					const filteredMessages = messages.filter(m => m.length)
					for (let i = 0; i < filteredMessages.length; i++) {
						actionsEmbed.addField('\u200b', `${i + 1}. ${filteredMessages[i].join('\n')}`)
					}

					await areaCtx.sendFollowUp({
						content: msgContent,
						embeds: lootEmbed ? [actionsEmbed.embed, lootEmbed.embed] : [actionsEmbed.embed]
					})
				}
				catch (err) {
					// TODO cancel duel early due to an error?
					logger.warn(err)
				}
				finally {
					playerChoices.clear()

					if (duelIsActive) {
						if (turnNumber >= 20) {
							duelIsActive = false
							await setFighting(query, ctx.user.id, false)
							await areaCtx.sendFollowUp({
								content: `${icons.danger} <@${ctx.user.id}>, **The max turn limit (20) has been reached!** The duel ends in a tie.`
							})
						}
						else {
							const playerDataV = (await getUserRow(query, ctx.user.id))!
							const playerInventoryV = await getUserBackpack(query, ctx.user.id)

							turnNumber += 1
							botMessage = await areaCtx.sendFollowUp({
								content: `<@${ctx.user.id}>, Turn #${turnNumber} - select your action:`,
								embeds: [
									this.getMobDuelEmbed(
										ctx.member,
										npc,
										playerDataV,
										npcHealth,
										playerInventoryV,
										turnNumber,
										playerStimulants,
										npcStimulants,
										playerAfflictions,
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
		}
		catch (err) {
			await botMessage.edit({
				content: `${icons.danger} You decide against scavenging (ran out of time to select an area).`,
				components: [],
				embeds: []
			})
		}
	}

	getMobDuelEmbed (
		player: ResolvedMember,
		mob: NPC,
		playerData: UserRow,
		npcHealth: number,
		playerInventory: BackpackItemRow[],
		turnNumber: number,
		playerStimulants: Stimulant[],
		npcStimulants: Stimulant[],
		playerAfflictions: Affliction[],
		npcAfflictions: Affliction[]
	): Embed {
		const playerEquips = getEquips(playerInventory)
		const playerEffects = addStatusEffects(playerStimulants, playerAfflictions)
		const npcEffects = addStatusEffects(npcStimulants, npcAfflictions)
		const playerEffectsDisplay = getEffectsDisplay(playerEffects)
		const npcEffectsDisplay = getEffectsDisplay(npcEffects)

		const duelEmb = new Embed()
			.setTitle(`Duel - ${player.displayName} vs ${mob.display} (${mob.boss ? 'boss' : 'mob'})`)
			.addField(`${player.user.username}#${player.user.discriminator} (Level ${playerData.level})`,
				`__**Health**__\n**${playerData.health} / ${playerData.maxHealth}** HP\n${formatHealth(playerData.health, playerData.maxHealth)}` +
				`\n\n__**Gear**__\n**Backpack**: ${playerEquips.backpack ? getItemDisplay(playerEquips.backpack.item, playerEquips.backpack.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n**Helmet**: ${playerEquips.helmet ? getItemDisplay(playerEquips.helmet.item, playerEquips.helmet.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n**Body Armor**: ${playerEquips.armor ? getItemDisplay(playerEquips.armor.item, playerEquips.armor.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n\n__**Stimulants**__\n${playerStimulants.length ? playerStimulants.map(i => getItemDisplay(i)).join('\n') : 'None'}` +
				`\n\n__**Afflictions**__\n${playerAfflictions.length ? combineArrayWithAnd(playerAfflictions.map(a => `${getAfflictionEmoji(a.name as AfflictionName)} ${a.name}`)) : 'None'}` +
				`${playerEffectsDisplay.length ? `\n\n__**Effects**__\n${playerEffectsDisplay.join('\n')}` : ''}`,
				true)
			.addField(`${mob.display} (${mob.boss ? 'boss' : 'mob'})`,
				`${getMobDisplay(mob, npcHealth).join('\n')}` +
				`\n\n__**Stimulants**__\n${npcStimulants.length ? npcStimulants.map(i => getItemDisplay(i)).join('\n') : 'None'}` +
				`\n\n__**Afflictions**__\n${npcAfflictions.length ? combineArrayWithAnd(npcAfflictions.map(a => `${getAfflictionEmoji(a.name as AfflictionName)} ${a.name}`)) : 'None'}` +
				`${npcEffectsDisplay.length ? `\n\n__**Effects**__\n${npcEffectsDisplay.join('\n')}` : ''}`,
				true)
			.setFooter(`Turn #${turnNumber} / 20 max · 40 seconds to make selection`)

		if (mob.quotes && mob.quotes.length) {
			duelEmb.setDescription(mob.quotes[Math.floor(Math.random() * mob.quotes.length)])
		}

		return duelEmb
	}

	getRandomSpecialItem (area: Area): { item: Item, xp: number } {
		if (!area.requiresKey || !area.keyIsOptional) {
			throw new Error(`Raid channel (${area.display}) does not have special loot`)
		}

		return {
			item: area.specialLoot.items[Math.floor(Math.random() * area.specialLoot.items.length)],
			xp: area.specialLoot.xp
		}
	}

	/**
	 * Gets a random scavenged item from an area
	 * @param area The area to get scavenge loot for
	 * @returns An item
	 */
	getRandomItem (area: Area): { item: Item, xp: number, rarityDisplay: string } {
		const rand = Math.random()
		let randomItem
		let xpEarned
		let rarityDisplay

		if (area.loot.rarest && rand < 0.05) {
			xpEarned = area.loot.rarest.xp
			randomItem = area.loot.rarest.items[Math.floor(Math.random() * area.loot.rarest.items.length)]
			rarityDisplay = getRarityDisplay('Insanely Rare')
		}
		else if (rand < 0.60) {
			xpEarned = area.loot.common.xp
			randomItem = area.loot.common.items[Math.floor(Math.random() * area.loot.common.items.length)]
			rarityDisplay = getRarityDisplay('Common')
		}
		else if (rand < 0.85) {
			xpEarned = area.loot.uncommon.xp
			randomItem = area.loot.uncommon.items[Math.floor(Math.random() * area.loot.uncommon.items.length)]
			rarityDisplay = getRarityDisplay('Uncommon')
		}
		else {
			xpEarned = area.loot.rare.xp
			randomItem = area.loot.rare.items[Math.floor(Math.random() * area.loot.rare.items.length)]
			rarityDisplay = getRarityDisplay('Rare')
		}

		return {
			item: randomItem,
			xp: xpEarned,
			rarityDisplay
		}
	}
}

export default ScavengeCommand
