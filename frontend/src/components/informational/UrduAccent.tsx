/**
 * An Urdu line presented as a first-class part of the page rather than as
 * decoration: correct lang, correct direction, Nastaliq leading, and an English
 * gloss underneath so the meaning is never locked away from non-Urdu readers.
 */

interface Props {
  urdu: string;
  gloss?: string;
}

export function UrduAccent({ urdu, gloss }: Props) {
  return (
    <div className="doc__urduAccent">
      <p className="doc__urdu" lang="ur" dir="rtl">
        {urdu}
      </p>
      {gloss ? <span className="doc__urduGloss">{gloss}</span> : null}
    </div>
  );
}
