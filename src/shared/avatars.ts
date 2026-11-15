import type { NewCharacterGender } from './types';

export const CHARACTER_GENDERS = ['Male', 'Female'] as const;
export const AVATAR_ROLES = ['warrior', 'rogue', 'ranger', 'mage', 'cleric', 'berserker'] as const;
export type AvatarRole = (typeof AVATAR_ROLES)[number];
export type AvatarId = `set_01_${'male' | 'female'}_${AvatarRole}`;
export interface Avatar { readonly id: AvatarId; readonly gender: NewCharacterGender; readonly role: AvatarRole }

/** Stable IDs only; image URLs belong to the renderer and never enter saves. */
export const AVATARS: readonly Avatar[] = Object.freeze(CHARACTER_GENDERS.flatMap(gender =>
  AVATAR_ROLES.map(role => Object.freeze({ id: `set_01_${gender === 'Male' ? 'male' : 'female'}_${role}` as AvatarId, gender, role }))));

export function isCharacterGender(value: unknown): value is NewCharacterGender {
  return CHARACTER_GENDERS.some(gender => gender === value);
}

export function isAvatarId(value: unknown): value is AvatarId {
  return AVATARS.some(avatar => avatar.id === value);
}

export function avatarForGender(gender: NewCharacterGender, previousId: AvatarId | null): AvatarId {
  const role = AVATARS.find(avatar => avatar.id === previousId)?.role ?? 'warrior';
  return AVATARS.find(avatar => avatar.gender === gender && avatar.role === role)!.id;
}

/** Normalize only absent legacy fields; explicit invalid values must be rejected. */
export function normalizeSavedAvatar(value: Record<string, unknown>): void {
  const character = value.character;
  if (typeof character === 'object' && character !== null && !Array.isArray(character)
    && !Object.hasOwn(character, 'avatarId')) Object.assign(character, { avatarId: null });
}
