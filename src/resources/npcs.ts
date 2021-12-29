import { Ammunition, Armor, Medical, Helmet, Item, MeleeWeapon, RangedWeapon, Stimulant, ThrowableWeapon } from '../types/Items'
import { items } from './items'

type NPCType = 'walker' | 'raider'

interface NPCBase {
	type: NPCType
	id: string
	display: string
	/**
	 * The avatar for this npc
	 */
	avatarURL: string
	health: number
	damage: number
	icon: string
	quotes: string[]
	drops: {
		/**
		 * Common item drops from this NPC
		 */
		common: Item[]

		uncommon: Item[]

		rare: Item[]

		/**
		 * How many times to roll these drops
		 */
		rolls: number
	}

	/**
	 * The stimulants this NPC uses, if any
	 */
	usesStimulants?: Stimulant[]
	/**
	 * The healing items this NPC uses, if any
	 */
	usesHeals?: Medical[]

	/**
	 * Helmet npc is wearing
	 */
	helmet?: Helmet

	/**
	 * Armor npc is wearing
	 */
	armor?: Armor

	/**
	 * The XP earned for killing this NPC
	 */
	xp: number

	/**
	 * Whether or not this NPC is a boss
	 */
	boss: boolean
}

interface Walker extends NPCBase {
	type: 'walker'
	/**
	 * Percent chance this walker will bite the user and apply the "Bitten" debuff (0 - 100%)
	 */
	chanceToBite: number
	/**
	 * the penetration this walker has with it's attacks
	 */
	attackPenetration: number
}

interface RangedRaider extends NPCBase {
	type: 'raider'

	/**
	 * The weapon item this raider uses
	 */
	weapon: RangedWeapon

	/**
	 * The ammo if weapon is ranged
	 */
	ammo: Ammunition
}
interface MeleeRaider extends NPCBase {
	type: 'raider'

	/**
	 * The weapon item this raider uses
	 */
	weapon: MeleeWeapon
}
interface ThrowerRaider extends NPCBase {
	type: 'raider'

	/**
	 * The weapon item this raider uses
	 */
	weapon: ThrowableWeapon
}

type Raider = RangedRaider | MeleeRaider | ThrowerRaider
export type NPC = Raider | Walker

const npcsObject = <T>(et: { [K in keyof T]: NPC & { id: K } }) => et

