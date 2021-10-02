import { RangedWeapon } from '../../types/Items'

const rangedObject = <T>(et: { [K in keyof T]: RangedWeapon & { name: K } }) => et

export const ranged = rangedObject({
	'saiga_MK': {
		type: 'Ranged Weapon',
		name: 'saiga_MK',
		description: 'Civilian semi-automatic rifle chambered in 5.45x39mm.',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['saiga', 'saiga_545'],
		sellPrice: 376,
		durability: 12,
		slotsUsed: 4,
		fireRate: 45,
		accuracy: 91,
		itemLevel: 7
	},
	'aks-74u': {
		type: 'Ranged Weapon',
		name: 'aks-74u',
		description: 'Compact automatic rifle chambered in 5.45x39mm. Sacrifices accuracy for size.',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['aks', 'ak-74'],
		sellPrice: 588,
		durability: 10,
		slotsUsed: 3,
		fireRate: 25,
		accuracy: 52,
		itemLevel: 10
	},
	'ak-47': {
		type: 'Ranged Weapon',
		name: 'ak-47',
		description: 'Assault rifle chambered for the 7.62×39mm cartridge. Rugged, can fire many rounds without issue.',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['ak', 'ak47'],
		sellPrice: 942,
		durability: 12,
		slotsUsed: 4,
		fireRate: 28,
		accuracy: 63,
		itemLevel: 13
	},
	'awm': {
		type: 'Ranged Weapon',
		name: 'awm',
		description: 'Bolt-action sniper rifle manufactured by Accuracy International. It is chambered for the .338 Lapua Magnum cartridge.',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['awp'],
		sellPrice: 12032,
		durability: 30,
		slotsUsed: 5,
		fireRate: 70,
		accuracy: 98,
		itemLevel: 23
	},
	'm4a1': {
		type: 'Ranged Weapon',
		name: 'm4a1',
		description: 'Automatic M4 carbine. Light and deadly accurate.',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['m4'],
		sellPrice: 982,
		durability: 9,
		slotsUsed: 4,
		fireRate: 30,
		accuracy: 90,
		itemLevel: 13
	},
	'FN_Five-seveN': {
		type: 'Ranged Weapon',
		name: 'FN_Five-seveN',
		description: 'Semi-automatic pistol produced by FN Herstal.',
		icon: '<:U_weapon:601366669272678411>',
		aliases: ['five', 'five_seven', 'fn_five'],
		sellPrice: 401,
		durability: 7,
		slotsUsed: 2,
		fireRate: 40,
		accuracy: 85,
		itemLevel: 8
	},
	'FN_P90': {
		type: 'Ranged Weapon',
		name: 'FN_P90',
		description: 'Compact automatic 5.7x28mm weapon made by FN Herstal.',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['p90'],
		sellPrice: 782,
		durability: 10,
		slotsUsed: 3,
		fireRate: 26,
		accuracy: 78,
		itemLevel: 13
	},
	'glock-17': {
		type: 'Ranged Weapon',
		name: 'glock-17',
		icon: '<:U_weapon:601366669272678411>',
		aliases: ['glock'],
		sellPrice: 201,
		durability: 12,
		slotsUsed: 2,
		fireRate: 40,
		accuracy: 91,
		itemLevel: 5
	},
	'mp5': {
		type: 'Ranged Weapon',
		name: 'mp5',
		icon: '<:U_rifle:869647344344387624>',
		aliases: [],
		description: '9mm submachine gun created by Heckler & Koch.',
		sellPrice: 564,
		durability: 15,
		slotsUsed: 3,
		fireRate: 20,
		accuracy: 75,
		itemLevel: 9
	},
	'P320': {
		type: 'Ranged Weapon',
		name: 'P320',
		icon: '<:U_weapon:601366669272678411>',
		description: 'Semi-automatic pistol made by SIG Sauer.',
		aliases: ['sig_p320', 'sig_p250', 'p250'],
		sellPrice: 221,
		durability: 8,
		slotsUsed: 2,
		fireRate: 35,
		accuracy: 90,
		itemLevel: 5
	},
	'luger': {
		type: 'Ranged Weapon',
		name: 'luger',
		icon: '<:U_weapon:601366669272678411>',
		aliases: [],
		description: '.22 caliber pistol produced by Stoeger, based off of the German Luger from the early 1900s.',
		sellPrice: 124,
		durability: 10,
		slotsUsed: 2,
		fireRate: 35,
		accuracy: 86,
		itemLevel: 3
	},
	'makeshift_pistol': {
		type: 'Ranged Weapon',
		name: 'makeshift_pistol',
		icon: '<:U_weapon:601366669272678411>',
		aliases: ['makeshift', 'pistol'],
		description: 'Looks like it\'s being held together with some duct tape and glue.',
		sellPrice: 48,
		durability: 5,
		slotsUsed: 2,
		fireRate: 30,
		accuracy: 71,
		itemLevel: 1
	},
	'makeshift_rifle': {
		type: 'Ranged Weapon',
		name: 'makeshift_rifle',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['rifle'],
		description: 'I\'d be more worried about the person firing this weapon than the target.',
		sellPrice: 79,
		durability: 6,
		slotsUsed: 3,
		fireRate: 45,
		accuracy: 73,
		itemLevel: 3
	},
	'makeshift_shotgun': {
		type: 'Ranged Weapon',
		name: 'makeshift_shotgun',
		icon: '<:U_weapon:601366669272678411>',
		aliases: ['shotgun', 'shotty'],
		description: 'A handmade shotgun that looks like it could break apart at any moment.',
		sellPrice: 82,
		durability: 4,
		slotsUsed: 2,
		fireRate: 60,
		accuracy: 71,
		itemLevel: 3
	},
	'lee-enfield': {
		type: 'Ranged Weapon',
		name: 'lee-enfield',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['lee', 'enfield'],
		description: 'An ex-military sniper used in WWII.',
		sellPrice: 756,
		durability: 9,
		slotsUsed: 4,
		fireRate: 70,
		accuracy: 94,
		itemLevel: 10
	},
	'bobwhite_g2': {
		type: 'Ranged Weapon',
		name: 'bobwhite_g2',
		icon: '<:U_weapon:601366669272678411>',
		aliases: ['bobwhite', 'g2'],
		description: 'A double barrel shotgun manufactured by E.R. Amantino in Veranópolis, Brazil.',
		sellPrice: 703,
		durability: 8,
		slotsUsed: 3,
		fireRate: 40,
		accuracy: 68,
		itemLevel: 6
	},
	'mossberg_500': {
		type: 'Ranged Weapon',
		name: 'mossberg_500',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['mossberg'],
		description: 'Pump action shotgun made by O.F. Mossberg & Sons. Fires 12-guage shells.',
		sellPrice: 1212,
		durability: 10,
		slotsUsed: 4,
		fireRate: 60,
		accuracy: 72,
		itemLevel: 10
	},
	'benelli_M4': {
		type: 'Ranged Weapon',
		name: 'benelli_M4',
		icon: '<:U_rifle:869647344344387624>',
		aliases: ['benelli'],
		description: 'Semi-automatic shotgun produced by Benelli Armi SpA.',
		sellPrice: 2021,
		durability: 12,
		slotsUsed: 4,
		fireRate: 35,
		accuracy: 70,
		itemLevel: 16
	}
})
