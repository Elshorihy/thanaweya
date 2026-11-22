import {TRACKS, resolveTrack} from './data/tracks';

export default function TrackSelect({value, onChange, focusKey}: {value: string; onChange: (value: string) => void; focusKey?: string}) {
  const known = resolveTrack(value);
  return <select data-focus-key={focusKey} value={known || value || ''} onChange={e => onChange(e.target.value)}>
    <option value="" disabled>اختار الشعبة</option>
    {value && !known && <option value={value} disabled>{value}</option>}
    {TRACKS.map(track => <option key={track} value={track}>{track}</option>)}
  </select>;
}
