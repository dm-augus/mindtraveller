import React, { useState } from 'react';
import { AVATARS } from '../shared/avatars';
import type { Character } from '../shared/types';
import diceArtwork from '../assets/branding/dice_artwork.png';
import { avatarImageUrl } from './avatar-images';
import { useLocale } from './LocaleContext';

export function CharacterPortrait({ character }: { character: Character | null }): React.JSX.Element {
  const { t } = useLocale();
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const avatar = AVATARS.find(item => item.id === character?.avatarId);
  const source = avatar ? avatarImageUrl(avatar.id) : undefined;
  const portrait = Boolean(source && source !== failedSource);
  return <div className="character-presentation">
    <div className="branding-frame"><img className={portrait ? 'character-portrait' : 'dice-artwork'}
      src={portrait ? source : diceArtwork} data-avatar-id={portrait ? avatar!.id : undefined}
      alt={portrait && character ? t('avatar.description', { name: character.name, role: t(`avatar.role.${avatar!.role}`) }) : t('story.diceAlt')}
      onError={portrait ? () => setFailedSource(source!) : undefined} /></div>
    {character && <strong className="character-name" tabIndex={0} title={character.name}>{character.name}</strong>}
  </div>;
}
