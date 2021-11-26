import { Query, CompanionRow } from '../../types/mysql'

/**
 *
 * @param query Query to use
 * @param userID ID of user to get companion row of
 * @param forUpdate Whether this is used in an SQL transaction
 * @returns User companion data
 */
export async function getCompanionRow (query: Query, userID: string, forUpdate = false): Promise<CompanionRow | undefined> {
	return (await query(`SELECT * FROM companions WHERE ownerId = ?${forUpdate ? ' FOR UPDATE' : ''}`, [userID]))[0]
}

/**
 * Increases a companions stress level
 * @param query Query to use
 * @param userID User ID of owner to increase stress of
 * @param amount Amount of stress to add
 */
export async function addStress (query: Query, userID: string, amount: number): Promise<void> {
	await query('UPDATE companions SET stress = stress + ? WHERE ownerId = ?', [amount, userID])
}

/**
 * Lowers a companions stress level
 * @param query Query to use
 * @param userID User ID of owner to lower stress of
 * @param amount Amount of stress to remove
 */
export async function lowerStress (query: Query, userID: string, amount: number): Promise<void> {
	await query('UPDATE companions SET stress = stress - ? WHERE ownerId = ?', [amount, userID])
}

/**
 * Set whether a companion is on a fetch mission or not
 * @param query Query to use
 * @param userID User ID of owner
 * @param fetching Whether or not companion is fetching
 */
export async function setFetching (query: Query, userID: string, fetching: boolean): Promise<void> {
	await query('UPDATE companions SET fetching = ? WHERE ownerId = ?', [fetching, userID])
}


/**
 * Increases a companions hunger level
 * @param query Query to use
 * @param userID User ID of owner to increase hunger of
 * @param amount Amount of hunger to add
 */
export async function addHunger (query: Query, userID: string, amount: number): Promise<void> {
	await query('UPDATE companions SET hunger = hunger + ? WHERE ownerId = ?', [amount, userID])
}

/**
 * Lowers a companions hunger level
 * @param query Query to use
 * @param userID User ID of owner to lower hunger of
 * @param amount Amount of hunger to remove
 */
export async function lowerHunger (query: Query, userID: string, amount: number): Promise<void> {
	await query('UPDATE companions SET hunger = hunger - ? WHERE ownerId = ?', [amount, userID])
}

/**
 * Increases a companions level
 * @param query Query to use
 * @param userID User ID of owner to increase level of
 * @param amount Amount to increase level by
 */
export async function increaseLevel (query: Query, userID: string, amount: number): Promise<void> {
	await query('UPDATE companions SET level = level + ? WHERE ownerId = ?', [amount, userID])
}

/**
 * Increases a companions fetches completed
 * @param query Query to use
 * @param userID User ID of owner to increase fetches of
 * @param amount Amount to increase fetches by
 */
export async function increaseFetches (query: Query, userID: string, amount: number): Promise<void> {
	await query('UPDATE companions SET fetches = fetches + ? WHERE ownerId = ?', [amount, userID])
}

/**
 * Add to companions xp
 * @param query Query to use
 * @param userID User ID of owner to increase xp of
 * @param amount Amount to increase xp by
 */
export async function addXp (query: Query, userID: string, amount: number): Promise<void> {
	await query('UPDATE companions SET xp = xp + ? WHERE ownerId = ?', [amount, userID])
}


/**
 * Creates a companion for a user
 * @param query Query to use
 * @param userID ID of user to create companion row for
 */
export async function createCompanion (query: Query, userID: string, type: string): Promise<void> {
	await query('INSERT INTO companions (ownerId, type) VALUES (?, ?)', [userID, type])
}

/**
 * Creates a companion for a user
 * @param query Query to use
 * @param userID ID of user to delete companion row of
 */
export async function deleteCompanion (query: Query, userID: string): Promise<void> {
	await query('DELETE FROM companions WHERE ownerId = ?', [userID])
}
