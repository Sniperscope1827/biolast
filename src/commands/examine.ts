import { TextCommand } from '../types/Commands'
import { reply } from '../utils/messageUtils'
import { allLocations } from '../resources/locations'
import { getItem } from '../utils/argParsers'
import { allNPCs } from '../resources/npcs'
import { getItemDisplay } from '../utils/itemUtils'
import { dailyQuests } from '../resources/quests'
import { icons } from '../config'
import { combineArrayWithOr } from '../utils/stringUtils'

// yes this command is ugly its only for admins >:(

export const command: TextCommand = {
	name: 'examine',
	aliases: [],
	async execute (app, message, { args, prefix }) {
		const item = getItem(args)

		if (!item) {
			await reply(message, {
				content: `${icons.danger} Unable to find item with that name. \`=examine <item name>\``
			})
			return
		}

		const obtainedFromNpcs = []
		const obtainedFromChannels = []
		const obtainedFromQuests = []

		for (const loc of allLocations) {
			for (const chan of loc.areas) {
				if (chan.loot) {
					if (chan.loot.common.items.find(i => i.name === item.name)) {
						obtainedFromChannels.push(`\`${chan.display}\` ${chan.requiresKey ? `(requires ${combineArrayWithOr(chan.requiresKey.map(key => getItemDisplay(key)))} key to scavenge)` : ''} in **${loc.display}** (common 60% drop)`)
					}
					else if (chan.loot.uncommon.items.find(i => i.name === item.name)) {
						obtainedFromChannels.push(`\`${chan.display}\` ${chan.requiresKey ? `(requires ${combineArrayWithOr(chan.requiresKey.map(key => getItemDisplay(key)))} key to scavenge)` : ''} in **${loc.display}** (uncommon 25% drop)`)
					}
					else if (chan.loot.rare.items.find(i => i.name === item.name)) {
						obtainedFromChannels.push(`\`${chan.display}\` ${chan.requiresKey ? `(requires ${combineArrayWithOr(chan.requiresKey.map(key => getItemDisplay(key)))} key to scavenge)` : ''} in **${loc.display}** (rare 15% drop)`)
					}
					else if (chan.loot.rarest?.items.find(i => i.name === item.name)) {
						obtainedFromChannels.push(`\`${chan.display}\` ${chan.requiresKey ? `(requires ${combineArrayWithOr(chan.requiresKey.map(key => getItemDisplay(key)))} key to scavenge)` : ''} in **${loc.display}** (rarest 5% drop)`)
					}

					if (chan.requiresKey && chan.keyIsOptional && chan.specialLoot.items.find(i => i.name === item.name)) {
						obtainedFromChannels.push(`\`${chan.display}\` in **${loc.display}** (special drop, requires ${combineArrayWithOr(chan.requiresKey.map(key => getItemDisplay(key)))} key to obtain)`)
					}
				}
			}
		}

		for (const npc of allNPCs) {
			if (npc.armor && npc.armor.name === item.name) {
				obtainedFromNpcs.push(`\`${npc.id}\` (${npc.type}) wears this as armor and will 100% drop it with random durability`)
			}
			else if (npc.helmet && npc.helmet.name === item.name) {
				obtainedFromNpcs.push(`\`${npc.id}\` (${npc.type}) wears this as a helmet and will 100% drop it with random durability`)
			}
			else if (npc.type === 'raider' && npc.weapon.name === item.name) {
				obtainedFromNpcs.push(`\`${npc.id}\` (${npc.type}) uses this as a weapon and will 100% drop it with random durability`)
			}
			else if (npc.type === 'raider' && 'ammo' in npc && npc.ammo.name === item.name) {
				obtainedFromNpcs.push(`\`${npc.id}\` (${npc.type}) uses this as ammo and will drop 1x - 3x of it`)
			}
			else if (npc.drops.common.find(i => i.name === item.name)) {
				obtainedFromNpcs.push(`\`${npc.id}\` (${npc.type}) drops this as a common 60% drop`)
			}
			else if (npc.drops.uncommon.find(i => i.name === item.name)) {
				obtainedFromNpcs.push(`\`${npc.id}\` (${npc.type}) drops this as a uncommon 25% drop`)
			}
			else if (npc.drops.rare.find(i => i.name === item.name)) {
				obtainedFromNpcs.push(`\`${npc.id}\` (${npc.type}) drops this as a rare 15% drop`)
			}
		}

		for (const quest of dailyQuests) {
			if (quest.rewards.item && quest.rewards.item.name === item.name) {
				obtainedFromQuests.push(`\`${quest.id}\` (quest type: ${quest.questType}) gives this as a reward. Quest eligible for players level **${quest.minLevel}** - **${quest.maxLevel}**`)
			}
		}

		await reply(message, {
			content: `${getItemDisplay(item)} can be obtained from:\n\n` +
				`**NPCS**:\n${obtainedFromNpcs.join('\n') || '❌ none'}\n\n` +
				`**Channels**:\n${obtainedFromChannels.join('\n') || '❌ none'}\n\n` +
				`**Daily Quests**:\n${obtainedFromQuests.join('\n') || '❌ none'}`
		})
	}
}
