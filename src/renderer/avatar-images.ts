import type { AvatarId } from '../shared/avatars';

const images = import.meta.glob<string>('../assets/faces/*.png', { eager: true, query: '?url', import: 'default' });

export function avatarImageUrl(id: AvatarId): string | undefined {
  return images[`../assets/faces/${id}.png`];
}
