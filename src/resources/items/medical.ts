import { Medical } from '../../types/Items'

const medicalObject = <T>(et: { [K in keyof T]: Medical & { name: K } }) => et

export const medical = medicalObject({
	'bandage': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'bandage',
		icon: '<:medical:886561670745452554>',
		aliases: ['bandage'],
		sellPrice: 37,
		healsFor: 20,
		slotsUsed: 1,
		healRate: 25,
		itemLevel: 1,
		durability: 1,
		curesBitten: false,
		curesBrokenArm: false
	},
	'ifak_medkit': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'ifak_medkit',
		icon: '<:medical:886561670745452554>',
		aliases: ['ifak', 'medkit'],
		description: 'An individual first aid kit which contains supplies for immediate minor injuries.',
		sellPrice: 102,
		healsFor: 25,
		slotsUsed: 2,
		healRate: 30,
		itemLevel: 3,
		durability: 2,
		curesBitten: false,
		curesBrokenArm: false
	},
	'compression_bandage': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'compression_bandage',
		icon: '<:medical:886561670745452554>',
		description: 'Elastic bandage designed to reduce the flow of blood to an area in order to restrict swelling.',
		aliases: ['compress_bandage', 'compress'],
		sellPrice: 52,
		healsFor: 20,
		slotsUsed: 1,
		healRate: 20,
		itemLevel: 3,
		durability: 1,
		curesBitten: false,
		curesBrokenArm: false
	},
	'adrenaline_stimulant': {
		type: 'Medical',
		subtype: 'Stimulant',
		name: 'adrenaline_stimulant',
		icon: '<:syringe:886561670812549130>',
		aliases: ['adrenaline', 'adrena_stim'],
		sellPrice: 161,
		slotsUsed: 1,
		itemLevel: 8,
		durability: 1,
		effects: {
			damageBonus: 20,
			accuracyBonus: 0,
			weightBonus: 0,
			fireRate: 0,
			damageReduction: -20,
			length: 300
		}
	},
	'adderall': {
		type: 'Medical',
		subtype: 'Stimulant',
		name: 'adderall',
		icon: '<:syringe:886561670812549130>',
		aliases: ['addy'],
		sellPrice: 181,
		slotsUsed: 1,
		itemLevel: 8,
		durability: 1,
		effects: {
			damageBonus: 0,
			accuracyBonus: 15,
			weightBonus: 0,
			fireRate: -20,
			damageReduction: 0,
			length: 300
		}
	},
	'morphine': {
		type: 'Medical',
		subtype: 'Stimulant',
		name: 'morphine',
		icon: '<:syringe:886561670812549130>',
		aliases: [],
		sellPrice: 165,
		slotsUsed: 1,
		itemLevel: 8,
		durability: 1,
		effects: {
			damageBonus: -20,
			accuracyBonus: 0,
			weightBonus: 0,
			fireRate: 0,
			damageReduction: 20,
			length: 300
		}
	},
	'daves_concoction': {
		type: 'Medical',
		subtype: 'Stimulant',
		name: 'daves_concoction',
		icon: '<:syringe:886561670812549130>',
		description: 'Dave must have made this stimulant himself, who knows what chemicals it contains.',
		aliases: ['concoction'],
		sellPrice: 253,
		slotsUsed: 1,
		itemLevel: 10,
		durability: 2,
		effects: {
			damageBonus: 0,
			accuracyBonus: 0,
			weightBonus: 10,
			fireRate: -35,
			damageReduction: 0,
			length: 300
		}
	},
	'hyfin_chest_seal': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'hyfin_chest_seal',
		icon: '<:medical:886561670745452554>',
		aliases: ['chest_seal', 'hyfin', 'hyfin_seal', 'seal'],
		description: 'Compact chest seal designed to seal penetrative wounds to the chest.',
		sellPrice: 202,
		healsFor: 62,
		slotsUsed: 1,
		healRate: 65,
		itemLevel: 9,
		durability: 2,
		curesBitten: false,
		curesBrokenArm: false
	},
	'paracetamol': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'paracetamol',
		icon: '<:U_usable:601366669259964418>',
		aliases: ['paracet'],
		sellPrice: 89,
		healsFor: 35,
		slotsUsed: 1,
		healRate: 25,
		itemLevel: 4,
		durability: 2,
		curesBitten: false,
		curesBrokenArm: false
	},
	'splint': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'splint',
		icon: '<:U_usable:601366669259964418>',
		description: 'Use this to fix broken limbs.',
		aliases: [],
		sellPrice: 46,
		healsFor: 10,
		slotsUsed: 1,
		healRate: 25,
		itemLevel: 1,
		durability: 1,
		curesBitten: false,
		curesBrokenArm: true
	},
	'anti-biotics': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'anti-biotics',
		icon: '<:U_usable:601366669259964418>',
		description: 'Cures various infections, such as those from walker bites.',
		aliases: ['antibiotics'],
		sellPrice: 137,
		healsFor: 20,
		slotsUsed: 1,
		healRate: 30,
		itemLevel: 3,
		durability: 1,
		curesBitten: true,
		curesBrokenArm: false
	},
	'pizza_slice': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'pizza_slice',
		description: 'A rotting slice of pizza. Maybe it still tastes good.',
		icon: '<:food:886561670447652886>',
		aliases: [],
		sellPrice: 9,
		healsFor: 7,
		slotsUsed: 1,
		healRate: 15,
		itemLevel: 1,
		durability: 2,
		curesBitten: false,
		curesBrokenArm: false
	},
	'pretzel': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'pretzel',
		description: 'A delicious pretzel.',
		icon: '<:food:886561670447652886>',
		aliases: [],
		sellPrice: 8,
		healsFor: 6,
		slotsUsed: 1,
		healRate: 10,
		itemLevel: 1,
		durability: 1,
		curesBitten: false,
		curesBrokenArm: false
	},
	'corn': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'corn',
		icon: '<:food:886561670447652886>',
		aliases: [],
		sellPrice: 8,
		healsFor: 6,
		slotsUsed: 1,
		healRate: 16,
		itemLevel: 1,
		durability: 3,
		curesBitten: false,
		curesBrokenArm: false
	},
	'apple': {
		type: 'Medical',
		subtype: 'Healing',
		name: 'apple',
		icon: '<:food:886561670447652886>',
		aliases: [],
		sellPrice: 9,
		healsFor: 7,
		slotsUsed: 1,
		healRate: 15,
		itemLevel: 1,
		durability: 2,
		curesBitten: false,
		curesBrokenArm: false
	}
})
