import { Location } from '../../types/Locations'
import { items } from '../items'

export const prison: Location = {
	display: 'The Prison',
	icon: '<:prison:944973999526510642>',
	locationLevel: 5,
	boss: {
		cooldown: 60 * 60 * 2,
		npc: {
			type: 'raider',
			display: 'Warden James',
			health: 750,
			damage: 50,
			drops: {
				common: [items.trauma_kit, items['12-gauge_AP_slug'], items['5.56x45mm_FMJ_bullet'], items.steel_armor, items.steel_helmet],
				uncommon: [items.morphine, items.adrenaline],
				rare: [items.benelli_M4],
				rolls: 5
			},
			weapon: items.m4a1,
			ammo: items['5.56x45mm_HP_bullet'],
			usesStimulants: [items.morphine],
			usesHeals: [items.hyfin_chest_seal],
			quotes: [
				'We will restore order!',
				'Soon I will have my own army of undead, there will be no stopping me!'
			],
			armor: items.steel_armor,
			helmet: items.steel_helmet,
			xp: 3000,
			boss: true
		}
	},
	quests: [
		{
			type: 'Region',
			id: 'prison_retrieve_1',
			questType: 'Retrieve Item',
			progressGoal: 1,
			item: items.gold_watch
		},
		{
			type: 'Region',
			id: 'prison_retrieve_2',
			questType: 'Retrieve Item',
			progressGoal: 2,
			item: items.metal_shank
		}
	],
	huntMobs: [
		{
			type: 'walker',
			display: 'Pack of Zombies',
			health: 100,
			damage: 45,
			drops: {
				common: [items.pizza_slice],
				uncommon: [items['20-gauge_buckshot'], items['9mm_AP_bullet']],
				rare: [items.bobwhite_g2],
				rolls: 3
			},
			xp: 100,
			chanceToBite: 25,
			attackPenetration: 2.5,
			boss: false
		},
		{
			type: 'raider',
			display: 'Guardian Recruit',
			health: 100,
			damage: 40,
			drops: {
				common: [items.police_baton, items.compression_bandage],
				uncommon: [items.splint, items.adrenaline],
				rare: [items.suitcase, items.cell_key],
				rolls: 1
			},
			quotes: [
				'Who are you?!',
				'Leave now or die!',
				'This is guardian territory!',
				'I won\'t let you reach the subjects!'
			],
			usesHeals: [items.splint],
			weapon: items['FN_Five-seveN'],
			ammo: items.SS195LF_bullet,
			helmet: items.swat_helmet,
			armor: items.aramid_armor,
			xp: 200,
			boss: false
		},
		{
			type: 'raider',
			display: 'Guardian',
			health: 150,
			damage: 40,
			drops: {
				common: [items.molotov_cocktail, items.compression_bandage],
				uncommon: [items.hyfin_chest_seal, items.trauma_kit],
				rare: [items.cell_key],
				rolls: 1
			},
			quotes: [
				'Who are you?!',
				'Leave now or die!',
				'This is guardian territory!'
			],
			usesHeals: [items.splint],
			weapon: items.mossberg_500,
			ammo: items['12-gauge_buckshot'],
			helmet: items.swat_helmet,
			armor: items.swat_armor,
			xp: 200,
			boss: false
		},
		{
			type: 'walker',
			display: 'Mutated Scav',
			health: 120,
			damage: 35,
			drops: {
				common: [items['9mm_AP_bullet'], items['12-gauge_buckshot']],
				uncommon: [items.mossberg_500],
				rare: [items['12-gauge_slug']],
				rolls: 1
			},
			helmet: items.swat_helmet,
			xp: 100,
			chanceToBite: 25,
			attackPenetration: 3.2,
			boss: false,
			quotes: [
				'help... me...',
				'*aAAAuUGH*'
			]
		}
	],
	areas: [
		{
			display: 'Entrance Gate',
			quote: 'I see a few zombies bashing on the gate trying to get in. there\'s also a sign above the gate: "Guardians territory, stay out!"',
			loot: {
				common: {
					items: [items.police_baton],
					xp: 10
				},
				uncommon: {
					items: [items.aramid_helmet],
					xp: 15
				},
				rare: {
					items: [items.gold_watch],
					xp: 25
				},
				rolls: 1
			}
		},
		{
			display: 'Visiting Room',
			quote: 'the room is mostly empty except for the heavily geared raider on the other side.',
			loot: {
				common: {
					items: [items['7.62x39mm_HP_bullet'], items['20-gauge_slug']],
					xp: 10
				},
				uncommon: {
					items: [items.M67_grenade],
					xp: 15
				},
				rare: {
					items: [items['5.45x39mm_7N24_bullet'], items.swat_armor],
					xp: 25
				},
				rolls: 2
			}
		},
		{
			display: 'Cafeteria',
			quote: 'the cafeteria looks pretty barren.',
			loot: {
				common: {
					items: [items.donut, items.pretzel, items.fork],
					xp: 10
				},
				uncommon: {
					items: [items.metal_shank],
					xp: 15
				},
				rare: {
					items: [items.compression_bandage],
					xp: 25
				},
				rarest: {
					items: [items.swat_armor],
					xp: 50
				},
				rolls: 1
			}
		},
		{
			display: 'Hallways',
			quote: 'this must lead to the prison cells, there\'s another guard down the hall.',
			loot: {
				common: {
					items: [items['7.62x39mm_HP_bullet'], items.SS190_bullet, items.hyfin_chest_seal],
					xp: 10
				},
				uncommon: {
					items: [items['7.62x39mm_FMJ_bullet'], items.FN_P90, items.M67_grenade],
					xp: 15
				},
				rare: {
					items: [items['12-gauge_AP_slug'], items.suitcase],
					xp: 25
				},
				rolls: 1
			}
		},
		{
			display: 'Cell 1',
			quote: 'there\'s a walker laying inside the cell.',
			loot: {
				common: {
					items: [items['12-gauge_slug'], items['aks-74u']],
					xp: 10
				},
				uncommon: {
					items: [items.paracetamol, items['5.56x45mm_HP_bullet'], items.SS190_bullet],
					xp: 15
				},
				rare: {
					items: [items['5.45x39mm_7N24_bullet']],
					xp: 25
				},
				rolls: 2
			},
			requiresKey: items.cell_key
		},
		{
			display: 'Cell 2',
			quote: 'an empty cell. there\'s a handwritten sign on the cell door: "subject 2 - status: deceased"',
			loot: {
				common: {
					items: [items.metal_shank, items['5.56x45mm_HP_bullet']],
					xp: 10
				},
				uncommon: {
					items: [items['ak-47'], items.SS190_bullet],
					xp: 15
				},
				rare: {
					items: [items.hideout_key],
					xp: 25
				},
				rolls: 2
			},
			requiresKey: items.cell_key
		}
	]
}
