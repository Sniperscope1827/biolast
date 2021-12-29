import { SlashCreator, CommandContext, CommandOptionType, ComponentType, Message, ComponentSelectMenu } from 'slash-create'
import App from '../app'
import { icons } from '../config'
import { NPC } from '../resources/npcs'
import { dailyQuests } from '../resources/quests'
import { allLocations } from '../resources/locations'
import CustomSlashCommand from '../structures/CustomSlashCommand'
import Embed from '../structures/Embed'
import { Item, Stimulant } from '../types/Items'
import { Area } from '../types/Locations'
import { addItemToBackpack, createItem, deleteItem, getUserBackpack, lowerItemDurability } from '../utils/db/items'
import { beginTransaction, query } from '../utils/db/mysql'
import { addHealth, addXp, getUserRow, increaseKills, setFighting } from '../utils/db/players'
import { getUserQuests, increaseProgress } from '../utils/db/quests'
import { getBackpackLimit, getEquips, getItemDisplay, getItems, sortItemsByDurability, sortItemsByLevel } from '../utils/itemUtils'
import { logger } from '../utils/logger'
import getRandomInt from '../utils/randomInt'
import { combineArrayWithAnd, combineArrayWithOr, formatHealth, getBodyPartEmoji, getRarityDisplay } from '../utils/stringUtils'
import { BackpackItemRow, ItemRow, ItemWithRow, UserRow } from '../types/mysql'
import { Affliction, afflictions } from '../resources/afflictions'
import { addStatusEffects, getEffectsDisplay } from '../utils/playerUtils'
import { ResolvedMember } from 'slash-create/lib/structures/resolvedMember'
import { awaitPlayerChoices, getAttackDamage, getAttackString, getBodyPartHit, PlayerChoice } from '../utils/duelUtils'
import { GRAY_BUTTON, RED_BUTTON } from '../utils/constants'
import { attackPlayer, getMobChoice, getMobDrop } from '../utils/npcUtils'

class ScavengeCommand extends CustomSlashCommand {
	constructor (creator: SlashCreator, app: App) {
		super(creator, app, {
			name: 'scavenge',
			description: 'Explore areas for loot. You may encounter threats, so be prepared!',
			longDescription: 'Select an area to explore. Different areas have different loot and enemies. Some areas may also require you to use a key to scavenge them.' +
				' As you level up, more locations will become available to you to explore.',
			options: [
				{
					type: CommandOptionType.STRING,
					name: 'location',
					description: 'Location to scavenge.',
					required: true,
					choices: allLocations.sort((a, b) => a.requirements.minLevel - b.requirements.minLevel).map(loc => ({
						name: `${loc.display} (Level ${loc.requirements.minLevel}+)`,
						value: loc.id
					}))
				}
			],
			category: 'info',
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

		const locationChoice = allLocations.find(loc => loc.id === ctx.options.location)

		if (!locationChoice) {
			await ctx.send({
				content: `${icons.warning} You need to specify a location you want to scavenge. The following locations are available:`,
				embeds: [this.getLocationsEmbed().embed]
			})
			return
		}

		const preUserData = (await getUserRow(query, ctx.user.id))!

		if (locationChoice.requirements.minLevel > preUserData.level) {
			await ctx.send({
				content: `${icons.warning} **${locationChoice.display}** is too dangerous for you to explore at your current level (your level: **${preUserData.level}**, required: **${locationChoice.requirements.minLevel}+**).`
			})
			return
		}

		const components: ComponentSelectMenu[] = [
			{
				type: ComponentType.SELECT,
				custom_id: 'areas',
				options: locationChoice.areas.map(area => {
					const iconID = area.requiresKey ? icons.key.match(/:([0-9]*)>/) : area.npcSpawns && area.npcSpawns.chance > 10 ? icons.warning.match(/:([0-9]*)>/) : icons.checkmark.match(/:([0-9]*)>/)

					return {
						label: area.display,
						value: area.display,
						description: `${area.requiresKey ? 'Requires key. ' : ''}${area.npcSpawns ? `${area.npcSpawns.chance}% chance of encountering mob.` : 'No mobs spotted in this area.'}`,
						emoji: iconID ? {
							id: iconID[1],
							name: 'warning'
						} : undefined
					}
				})
			}
		]
		let botMessage = await ctx.send({
			content: `You look around **${locationChoice.display}** and spot **${locationChoice.areas.length}** points of interest. Which area do you want to scavenge?`,
			components: [
				{
					type: ComponentType.ACTION_ROW,
					components
				}
			]
		}) as Message

		try {
			const areaCtx = (await this.app.componentCollector.awaitClicks(botMessage.id, i => i.user.id === ctx.user.id, 20000))[0]
			const areaChoice = locationChoice.areas.find(a => a.display === areaCtx.values[0])
			const transaction = await beginTransaction()
			const userData = (await getUserRow(transaction.query, ctx.user.id, true))!

			if (!areaChoice) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.danger} Could not find area.`,
					components: []
				})
				return
			}
			else if (userData.fighting) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.danger} You cannot scavenge while in a duel.`,
					components: []
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
					components: []
				})
				return
			}
			else if (
				backpackData.slotsUsed -
				(
					hasRequiredKey &&
					(!hasRequiredKey.row.durability || hasRequiredKey.row.durability - 1 <= 0) ? hasRequiredKey.item.slotsUsed : 0
				) >= backpackLimit
			) {
				await transaction.commit()

				await areaCtx.editParent({
					content: `${icons.danger} You don't have enough space in your inventory to scavenge **${areaChoice.display}**. Sell items to clear up some space.`,
					components: []
				})
				return
			}

