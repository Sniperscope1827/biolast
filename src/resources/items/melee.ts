import { MeleeWeapon } from '../../types/Items'

const meleeObject = <T>(et: { [K in keyof T]: MeleeWeapon & { name: K } }) => et

export const melee = meleeObject({
	knife: {
		type: 'Melee Weapon',
		name: 'knife',
		icon: '<:U_melee:601366669251575857>',
		aliases: [],
		sellPrice: 132,
		durability: 2,
		slotsUsed: 1,
		accuracy: 80,
		damage: 8,
		penetration: 1.0,
		itemLevel: 2,
		speed: 22
	},
	wooden_bat: {
		type: 'Melee Weapon',
		name: 'wooden_bat',
		icon: '<:U_melee:601366669251575857>',
		aliases: ['bat'],
		sellPrice: 16,
		durability: 2,
		slotsUsed: 1,
		accuracy: 75,
		damage: 10,
		penetration: 0.5,
		itemLevel: 1,
		speed: 9
	},
	metal_bat: {
		type: 'Melee Weapon',
		name: 'metal_bat',
		icon: '<:U_melee:601366669251575857>',
		aliases: ['metal'],
		sellPrice: 74,
		durability: 3,
		slotsUsed: 1,
		accuracy: 75,
		damage: 10,
		penetration: 0.8,
		itemLevel: 3,
		speed: 9
	},
	metal_shank: {
		type: 'Melee Weapon',
		name: 'metal_shank',
		icon: '<:U_melee:601366669251575857>',
		aliases: ['shank'],
		sellPrice: 318,
		durability: 3,
		slotsUsed: 1,
		accuracy: 80,
		damage: 16,
		penetration: 1.6,
		itemLevel: 10,
		speed: 30
	},
	fork: {
		type: 'Melee Weapon',
		name: 'fork',
		icon: '<:U_melee:601366669251575857>',
		aliases: [],
		sellPrice: 10,
		durability: 2,
		slotsUsed: 1,
		accuracy: 80,
		damage: 5,
		penetration: 0.7,
		itemLevel: 1,
		speed: 9
	},
	sledgehammer: {
		type: 'Melee Weapon',
		name: 'sledgehammer',
		icon: '<:sledge_hammer:930978902057287750>',
		aliases: ['sledge'],
		sellPrice: 206,
		durability: 4,
		slotsUsed: 3,
		accuracy: 65,
		damage: 30,
		penetration: 0.75,
		itemLevel: 3,
		speed: 3
	},
	scythe: {
		type: 'Melee Weapon',
		name: 'scythe',
		icon: '<:scythe:930978902132789278>',
		aliases: [],
		sellPrice: 103,
		durability: 2,
		slotsUsed: 2,
		accuracy: 70,
		damage: 15,
		penetration: 0.5,
		itemLevel: 2,
		speed: 4
	},
	pitchfork: {
		type: 'Melee Weapon',
		name: 'pitchfork',
		icon: '<:U_melee:601366669251575857>',
		aliases: ['pitch'],
		sellPrice: 158,
		durability: 2,
		slotsUsed: 2,
		accuracy: 65,
		damage: 15,
		penetration: 1.0,
		itemLevel: 3,
		speed: 4
	},
	fire_axe: {
		type: 'Melee Weapon',
		name: 'fire_axe',
		icon: ' <:fire_axe:930978902057287700>',
		aliases: ['axe'],
		sellPrice: 217,
		durability: 3,
		slotsUsed: 2,
		accuracy: 75,
		damage: 20,
		penetration: 1.4,
		itemLevel: 4,
		speed: 6
	},
	chainsaw: {
		type: 'Melee Weapon',
		name: 'chainsaw',
		icon: '<:U_melee:601366669251575857>',
		aliases: ['saw', 'chain'],
		sellPrice: 324,
		durability: 4,
		slotsUsed: 3,
		accuracy: 70,
		damage: 30,
		penetration: 1.8,
		itemLevel: 8,
		speed: 4
	},
	replica_katana: {
		type: 'Melee Weapon',
		name: 'replica_katana',
		icon: '<:U_melee:601366669251575857>',
		aliases: ['katana'],
		sellPrice: 150,
		durability: 2,
		slotsUsed: 1,
		accuracy: 70,
		damage: 20,
		penetration: 0.95,
		itemLevel: 6,
		speed: 8
	},
	police_baton: {
		type: 'Melee Weapon',
		name: 'police_baton',
		icon: '<:U_melee:601366669251575857>',
		aliases: ['baton'],
		sellPrice: 118,
		durability: 5,
		slotsUsed: 1,
		accuracy: 80,
		damage: 14,
		penetration: 0.5,
		itemLevel: 10,
		speed: 7
	}
})
