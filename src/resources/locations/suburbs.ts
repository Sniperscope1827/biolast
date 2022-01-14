import { Location } from '../../types/Locations'
import { NPC } from '../../types/NPCs'
import { items } from '../items'

/*
	npcs that appear in this location
*/
const raider1: NPC = {
	type: 'raider',
	display: 'Raider',
	health: 30,
	damage: 15,
	drops: {
		common: [items.bandage, items.splint],
		uncommon: [items['anti-biotics'], items.makeshift_rifle],
		rare: [items.makeshift_shell, items.small_pouch],
		rolls: 1
	},
	weapon: items.makeshift_pistol,
	ammo: items.makeshift_pistol_bullet,
	armor: items.cloth_armor,
	xp: 30,
	boss: false,
	respawnTime: 60 * 2
}
const redHouseWalker: NPC = {
	type: 'walker',
	display: 'Walker',
	health: 20,
	damage: 15,
	drops: {
		common: [items.bandage],
		uncommon: [items.makeshift_pistol_bullet, items.small_pouch],
		rare: [items['9mm_FMJ_bullet'], items.walker_goop],
		rolls: 2
	},
	xp: 20,
	chanceToBite: 0,
	attackPenetration: 0.1,
	boss: false,
	respawnTime: 60 * 2
}
const lakeWalker: NPC = {
	type: 'walker',
	display: 'Walker',
	health: 30,
	damage: 10,
	drops: {
		common: [items.bandage, items['.22LR_bullet']],
		uncommon: [items.makeshift_pistol_bullet, items.small_pouch, items.luger],
		rare: [items.walker_goop],
		rolls: 1
	},
	armor: items.cloth_armor,
	helmet: items.cloth_helmet,
	xp: 40,
	chanceToBite: 0,
	attackPenetration: 0.1,
	boss: false,
	respawnTime: 60 * 2
}
const crawlerWeak: NPC = {
	type: 'walker',
	display: 'Crawler',
	health: 20,
	damage: 25,
	drops: {
		common: [items.bandage, items['.22LR_bullet'], items.luger],
		uncommon: [items.makeshift_pistol_bullet],
		rare: [items.walker_goop],
		rolls: 2
	},
	xp: 20,
	chanceToBite: 0,
	attackPenetration: 0.3,
	boss: false,
	respawnTime: 60 * 2
}
const cainTheGravekeeperBoss: NPC = {
	type: 'raider',
	display: 'Cain, The Gravekeeper',
	health: 105,
	damage: 15,
	drops: {
		common: [items.bandage],
		uncommon: [items.ifak_medkit],
		rare: [items.sledgehammer, items.bone_armor],
		rolls: 1
	},
	weapon: items.luger,
	ammo: items['.22LR_bullet'],
	quotes: [
		'~*Cain: Life is suffering.*~',
		'~*Cain: I have a plot specifically made for you.*~',
		'~*Cain: Do not be afraid of death. Welcome it.*~',
		'~*Cain: The dead shall not be disturbed.*~'
	],
	armor: items.wooden_armor,
	helmet: items.wooden_helmet,
	xp: 100,
	boss: true,
	respawnTime: 60 * 60
}

export const suburbs: Location = {
	display: 'The Suburbs',
	icon: '🏡',
	locationLevel: 1,
	boss: cainTheGravekeeperBoss,
	areas: [
		{
			display: 'Backstreets',
			loot: {
				common: {
					items: [items.wooden_bat],
					xp: 5
				},
				uncommon: {
					items: [items.bandage, items.splint, items.makeshift_pistol_bullet],
					xp: 10
				},
				rare: {
					items: [items.metal_bat, items.makeshift_pistol],
					xp: 20
				},
				rolls: 1
			},
			scavengeCooldown: 60
		},
		{
			display: 'Red House',
			loot: {
				common: {
					items: [items.makeshift_pistol, items.makeshift_pistol_bullet],
					xp: 5
				},
				uncommon: {
					items: [items.makeshift_rifle_bullet],
					xp: 10
				},
				rare: {
					items: [items.luger, items['.22LR_bullet'], items.sledgehammer, items.shed_key],
					xp: 20
				},
				rolls: 2
			},
			npcSpawns: [redHouseWalker],
			scavengeCooldown: 60
		},
		{
			display: 'Apartments',
			loot: {
				common: {
					items: [items.shed_key, items.wooden_bat, items.bandage],
					xp: 5
				},
				uncommon: {
					items: [items.metal_bat, items.knife],
					xp: 15
				},
				rare: {
					items: [items.luger, items['.22LR_bullet']],
					xp: 20
				},
				rolls: 2
			},
			npcSpawns: [raider1],
			scavengeCooldown: 60
		},
		{
			display: 'Backyard Shed',
			loot: {
				common: {
					items: [items.cloth_armor, items.cloth_helmet],
					xp: 5
				},
				uncommon: {
					items: [items.makeshift_rifle, items.wooden_helmet],
					xp: 10
				},
				rare: {
					items: [items.wooden_armor],
					xp: 20
				},
				rarest: {
					items: [items.makeshift_shotgun],
					xp: 25
				},
				rolls: 2
			},
			requiresKey: [items.shed_key],
			keyIsOptional: false,
			scavengeCooldown: 60
		},
		{
			display: 'Park',
			loot: {
				common: {
					items: [items.wooden_bat],
					xp: 5
				},
				uncommon: {
					items: [items.metal_bat, items.bandage, items.makeshift_pistol_bullet],
					xp: 10
				},
				rare: {
					items: [items.wooden_helmet, items.makeshift_pistol],
					xp: 20
				},
				rolls: 1
			},
			scavengeCooldown: 60
		},
		{
			display: 'Cedar Lake',
			loot: {
				common: {
					items: [items.makeshift_rifle_bullet, items['.22LR_bullet']],
					xp: 5
				},
				uncommon: {
					items: [items['anti-biotics'], items.splint, items.makeshift_rifle],
					xp: 10
				},
				rare: {
					items: [items.wooden_helmet, items.wooden_armor, items.luger],
					xp: 20
				},
				rolls: 2
			},
			npcSpawns: [crawlerWeak, lakeWalker],
			scavengeCooldown: 60
		}
	]
}