			const preUserQuests = (await getUserQuests(transaction.query, ctx.user.id, true))
				.filter(q => q.questType === 'Scavenge With A Key' || q.questType === 'Scavenge')

			// check if user had any scavenge quests
			for (const questRow of preUserQuests) {
				const quest = dailyQuests.find(q => q.id === questRow.questId)

				if (questRow.progress < questRow.progressGoal) {
					if (
						(quest &&
						quest.questType === 'Scavenge With A Key' &&
						hasRequiredKey &&
						quest.key.name === hasRequiredKey.item.name) ||
						questRow.questType === 'Scavenge'
					) {
						await increaseProgress(transaction.query, questRow.id, 1)
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
			if (!areaChoice.npcSpawns || getRandomInt(1, 100) > areaChoice.npcSpawns.chance) {
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

				await addXp(transaction.query, ctx.user.id, xpEarned)
				await transaction.commit()

				const finalMessage = `You ${hasRequiredKey ?
					`use your ${getItemDisplay(hasRequiredKey.item, { ...hasRequiredKey.row, durability: hasRequiredKey.row.durability ? hasRequiredKey.row.durability - 1 : undefined })} to ` :
					''}scavenge **${areaChoice.display}** and find:\n\n${scavengedLoot.map(itm => `${itm.rarity} ${getItemDisplay(itm.item, itm.row)}`).join('\n') || '**nothing**!'}\n🌟 ***+${xpEarned}** xp!*`

				if (!scavengedLoot.length) {
					await areaCtx.editParent({
						content: finalMessage,
						components: []
					})
					return
				}

				await areaCtx.editParent({
					content: `${finalMessage}\n\n` +
						`${icons.checkmark} These items were added to your inventory.`,
					components: []
				})
				return
			}

			// player encountered mob
			await setFighting(transaction.query, ctx.user.id, true)
			await transaction.commit()

			const npc = areaChoice.npcSpawns.npcs[Math.floor(Math.random() * areaChoice.npcSpawns.npcs.length)]
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
							const chance = 0.1

							if (Math.random() <= chance) {
								// success
								duelIsActive = false
								messages[i].push(`<@${ctx.user.id}> flees from the duel! The duel has ended.`)
								await setFighting(query, ctx.user.id, true)
								break
							}
							else {
								messages[i].push(`${icons.danger} <@${ctx.user.id}> tries to flee from the duel (10% chance) but fails!`)
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
								`\n<@${ctx.user.id}> now has ${formatHealth(playerData.health + maxHeal, playerData.maxHealth)} **${playerData.health + maxHeal} / ${playerData.maxHealth}** health.` +
								`${curedAfflictions.length ? `\n<@${ctx.user.id}> cured the following afflictions: ${combineArrayWithAnd(curedAfflictions.map(a => a.name))}` : ''}`)
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

									if (playerChoice.weapon.item.subtype === 'Incendiary Grenade') {
										messages[i].push(`${icons.debuff} ${npcDisplayCapitalized} is Burning! (${combineArrayWithAnd(getEffectsDisplay(afflictions.Burning.effects))})`)

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
								messages[i].push(`${icons.danger} <@${ctx.user.id}>'s ${getItemDisplay(playerChoice.weapon.item, playerChoice.weapon.row, { showDurability: false, showEquipped: false })} broke from this attack.`)

								await deleteItem(atkTransaction.query, playerChoice.weapon.row.id)
							}
							else if (playerChoice.weapon.row && playerChoice.weapon.row.durability) {
								messages[i].push(`<@${ctx.user.id}>'s ${getItemDisplay(playerChoice.weapon.item, playerChoice.weapon.row, { showDurability: false, showEquipped: false })} now has **${playerChoice.weapon.row.durability - 1}** durability.`)

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
									else if (result.limb === 'arm' && Math.random() <= 0.2) {
										messages[i].push(`${icons.debuff} ${npcDisplayCapitalized}'s arm was broken! (${combineArrayWithAnd(getEffectsDisplay(afflictions['Broken Arm'].effects))})`)

										npcAfflictions.push(afflictions['Broken Arm'])
									}
								}

								npcHealth -= totalDamage
							}

							if (!missedPartChoice && npcHealth <= 0) {
								const userQuests = (await getUserQuests(atkTransaction.query, ctx.user.id, true)).filter(q => q.questType === 'NPC Kills' || q.questType === 'Any Kills' || q.questType === 'Boss Kills')
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
									// drop weapon and ammo on ground

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

								await increaseKills(atkTransaction.query, ctx.user.id, npc.boss ? 'boss' : 'npc', 1)
								await addXp(atkTransaction.query, ctx.user.id, npc.xp)

								// check if user has any kill quests
								for (const quest of userQuests) {
									if (quest.progress < quest.progressGoal) {
										if (
											(quest.questType === 'Boss Kills' && npc.boss) ||
											(quest.questType === 'Any Kills' || quest.questType === 'NPC Kills')
										) {
											await increaseProgress(atkTransaction.query, quest.id, 1)
										}
									}
								}

								messages[i].push(
									`☠️ ${npcDisplayCapitalized} **DIED!** <@${ctx.user.id}> earned 🌟 ***+${npc.xp}*** xp for this kill.`,
									`\n__Loot Received__\n${(sortItemsByLevel(droppedItems, true) as (ItemWithRow<ItemRow> & { rarityDisplay?: string })[])
										.map(itm => 'rarityDisplay' in itm ? `${itm.rarityDisplay} ${getItemDisplay(itm.item, itm.row)}` : `${getRarityDisplay('Common')} ${getItemDisplay(itm.item, itm.row)}`).join('\n')}`
								)
							}
							else if (!missedPartChoice) {
								messages[i].push(`${npcDisplayCapitalized} is left with ${formatHealth(npcHealth, npc.health)} **${npcHealth}** health.`)
							}

							// commit changes
							await setFighting(atkTransaction.query, ctx.user.id, false)
							await atkTransaction.commit()

							if (!missedPartChoice && npcHealth <= 0) {
								// end the duel
								duelIsActive = false
								// break out of the loop to prevent other players turn
								break
							}
						}
					}

