import { Stimulant } from '../../types/Items'

const stimulantsObject = <T>(et: { [K in keyof T]: Stimulant & { name: K } }) => et

export const stimulants = stimulantsObject({
	adrenaline: {
		type: 'Stimulant',
		name: 'adrenaline',
		icon: '<:adrenaline:933851495118540901>',
		aliases: ['adrena_stim', 'adrena'],
		sellPrice: 561,
		slotsUsed: 1,
		itemLevel: 8,
		durability: 1,
		effects: {
			damageBonus: 25,
			accuracyBonus: 0,
			damageTaken: -15
		},
		speed: 30,
		artist: '719365897458024558'
	},
	hypo_stim: {
		type: 'Stimulant',
		name: 'hypo_stim',
		icon: '<:syringe:886561670812549130>',
		aliases: ['hypo'],
		sellPrice: 571,
		slotsUsed: 1,
		itemLevel: 8,
		durability: 1,
		effects: {
			damageBonus: 0,
			accuracyBonus: -25,
			damageTaken: -30
		},
		speed: 30
	},
	adderall: {
		type: 'Stimulant',
		name: 'adderall',
		icon: '<:syringe:886561670812549130>',
		aliases: ['addy'],
		sellPrice: 581,
		slotsUsed: 1,
		itemLevel: 8,
		durability: 1,
		effects: {
			damageBonus: 0,
			accuracyBonus: 35,
			damageTaken: 10
		},
		speed: 30
	},
	morphine: {
		type: 'Stimulant',
		name: 'morphine',
		icon: '<:morphine:933851495940620330>',
		aliases: [],
		sellPrice: 565,
		slotsUsed: 1,
		itemLevel: 8,
		durability: 1,
		effects: {
			damageBonus: -10,
			accuracyBonus: 0,
			damageTaken: -30
		},
		speed: 30,
		artist: '719365897458024558'
	},
	daves_concoction: {
		type: 'Stimulant',
		name: 'daves_concoction',
		icon: '<:daves_concoction:931797015350882344>',
		description: 'Dave must have made this stimulant himself, who knows what chemicals it contains.',
		aliases: ['concoction'],
		sellPrice: 2053,
		slotsUsed: 1,
		itemLevel: 10,
		durability: 2,
		effects: {
			damageBonus: 30,
			accuracyBonus: 100,
			damageTaken: 0
		},
		speed: 30,
		artist: '719365897458024558'
	},
	fentanyl: {
		type: 'Stimulant',
		name: 'fentanyl',
		icon: '<:syringe:886561670812549130>',
		description: 'Someone must have left the drug safe open.',
		aliases: ['fent'],
		sellPrice: 1069,
		slotsUsed: 1,
		itemLevel: 10,
		durability: 1,
		effects: {
			damageBonus: -10,
			accuracyBonus: 0,
			damageTaken: -40
		},
		speed: 30,
		artist: '719365897458024558'
	},
	cocaine: {
		type: 'Stimulant',
		name: 'cocaine',
		icon: '<:syringe:886561670812549130>',
		description: 'Why is this in a hospital?',
		aliases: ['coc'],
		sellPrice: 967,
		slotsUsed: 1,
		itemLevel: 9,
		durability: 1,
		effects: {
			damageBonus: 20,
			accuracyBonus: 10,
			damageTaken: 0
		},
		speed: 30,
		artist: '719365897458024558'
	}
})
