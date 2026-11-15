import React from 'react';
import { AVATARS, type AvatarId } from '../shared/avatars';
import type { NewCharacterGender } from '../shared/types';
import { avatarImageUrl } from './avatar-images';
import { useLocale } from './LocaleContext';

export function AvatarPicker({ gender, selected, disabled, onSelect }: {
  gender: NewCharacterGender | ''; selected: AvatarId | null; disabled: boolean; onSelect: (id: AvatarId) => void;
}): React.JSX.Element {
  const { t, label } = useLocale();
  return <fieldset className="setup-group avatar-picker">
    <legend>{t('avatar.title')}</legend><p className="setup-help">{gender ? t('avatar.help') : t('avatar.chooseGender')}</p>
    <div className="avatar-grid">{AVATARS.filter(avatar => avatar.gender === gender).map(avatar => {
      const description = t('avatar.option', { gender: label(avatar.gender), role: t(`avatar.role.${avatar.role}`) });
      return <label key={avatar.id} className={`setup-option avatar-option${selected === avatar.id ? ' is-selected' : ''}`}>
        <input type="radio" name="avatar" value={avatar.id} checked={selected === avatar.id} disabled={disabled}
          aria-label={description} onChange={() => onSelect(avatar.id)} required />
        <span><img src={avatarImageUrl(avatar.id)} alt="" /></span>
      </label>;
    })}</div>
  </fieldset>;
}