					const actionsEmbed = new Embed()
						.setTitle(`Duel - ${ctx.member.displayName} vs ${npc.display} (${npc.boss ? 'boss' : 'mob'})`)
						.setFooter(`Turn #${turnNumber} · actions are ordered by speed (higher speed action goes first)`)

					for (const msg of messages.filter(m => m.length)) {
						actionsEmbed.addField('\u200b', msg.join('\n'))
					}

					await areaCtx.sendFollowUp({
						embeds: [actionsEmbed.embed]
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
							await setFighting(query, ctx.user.id, true)
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
				components: []
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
		const npcPenetration = 'ammo' in mob ?
			mob.ammo.penetration :
			'weapon' in mob ?
				mob.weapon.penetration :
				mob.attackPenetration

		const duelEmb = new Embed()
			.setTitle(`Duel - ${player.displayName} vs ${mob.display} (${mob.boss ? 'boss' : 'mob'})`)
			.addField(`${player.user.username}#${player.user.discriminator} (Level ${playerData.level})`,
				`__**Health**__\n**${playerData.health} / ${playerData.maxHealth}** HP\n${formatHealth(playerData.health, playerData.maxHealth)}` +
				`\n\n__**Gear**__\n**Backpack**: ${playerEquips.backpack ? getItemDisplay(playerEquips.backpack.item, playerEquips.backpack.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n**Helmet**: ${playerEquips.helmet ? getItemDisplay(playerEquips.helmet.item, playerEquips.helmet.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n**Body Armor**: ${playerEquips.armor ? getItemDisplay(playerEquips.armor.item, playerEquips.armor.row, { showEquipped: false, showID: false }) : 'None'}` +
				`\n\n__**Stimulants**__\n${playerStimulants.length ? playerStimulants.map(i => getItemDisplay(i)).join('\n') : 'None'}` +
				`\n\n__**Afflictions**__\n${playerAfflictions.length ? combineArrayWithAnd(playerAfflictions.map(a => a.name)) : 'None'}` +
				`${playerEffectsDisplay.length ? `\n\n__**Effects**__\n${playerEffectsDisplay.join('\n')}` : ''}`,
				true)
			.addField(`${mob.display} (${mob.boss ? 'boss' : 'mob'})`,
				`__**Health**__\n**${npcHealth} / ${mob.health}** HP\n${formatHealth(npcHealth, mob.health)}` +
				`\n\n__**Gear**__\n**Weapon**: ${mob.type === 'raider' ? getItemDisplay(mob.weapon) : 'None'}` +
				`${'ammo' in mob ? `\n**Ammo**: ${getItemDisplay(mob.ammo)}` : ''}` +
				`\n**Helmet**: ${mob.helmet ? getItemDisplay(mob.helmet) : 'None'}` +
				`\n**Body Armor**: ${mob.armor ? getItemDisplay(mob.armor) : 'None'}` +
				`\n**Damage**: ${mob.damage}` +
				`\n**Armor Penetration**: ${npcPenetration}` +
				`\n\n__**Stimulants**__\n${npcStimulants.length ? npcStimulants.map(i => getItemDisplay(i)).join('\n') : 'None'}` +
				`\n\n__**Afflictions**__\n${npcAfflictions.length ? combineArrayWithAnd(npcAfflictions.map(a => a.name)) : 'None'}` +
				`${npcEffectsDisplay.length ? `\n\n__**Effects**__\n${npcEffectsDisplay.join('\n')}` : ''}`,
				true)
			.setFooter(`Turn #${turnNumber} / 20 max · 40 seconds to make selection`)

		return duelEmb
	}

	getLocationsEmbed (): Embed {
		const locationsEmb = new Embed()
			.setTitle('Available Locations')
			.setDescription(`${icons.warning} The bot is in early access, expect more locations to be added.`)

		for (const loc of allLocations.sort((a, b) => a.requirements.minLevel - b.requirements.minLevel)) {
			locationsEmb.addField(loc.display, `Level **${loc.requirements.minLevel}+**`, true)
		}

		return locationsEmb
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
