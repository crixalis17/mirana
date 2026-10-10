'use client';

import {useId, useState} from 'react';
import {X} from 'lucide-react';
import {Checkbox} from '@/components/ui/checkbox';
import {MAX_CUSTOM_TAGS, MAX_TAG_LENGTH, priorityPresets, type Preferences} from '@/lib/preferences';

type Props = {value: Preferences; onChange: (value: Preferences) => void; disabled?: boolean};

export function BuyingPreferencesEditor({value, onChange, disabled = false}: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    const tag = text.trim();
    if (!tag) { setError('Enter a preference to add.'); return; }
    if (tag.length > MAX_TAG_LENGTH) { setError(`Use ${MAX_TAG_LENGTH} characters or fewer.`); return; }
    if ([...value.priorities, ...value.customTags].some(existing => existing.toLowerCase() === tag.toLowerCase())) {
      setError('That preference is already selected.'); return;
    }
    if (value.customTags.length >= MAX_CUSTOM_TAGS) { setError(`You can add up to ${MAX_CUSTOM_TAGS} custom tags.`); return; }
    onChange({...value, customTags: [...value.customTags, tag]});
    setText(''); setError('');
  };
  return <fieldset className="buying-preferences" disabled={disabled}>
    <legend>What matters to you</legend>
    <div className="priority-grid">{priorityPresets.map(priority => <label key={priority} className="check-label">
      <Checkbox disabled={disabled} checked={value.priorities.includes(priority)} onCheckedChange={checked => {
        onChange({priorities: checked ? [...value.priorities, priority] : value.priorities.filter(name => name !== priority),
          customTags: checked ? value.customTags.filter(tag => tag.toLowerCase() !== priority.toLowerCase()) : value.customTags});
      }}/>{priority}
    </label>)}</div>
    <label htmlFor={`${id}-input`}>Custom tags <span className="optional">optional</span></label>
    <div className="custom-tag-entry">
      <input id={`${id}-input`} value={text} maxLength={MAX_TAG_LENGTH} placeholder="e.g. Quiet operation, repairable, compact size"
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} aria-invalid={Boolean(error)}
        onChange={event => {setText(event.target.value); setError('');}}
        onKeyDown={event => {if (event.key === 'Enter' && !event.nativeEvent.isComposing) {event.preventDefault(); add();}}}/>
      <button type="button" className="outline-button" onClick={add}>Add tag</button>
    </div>
    <p id={`${id}-help`} className="field-note">Add one preference at a time, then press Enter or Add tag. Up to {MAX_CUSTOM_TAGS} tags. Saved tags guide product research and comparison.</p>
    {error && <p id={`${id}-error`} className="error" role="alert">{error}</p>}
    <div className="preference-tags">{value.customTags.map(tag => <span className="preference-tag" key={tag}>
      {tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => {onChange({...value, customTags: value.customTags.filter(name => name !== tag)}); setError('');}}><X size={14}/></button>
    </span>)}</div>
  </fieldset>;
}

export function PreferenceTags({value}: {value: Preferences}) {
  const tags = [...value.priorities, ...value.customTags];
  return tags.length ? <div className="preference-tags" aria-label="Buying preferences">{tags.map(tag => <span className="preference-tag" key={tag}>{tag}</span>)}</div> : null;
}