export const npcs = npcsObject({
	walker_weak: {
		type: 'walker',
		id: 'walker_weak',
		display: 'Walker',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563461253935114/walker_temp.png',
		icon: '🧟‍♂️',
		health: 30,
		damage: 20,
		drops: {
			common: [items.bandage],
			uncommon: [items.makeshift_pistol_bullet, items.small_pouch, items.walker_goop],
			rare: [items['9mm_FMJ_bullet']],
			rolls: 1
		},
		quotes: [
			'~*You hear footsteps nearby*~',
			'~*You hear a deep growl close by*~'
		],
		xp: 20,
		chanceToBite: 15,
		attackPenetration: 0.6,
		boss: false
	},
	crawler_weak: {
		type: 'walker',
		id: 'crawler_weak',
		display: 'Crawler',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563461253935114/walker_temp.png',
		icon: '🧟‍♂️',
		health: 20,
		damage: 35,
		drops: {
			common: [items.bandage],
			uncommon: [items.makeshift_pistol_bullet],
			rare: [items.walker_goop],
			rolls: 1
		},
		quotes: [
			'~*You hear a deep growl close by*~'
		],
		xp: 20,
		chanceToBite: 20,
		attackPenetration: 0.9,
		boss: false
	},
	crawler_medium: {
		type: 'walker',
		id: 'crawler_medium',
		display: 'Crawler',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563461253935114/walker_temp.png',
		icon: '🧟‍♂️',
		health: 40,
		damage: 50,
		drops: {
			common: [items.compression_bandage],
			uncommon: [items['9mm_FMJ_bullet']],
			rare: [items.walker_goop],
			rolls: 1
		},
		quotes: [
			'~*You hear a deep growl close by*~'
		],
		xp: 60,
		chanceToBite: 25,
		attackPenetration: 1.9,
		boss: false
	},
	cain: {
		type: 'raider',
		id: 'cain',
		display: 'Cain, The Gravekeeper',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891562973208915978/R_12.jpg',
		icon: '',
		health: 125,
		damage: 30,
		drops: {
			common: [items.bandage],
			uncommon: [items.ifak_medkit],
			rare: [items.sledgehammer, items.bone_armor],
			rolls: 1
		},
		weapon: items['glock-17'],
		ammo: items['9mm_FMJ_bullet'],
		quotes: [
			'~*You hear footsteps nearby*~',
			'~*Cain: Life is suffering.*~',
			'~*Cain: I have a plot specifically made for you.*~',
			'~*Cain: Do not be afraid of death. Welcome it.*~',
			'~*Cain: The dead shall not be disturbed.*~'
		],
		armor: items.wooden_armor,
		helmet: items.wooden_helmet,
		xp: 100,
		boss: true
	},
	raider_weak: {
		type: 'raider',
		id: 'raider_weak',
		display: 'Raider',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891562992142012416/raider_temp.png',
		icon: '',
		health: 30,
		damage: 25,
		drops: {
			common: [items.bandage],
			uncommon: [items.ifak_medkit, items['anti-biotics'], items.splint],
			rare: [items['5.45x39mm_FMJ_bullet'], items['9mm_FMJ_bullet'], items.small_pouch],
			rolls: 1
		},
		weapon: items.luger,
		ammo: items['.22LR_bullet'],
		quotes: [
			'~*You hear footsteps nearby*~'
		],
		armor: items.cloth_armor,
		helmet: items.cloth_helmet,
		xp: 40,
		boss: false
	},
	medium_raider: {
		type: 'raider',
		id: 'medium_raider',
		display: 'Raider',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891562992142012416/raider_temp.png',
		icon: '',
		health: 60,
		damage: 35,
		drops: {
			common: [items['9mm_FMJ_bullet']],
			uncommon: [items.ifak_medkit, items['anti-biotics']],
			rare: [items['9mm_RIP_bullet'], items.duffle_bag],
			rolls: 1
		},
		weapon: items['glock-17'],
		ammo: items['9mm_HP_bullet'],
		quotes: [
			'~*You hear footsteps nearby*~'
		],
		armor: items.wooden_armor,
		helmet: items.wooden_helmet,
		xp: 125,
		boss: false
	},
	psycho_raider: {
		type: 'raider',
		id: 'psycho_raider',
		display: 'Psycho',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891562992142012416/raider_temp.png',
		icon: '',
		health: 40,
		damage: 30,
		drops: {
			common: [items.knife],
			uncommon: [items.fire_axe, items.splint],
			rare: [items.hypo_stim, items.duffle_bag],
			rolls: 1
		},
		weapon: items.chainsaw,
		quotes: [
			'~*You hear footsteps nearby*~',
			'~*You hear someone cackling maniacally*~'
		],
		helmet: items.psycho_mask,
		xp: 125,
		boss: false
	},
	game_raider: {
		type: 'raider',
		id: 'game_raider',
		display: 'Raider',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891562992142012416/raider_temp.png',
		icon: '',
		health: 60,
		damage: 35,
		drops: {
			common: [items['9mm_FMJ_bullet']],
			uncommon: [items.ifak_medkit, items['anti-biotics'], items.splint],
			rare: [items['9mm_RIP_bullet'], items.escape_from_fristoe],
			rolls: 1
		},
		weapon: items['glock-17'],
		ammo: items['9mm_HP_bullet'],
		quotes: [
			'~*You hear footsteps nearby*~'
		],
		armor: items.wooden_armor,
		helmet: items.wooden_helmet,
		xp: 125,
		boss: false
	},
	bloated_walker: {
		type: 'walker',
		id: 'bloated_walker',
		display: 'Bloated Walker',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563461253935114/walker_temp.png',
		icon: '🧟‍♂️',
		health: 50,
		damage: 35,
		drops: {
			common: [items.pitchfork, items.walker_goop],
			uncommon: [items.apple],
			rare: [items.fire_axe],
			rolls: 1
		},
		quotes: [
			'~*You hear footsteps nearby*~',
			'~*You hear a deep growl close by*~'
		],
		xp: 50,
		chanceToBite: 15,
		attackPenetration: 1.3,
		boss: false
	},
	inflated_walker: {
		type: 'walker',
		id: 'inflated_walker',
		display: 'Bloated Walker',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563461253935114/walker_temp.png',
		icon: '🧟‍♂️',
		health: 50,
		damage: 35,
		drops: {
			common: [items.replica_katana, items.walker_goop],
			uncommon: [items.pizza_slice],
			rare: [items.metal_shank],
			rolls: 1
		},
		quotes: [
			'~*You hear footsteps nearby*~',
			'~*You hear a deep growl close by*~'
		],
		xp: 50,
		chanceToBite: 15,
		attackPenetration: 1.3,
		boss: false
	},
	derek: {
		type: 'raider',
		id: 'derek',
		display: 'Derek',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563193929986068/R_13.jpg',
		icon: '🕵️',
		health: 200,
		damage: 40,
		drops: {
			common: [items.dereks_shop_key],
			uncommon: [items['9mm_AP_bullet'], items['5.45x39mm_HP_bullet'], items.SS195LF_bullet],
			rare: [items.adrenaline],
			rolls: 2
		},
		weapon: items.bobwhite_g2,
		ammo: items['20-gauge_buckshot'],
		quotes: [
			'~*You hear a man frantically breathing*~',
			'~*Derek: I fear no man. But that thing, it scares me.*~'
		],
		armor: items.aramid_armor,
		xp: 550,
		boss: true
	},
	dave: {
		type: 'raider',
		id: 'dave',
		display: 'Dave, The Redneck',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563193929986068/R_13.jpg',
		icon: '👨‍🌾',
		health: 185,
		damage: 20,
		drops: {
			common: [items.pitchfork, items.daves_drug_key, items.P320],
			uncommon: [items.sauce_pan, items.paracetamol, items.farming_guide],
			rare: [items.sledgehammer, items.gunsafe_code],
			rolls: 2
		},
		weapon: items.saiga_MK,
		ammo: items['5.45x39mm_FMJ_bullet'],
		quotes: [
			'~*You hear the giggles and crackles of a man...*~',
			'~*Dave: Did I hear somebody?*~',
			'~*Dave: buUUUUuUrP*~',
			'~*Dave: What do you mean, zombies?*~',
			'~*Dave: Damn pterodactyls eating my crops again.*~'
		],
		armor: items.cloth_armor,
		helmet: items.sauce_pan,
		xp: 500,
		boss: true
	},
	feral_animal: {
		type: 'walker',
		id: 'feral_animal',
		display: 'Feral Animal',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563461253935114/walker_temp.png',
		icon: '🐕',
		health: 35,
		damage: 45,
		drops: {
			common: [items.apple, items.corn],
			uncommon: [items.apple],
			rare: [items.corn],
			rolls: 1
		},
		quotes: [
			'~*You hear hiss nearby*~',
			'~*You hear a deep growl close by*~'
		],
		xp: 35,
		chanceToBite: 30,
		attackPenetration: 1.6,
		boss: false
	},
	walker_security_officer: {
		type: 'walker',
		id: 'walker_security_officer',
		display: 'Walker Security Officer',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/891563461253935114/walker_temp.png',
		icon: '🧟‍♂️',
		health: 60,
		damage: 30,
		drops: {
			common: [items.police_baton],
			uncommon: [items['9mm_FMJ_bullet'], items.duffle_bag, items.walker_goop],
			rare: [items['glock-17'], items.security_key],
			rolls: 1
		},
		quotes: [
			'~*You hear footsteps nearby*~',
			'~*You hear a deep growl close by*~'
		],
		armor: items.aramid_armor,
		xp: 80,
		chanceToBite: 10,
		attackPenetration: 1.5,
		boss: false
	},
	the_many: {
		type: 'walker',
		id: 'the_many',
		display: 'The Many',
		avatarURL: 'https://cdn.discordapp.com/attachments/883521731090841651/896088090962198588/R_14.jpg',
		icon: '🧟‍',
		health: 600,
		damage: 60,
		drops: {
			common: [items['9mm_AP_bullet'], items.paracetamol, items.aramid_armor, items.aramid_helmet, items['12-gauge_buckshot']],
			uncommon: [items['9mm_RIP_bullet'], items.duffle_bag, items.steel_armor, items.bobwhite_g2],
			rare: [items.steel_helmet, items['12-gauge_buckshot']],
			rolls: 6
		},
		quotes: [
			'~*You see what looks to be a horde of zombies*~',
			'~*The Many: We are many, we are one.*~',
			'~*You hear the collective screams of many different zombies*~'
		],
		xp: 1000,
		attackPenetration: 2.8,
		chanceToBite: 15,
		boss: true
	}
})

export const allNPCs = Object.values(npcs)
