/**
 * The product name and slogan are brand assets, not copy: they read the same in
 * every locale. Keeping them out of the message catalogues means a translator
 * cannot render them into another language by mistake.
 */
export const brandName = 'GetStronger'
// The lockup renders the halves of the name at different weights (Get
// semibold, Stronger bold), so it needs them split; joined they must always
// equal brandName.
export const brandNameParts = ['Get', 'Stronger'] as const
export const brandSlogan = 'Lift it. Log it. Beat it.'
export const brandSignupSubtitle = 'Build routines, log workouts, and keep beating your last.'
