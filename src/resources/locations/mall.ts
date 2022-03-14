import { Location } from '../../types/Locations'
import { items } from '../items'

export const mall: Location = {
	display: 'The Mall',
	icon: '<:mall:944973999509766164>',
	locationLevel: 4,
	boss: {
		cooldown: 60 * 60 * 2,
		npc: {
			type: 'walker',
			display: 'The Many',
			health: 500,
			damage: 60,
			drops: {
				common: [items['9mm_AP_bullet'], items.paracetamol, items.aramid_armor, items.aramid_helmet, items['20-gauge_buckshot']],
				uncommon: [items['9mm_RIP_bullet'], items.duffle_bag, items.bobwhite_g2, items['12-gauge_buckshot']],
				rare: [items.swat_helmet, items.swat_armor],
				rolls: 6
			},
			quotes: [
				'We are many, we are one.',
				'*you hear the collective screams of many different zombies*'
			],
			xp: 1000,
			attackPenetration: 2.0,
			chanceToBite: 15,
			boss: true
		}
	},
	quests: [
		{
			type: 'Region',
			id: 'mall_retrieve_1',
			questType: 'Retrieve Item',
			progressGoal: 3,
			item: items.donut
		},
		{
			type: 'Region',
			id: 'mall_retrieve_2',
			questType: 'Retrieve Item',
			progressGoal: 3,
			item: items.pizza_slice
		},
		{
			type: 'Region',
			id: 'mall_retrieve_3',
			questType: 'Retrieve Item',
			progressGoal: 1,
			item: items.walker_sludge
		},
		{
			type: 'Region',
			id: 'mall_retrieve_4',
			questType: 'Retrieve Item',
			progressGoal: 1,
			item: items.antique_vase
		},
		{
			type: 'Region',
			id: 'mall_key_1',
			questType: 'Scavenge With A Key',
			progressGoal: 1,
			key: items.florreds_pharmacy_key
		}
	],
	miniboss: {
		cooldown: 60 * 20,
		npc: {
			type: 'raider',
			display: 'Derek',
			health: 160,
			damage: 40,
			drops: {
				common: [items.dereks_shop_key],
				uncommon: [items['9mm_AP_bullet'], items['5.45x39mm_HP_bullet'], items.F1_grenade, items.adrenaline],
				rare: [items.SS190_bullet],
				rolls: 2
			},
			weapon: items.bobwhite_g2,
			ammo: items['20-gauge_buckshot'],
			quotes: [
				'What did you do with Sarah?!',
				'Tell me where you took her!',
				'I fear no man. But that thing, it scares me.',
				'WHAT ARE YOU DOING HERE!?!?!'
			],
			armor: items.aramid_armor,
			xp: 550,
			boss: true
		}
	},
	huntMobs: [
		{
			type: 'walker',
			display: 'Bloated Walker',
			health: 50,
			damage: 40,
			drops: {
				common: [items.fire_axe],
				uncommon: [items.apple],
				rare: [items.walker_sludge],
				rolls: 1
			},
			xp: 100,
			chanceToBite: 20,
			attackPenetration: 2.1,
			boss: false
		},
		{
			type: 'raider',
			display: 'Raider',
			health: 60,
			damage: 40,
			drops: {
				common: [items['9mm_FMJ_bullet']],
				uncommon: [items.ifak_medkit, items['anti-biotics']],
				rare: [items['9mm_RIP_bullet'], items.escape_from_fristoe, items.duffle_bag],
				rolls: 1
			},
			weapon: items['glock-17'],
			ammo: items['9mm_FMJ_bullet'],
			armor: items.wooden_armor,
			helmet: items.wooden_helmet,
			xp: 125,
			boss: false
		},
		{
			type: 'raider',
			display: 'Raider',
			health: 85,
			damage: 30,
			drops: {
				common: [items['9mm_FMJ_bullet']],
				uncommon: [items.ifak_medkit, items['anti-biotics']],
				rare: [items['9mm_RIP_bullet'], items['5.45x39mm_HP_bullet'], items.duffle_bag],
				rolls: 1
			},
			weapon: items.saiga_MK,
			ammo: items['5.45x39mm_FMJ_bullet'],
			armor: items.wooden_armor,
			helmet: items.wooden_helmet,
			xp: 150,
			boss: false
		},
		{
			type: 'walker',
			display: 'Crawler',
			health: 40,
			damage: 50,
			drops: {
				common: [items.compression_bandage],
				uncommon: [items['9mm_FMJ_bullet']],
				rare: [items.walker_sludge],
				rolls: 1
			},
			xp: 60,
			chanceToBite: 25,
			attackPenetration: 1.9,
			boss: false
		},
		{
			type: 'raider',
			display: 'Psycho',
			health: 40,
			damage: 40,
			drops: {
				common: [items.knife],
				uncommon: [items.fire_axe, items.splint],
				rare: [items.hypo_stim, items.duffle_bag],
				rolls: 1
			},
			weapon: items.chainsaw,
			armor: items.wooden_armor,
			helmet: items.psycho_mask,
			usesStimulants: [items.morphine],
			xp: 125,
			boss: false
		}
	],
	areas: [
		{
			display: 'Antique Store',
			loot: {
				common: {
					items: [items.replica_katana],
					xp: 10
				},
				uncommon: {
					items: [items.ifak_medkit, items.splint, items.wooden_armor, items.wooden_helmet],
					xp: 15
				},
				rare: {
					items: [items.antique_vase, items.cloth_backpack],
					xp: 25
				},
				rolls: 1
			}
		},
		{
			display: 'Food Court',
			quote: 'chairs and tables flipped over everywhere. theres a few walkers wandering about.',
			loot: {
				common: {
					items: [items.pizza_slice, items.pretzel, items.fork],
					xp: 10
				},
				uncommon: {
					items: [items.knife, items.cloth_backpack, items.aramid_armor],
					xp: 15
				},
				rare: {
					items: [items.P320],
					xp: 25
				},
				rolls: 1
			}
		},
		{
			display: 'Pathway Park',
			loot: {
				common: {
					items: [items.ifak_medkit, items['9mm_HP_bullet']],
					xp: 10
				},
				uncommon: {
					items: [items['9mm_FMJ_bullet'], items['5.45x39mm_FMJ_bullet']],
					xp: 15
				},
				rare: {
					items: [items['ak-47'], items['7.62x39mm_HP_bullet']],
					xp: 25
				},
				rolls: 2
			}
		},
		{
			display: 'Plaza',
			quote: 'the ceiling is made of glass, the sun is shining down on a fountain in the center.',
			loot: {
				common: {
					items: [items.sledgehammer, items.wooden_helmet],
					xp: 10
				},
				uncommon: {
					items: [items['anti-biotics'], items.florreds_pharmacy_key],
					xp: 15
				},
				rare: {
					items: [items.mp5, items.aramid_armor],
					xp: 25
				},
				rarest: {
					items: [items.aramid_helmet],
					xp: 35
				},
				rolls: 2
			}
		},
		{
			display: 'Dereks Hunting Shop',
			quote: 'the place looks full of weapons and ammo. it\'s doors are locked shut.',
			loot: {
				common: {
					items: [items['aks-74u'], items['FN_Five-seveN'], items.SS195LF_bullet],
					xp: 10
				},
				uncommon: {
					items: [items['9mm_RIP_bullet'], items['9mm_AP_bullet']],
					xp: 15
				},
				rare: {
					items: [items['5.45x39mm_7N24_bullet'], items.swat_armor, items.SS190_bullet],
					xp: 25
				},
				rolls: 3
			},
			requiresKey: items.dereks_shop_key
		},
		{
			display: 'Game N Go',
			quote: 'a video game store, it looks occupied by some crazed raider.',
			loot: {
				common: {
					items: [items.donut],
					xp: 10
				},
				uncommon: {
					items: [items.ifak_medkit],
					xp: 15
				},
				rare: {
					items: [items.paracetamol, items.tech_trash, items.morphine],
					xp: 25
				},
				rolls: 2
			}
		},
		{
			display: 'Staff Break Room',
			quote: 'the break room for mall staff. there\'s an angry man inside!',
			loot: {
				common: {
					items: [items.donut, items.pizza_slice],
					xp: 10
				},
				uncommon: {
					items: [items.paracetamol],
					xp: 15
				},
				rare: {
					items: [items.tech_trash, items.morphine],
					xp: 25
				},
				rolls: 2
			}
		},
		{
			display: 'Florreds Pharmacy',
			quote: 'the pharmacy is blocked shut with a metal gate.',
			loot: {
				common: {
					items: [items.ifak_medkit, items.compression_bandage],
					xp: 10
				},
				uncommon: {
					items: [items['anti-biotics'], items.splint, items.adrenaline, items.adderall],
					xp: 15
				},
				rare: {
					items: [items.paracetamol, items.morphine, items.duffle_bag],
					xp: 25
				},
				rolls: 2
			},
			requiresKey: items.florreds_pharmacy_key
		},
		{
			display: 'Hideout',
			quote: 'there\'s a sign on the door: "sarah\'s hideout, KEEP OUT"',
			loot: {
				common: {
					items: [items.SS190_bullet, items['9mm_AP_bullet']],
					xp: 10
				},
				uncommon: {
					items: [items['12-gauge_AP_slug'], items['5.56x45mm_FMJ_bullet']],
					xp: 15
				},
				rare: {
					items: [items.steel_armor, items.steel_helmet],
					xp: 25
				},
				rarest: {
					items: [items.m4a1],
					xp: 50
				},
				rolls: 3
			},
			requiresKey: items.hideout_key
		}
	]
}
