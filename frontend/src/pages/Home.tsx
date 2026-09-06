/**
 * The unified conversational dashboard — Shifa's whole application surface.
 *
 * One page, two panels. The chat panel on the left is the conversation: every
 * turn, including triage clarifications, happens there and the input bar is
 * never taken away. The results panel on the right stays hidden until there is
 * something to show, then fades its cards in as the data lands.
 *
 * This replaces the old Home + Results split. Navigating away from a spoken
 * conversation to read a results page broke the one thing the product is for:
 * a patient who cannot read is mid-sentence, and a route change discards the
 * thread. Diagnosis now appears beside the conversation instead of instead of
 * it.
 *
 * Latency shape: POST /analyze returns the reply as soon as the diagnosis is
 * ready (Phase A) and GET /results/:session_id brings the medicine and hospital
 * detail a moment later (Phase B). The patient hears Shifa answer while the
 * slower lookups are still in flight.
 */

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabaseClient';
import ClinicalHandoff from '../components/ClinicalHandoff';
import DiseaseCard from '../components/DiseaseCard';
import EmergencyAlert from '../components/EmergencyAlert';
import HospitalMap from '../components/HospitalMap';
import MedicineCard from '../components/MedicineCard';
import { UrduText } from '../components/UrduText';
import { HeroEnvironment } from '../components/landing/HeroEnvironment';
import { MenuDrawer } from '../components/landing/MenuDrawer';
import { ShifaNav } from '../components/landing/ShifaNav';
import { analyze, fetchResults } from '../lib/api';
import { cancelSpeech, speakUrdu } from '../lib/speech';
import type {
  AnalyzeResponse,
  ConversationMessage,
  EnrichmentStatus,
  Hospital,
  Medicine,
  Message,
} from '../lib/types';
import { FALLBACK_COORDINATES, getCurrentPosition } from '../lib/utils';
import { useDictation } from '../voice/useDictation';

/**
 * What the results panel renders. Filled across both response phases.
 *
 * `turn` is the identity that keeps enrichment honest. Phase B for turn 3 may
 * resolve after turn 4 has already replaced the panel, and attaching turn 3's
 * medicines to turn 4's diagnosis would show a patient a treatment for a
 * condition they were not told they have. Every late write checks it.
 */
interface Results {
  turn: number;
  sessionId: string | null;
  diseases: AnalyzeResponse['diseases'];
  medicines: Medicine[];
  hospitals: Hospital[];
  disclaimerUrdu: string;
  /** 'loading' until Phase B resolves for THIS turn. */
  medicinesStatus: EnrichmentStatus;
  hospitalsStatus: EnrichmentStatus;
  /** The hospital search used the fallback location, not the patient's own. */
  approximateLocation: boolean;
  /** English SOAP note for clinical handoff (arrives with Phase B). */
  soapNoteEnglish: string | null;
}


const PENDING_ID = '__pending__';

let messageSeq = 0;
const nextId = () => `m${(messageSeq += 1)}`;

export default function Home({ user }: { user: User | null }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<ConversationMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [emergencyUrdu, setEmergencyUrdu] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Mirrors isLoading for callbacks that must not close over a stale value. */
  const loadingRef = useRef(false);

  /**
   * Monotonic turn counter. Incremented at the start of every submit and
   * captured by that submit's async work, so any result arriving for an
   * earlier turn can be recognised and dropped.
   *
   * A turn counter rather than the session id alone: triage clarifications and
   * emergencies carry no session id, but they still supersede whatever
   * enrichment is in flight.
   */
  const turnRef = useRef(0);

  /** Aborts the previous turn's Phase B fetch when a new turn starts. */
  const enrichmentAbortRef = useRef<AbortController | null>(null);

  /**
   * Late-bound handle on the dictation controller.
   *
   * `submit` is defined before `useDictation` (the hook's onFinal calls submit),
   * so it cannot close over the controller directly. The ref is filled in
   * immediately after the hook runs.
   */
  const dictationRef = useRef<{ stop: () => void } | null>(null);

  /**
   * Location is resolved once, in the background, and never on the submit path.
   * Asking for it per-turn puts the browser's permission timeout (up to 8s, and
   * the patient may simply ignore the prompt) between the tap and the reply —
   * which is the exact latency the two-phase backend exists to remove. A turn
   * that fires before the fix arrives uses the fallback: it costs a slightly
   * less local hospital list, never a delay.
   */
  const coordsRef = useRef(FALLBACK_COORDINATES);
  /**
   * False until the browser hands over a real fix. Carried into the results so
   * "Care nearby" can say the list is based on an approximate location —
   * without it, a patient in Karachi is shown Islamabad hospitals under a
   * heading that claims they are close by.
   */
  const coordsAreExactRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getCurrentPosition()
      .then((coords) => {
        if (cancelled) return;
        coordsRef.current = coords;
        coordsAreExactRef.current = true;
      })
      .catch(() => {
        // Denied, unavailable or timed out. The fallback stands and the
        // consultation proceeds — location is a convenience, never a gate.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------
  // Submit — the single path for both typed and spoken input
  // ---------------------------------------------------------------------
  const submit = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || loadingRef.current) return;

      loadingRef.current = true;
      const turn = (turnRef.current += 1);

      setIsLoading(true);
      setNotice(null);
      setInputText('');
      cancelSpeech();

      // A new turn supersedes the previous one's enrichment. Abort rather than
      // merely ignore, so a slow Phase B is not left holding a connection.
      enrichmentAbortRef.current?.abort();
      enrichmentAbortRef.current = null;

      // Stop dictation on submit, however the submit was triggered. Without
      // this, typing and pressing send while the mic is still live leaves the
      // recogniser running: it later fires onFinal and submits a second time,
      // sending a half-spoken sentence the patient never chose to send.
      dictationRef.current?.stop();

      // Both bubbles go up before the request leaves: the patient sees their
      // own words and Shifa thinking within the same frame as the tap.
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', content: text },
        { id: PENDING_ID, role: 'assistant', content: '', pending: true },
      ]);

      const dropPending = (replacement?: Message) =>
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== PENDING_ID);
          return replacement ? [...without, replacement] : without;
        });

      try {
        const { latitude, longitude } = coordsRef.current;
        const response = await analyze({ urdu_text: text, latitude, longitude, history });

        const reply = response.response_text_urdu?.trim() ?? '';
        dropPending(
          reply ? { id: nextId(), role: 'assistant', content: reply } : undefined,
        );

        setHistory((prev) => [
          ...prev,
          { role: 'user', content: text },
          { role: 'assistant', content: reply },
        ]);

        // The turn was superseded while /analyze was in flight. Nothing from it
        // may reach the screen.
        if (turnRef.current !== turn) return;

        if (response.is_emergency) {
          // Emergency takes the whole screen and speaks for itself; anything
          // else would talk over it. Clearing results is what guarantees no
          // earlier turn's medicine list can sit underneath the directive.
          setEmergencyUrdu(reply || 'فوری طور پر ہسپتال جائیں');
          setResults(null);
          return;
        }

        if (reply) speakUrdu(reply);

        // No diseases means triage wants another turn. The results panel stays
        // hidden and the input bar is already live again.
        if (response.diseases.length === 0) return;

        const sessionId = response.session_id ?? null;

        setResults({
          turn,
          sessionId,
          approximateLocation: !coordsAreExactRef.current,
          diseases: response.diseases,
          medicines: response.medicines ?? [],
          hospitals: response.hospitals ?? [],
          disclaimerUrdu: response.disclaimer_urdu,
          soapNoteEnglish: response.soap_note_english ?? null,
          // No session id means the backend scheduled no enrichment, so there
          // is nothing to wait for — report it as failed rather than leaving
          // the cards spinning forever.
          medicinesStatus: sessionId ? 'loading' : 'failed',
          hospitalsStatus: sessionId ? 'loading' : 'failed',
        });

        if (!sessionId) return;

        // Phase B. Fire and forget: the panel is already useful without it.
        const controller = new AbortController();
        enrichmentAbortRef.current = controller;

        void fetchResults(sessionId, controller.signal)
          .then((enrichment) => {
            // The empathetic summary is dictated the moment the detail cards
            // land — never the long clinical payload. /synthesize turns it
            // into audio (ElevenLabs), with browser synthesis as fallback.
            if (turnRef.current === turn && enrichment.voice_summary) {
              void speakUrdu(enrichment.voice_summary);
            }
            // Two guards, both required. The turn check drops a result whose
            // conversation has moved on; the session check is belt-and-braces
            // against ever pairing enrichment with a different consultation.
            setResults((prev) => {
              if (!prev || prev.turn !== turn || prev.sessionId !== sessionId) return prev;
              return {
                ...prev,
                medicines: enrichment.medicines,
                hospitals: enrichment.hospitals,
                medicinesStatus: enrichment.medicines_status,
                hospitalsStatus: enrichment.hospitals_status,
                soapNoteEnglish: enrichment.soap_note_english ?? prev.soapNoteEnglish,
              };
            });
          })
          .catch(() => {
            // Aborted, or a failure fetchResults could not classify. Either
            // way this turn's enrichment is not coming.
            setResults((prev) => {
              if (!prev || prev.turn !== turn || prev.medicinesStatus !== 'loading') return prev;
              return { ...prev, medicinesStatus: 'failed', hospitalsStatus: 'failed' };
            });
          });
      } catch {
        dropPending({
          id: nextId(),
          role: 'assistant',
          content: 'معذرت، شفا سے رابطہ نہیں ہو سکا۔ دوبارہ کوشش کریں۔',
          error: true,
        });
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
        // The clarification loop only works if the patient can answer at once.
        inputRef.current?.focus();
      }
    },
    [history],
  );

  // ---------------------------------------------------------------------
  // Microphone
  // ---------------------------------------------------------------------
  const dictation = useDictation({
    onPartial: setInputText,
    onFinal: (text) => {
      setInputText(text);
      void submit(text);
    },
    onError: setNotice,
  });
  dictationRef.current = dictation;

  // Keep the newest turn in view without yanking the results panel around.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(
    () => () => {
      cancelSpeech();
      // Navigating away must not leave a Phase B request open, nor let its
      // resolution call setState on an unmounted tree.
      enrichmentAbortRef.current?.abort();
    },
    [],
  );

  const inputsDisabled = isLoading;
  const started = messages.length > 0;

  return (
    <>
      <HeroEnvironment />

      <div className="relative z-10 flex h-screen h-[100dvh] flex-col text-black">
        <ShifaNav menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />

        {/* Auth controls — glassmorphic, matches the landing aesthetic */}
        <div className="absolute top-4 right-5 md:right-8 z-20">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-black/70 max-w-[160px] truncate">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-black/70 backdrop-blur-md shadow-sm transition hover:bg-white/20 hover:text-black"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: { redirectTo: window.location.origin },
                })
              }
              className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-medium text-black backdrop-blur-md shadow-lg transition hover:bg-white/20 hover:shadow-xl"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>
          )}
        </div>

        {/*
          Mobile is one scrolling column (chat, then results) with the input bar
          stuck to the bottom. From md up the two panels each own their scroll
          and the shell clips — parent clips, child scrolls, never both.
        */}
        <main className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:grid md:grid-cols-2 md:gap-6 px-5 md:px-8 md:pb-8">
          {/* ---------------- Chat panel ---------------- */}
          {/* min-h-full on mobile is what pins the input bar to the bottom of the
              viewport on an empty conversation: the panel fills the scroller, the
              message list takes the slack, the bar sits under it. */}
          <section className="flex min-h-full flex-col md:h-full md:min-h-0" aria-label="Conversation">
            <div
              ref={listRef}
              className="flex flex-1 flex-col justify-end gap-3 md:min-h-0 md:overflow-y-auto md:pr-1"
            >
              {!started && (
                <div className="py-8">
                  <h1 className="max-w-md text-2xl font-light leading-tight tracking-tight sm:text-3xl lg:text-4xl">
                    Speak. Understand. Know what comes next.
                  </h1>
                  <UrduText className="mt-4 max-w-md text-lg text-black/70">
                    اپنی تکلیف اپنے الفاظ میں بتائیں۔ شفا سنتی ہے، سمجھتی ہے، اور اگلا قدم بتاتی ہے۔
                  </UrduText>
                </div>
              )}

              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>

            <InputBar
              ref={inputRef}
              value={inputText}
              onChange={setInputText}
              onSubmit={() => void submit(inputText)}
              disabled={inputsDisabled}
              isLoading={isLoading}
              isRecording={dictation.isRecording}
              micSupported={dictation.supported}
              onToggleMic={dictation.toggle}
              notice={notice}
            />
          </section>

          {/* ---------------- Results panel ---------------- */}
          {results && (
            <section
              className="mt-6 space-y-4 md:mt-0 md:h-full md:min-h-0 md:overflow-y-auto md:pr-1"
              aria-label="Findings"
            >
              <h2 className="text-xs uppercase tracking-[0.14em] text-black/45">
                What this could be
              </h2>

              {results.diseases.map((disease, i) => (
                <div
                  key={`${disease.disease}-${i}`}
                  className="animate-fade-in"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <DiseaseCard disease={disease} />
                </div>
              ))}

              <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
                <MedicineCard
                  medicines={results.medicines}
                  disclaimerUrdu={results.disclaimerUrdu}
                  status={results.medicinesStatus}
                />
              </div>

              {/*
                Hospitals get the same four states as medicines. An empty
                "Care nearby" section reads as "there is no hospital near you",
                which is a frightening thing to imply because a search timed
                out.
              */}
              <div className="animate-fade-in space-y-3" style={{ animationDelay: '400ms' }}>
                <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-xl p-5">
                  <h3 className="text-xs uppercase tracking-[0.14em] text-black/45">Care nearby</h3>

                  {results.approximateLocation && results.hospitals.length > 0 && (
                    <UrduText className="mt-3 text-sm text-black/55">
                      مقامِ وقوع دستیاب نہیں، اس لیے یہ فہرست ایک تخمینی مقام پر مبنی ہے۔
                    </UrduText>
                  )}

                  {results.hospitals.length > 0 ? (
                    <ul className="mt-4 space-y-4">
                      {results.hospitals.map((hospital, i) => (
                        <li
                          key={`${hospital.name}-${i}`}
                          className="border-t border-black/10 pt-4 first:border-0 first:pt-0"
                        >
                          <p className="text-base font-light text-black">{hospital.name}</p>
                          <p className="mt-0.5 text-sm text-black/55">{hospital.address}</p>
                          <a
                            className="mt-2 inline-block text-sm text-black/70 underline underline-offset-4 transition hover:text-black"
                            href={`https://www.google.com/maps/search/?api=1&query=${hospital.lat},${hospital.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in Maps
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : results.hospitalsStatus === 'loading' ? (
                    <div className="mt-4 space-y-3" role="status" aria-label="Searching for nearby care">
                      <div className="h-4 w-3/4 animate-pulse rounded-full bg-black/10" />
                      <div className="h-4 w-1/2 animate-pulse rounded-full bg-black/10" />
                    </div>
                  ) : results.hospitalsStatus === 'ok' ? (
                    <UrduText className="mt-4 text-base text-black/60">
                      آپ کے قریب کوئی ہسپتال نہیں مل سکا۔ قریبی شہر میں تلاش کریں۔
                    </UrduText>
                  ) : (
                    <UrduText className="mt-4 text-base text-black/70">
                      قریبی ہسپتالوں کی تلاش ابھی مکمل نہیں ہو سکی۔ اس کا مطلب یہ نہیں کہ آپ کے قریب
                      کوئی ہسپتال نہیں۔
                    </UrduText>
                  )}
                </div>

                {results.hospitals.length > 0 && (
                  <HospitalMap lat={results.hospitals[0].lat} lng={results.hospitals[0].lng} />
                )}
              </div>

              {/* Clinical Handoff QR (SOAP Note) — arrives with Phase B */}
              {results.soapNoteEnglish && (
                <div className="animate-fade-in" style={{ animationDelay: '600ms' }}>
                  <ClinicalHandoff soapNote={results.soapNoteEnglish} />
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      {emergencyUrdu && (
        <EmergencyAlert messageUrdu={emergencyUrdu} onDismiss={() => setEmergencyUrdu(null)} />
      )}
    </>
  );
}

// -------------------------------------------------------------------------
// Chat bubble
// -------------------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[85%] rounded-2xl px-4 py-3 backdrop-blur-sm border shadow-sm',
          isUser ? 'bg-black/80 border-black/10 text-white' : 'bg-white/10 border-white/20 text-black',
          message.error ? 'bg-red-600/15 border-red-600/30 text-red-900' : '',
        ].join(' ')}
      >
        {message.pending ? (
          <span className="flex items-center gap-1.5 py-1" aria-label="Shifa is thinking">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-black/40 animate-pulse"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
        ) : (
          <UrduText className="text-lg leading-relaxed">{message.content}</UrduText>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Input bar — text and voice, always both, always visible
// -------------------------------------------------------------------------

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  isLoading: boolean;
  isRecording: boolean;
  micSupported: boolean;
  onToggleMic: () => void;
  notice: string | null;
}

const InputBar = forwardRef<HTMLInputElement, InputBarProps>(function InputBar(
  { value, onChange, onSubmit, disabled, isLoading, isRecording, micSupported, onToggleMic, notice },
  ref,
) {
  return (
    <div className="sticky bottom-0 pb-5 pt-4 md:pb-0">
      {notice && (
        <p className="mb-2 text-sm text-red-800" role="status">
          {notice}
        </p>
      )}

      <form
        className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 shadow-xl backdrop-blur-md"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={ref}
          type="text"
          dir="rtl"
          lang="ur"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="اپنی علامات لکھیں یا بولیں..."
          aria-label="Describe your symptoms in Urdu"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-lg text-black placeholder:text-black/40 focus:outline-none disabled:opacity-50"
          style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}
        />

        {/*
          A toggle, not a hold. Green while the mic is live, and pressing it
          again stops without submitting — a patient who thinks better of what
          they were about to say must be able to take it back.
        */}
        <button
          type="button"
          onClick={onToggleMic}
          disabled={disabled || !micSupported}
          aria-pressed={isRecording}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          title={micSupported ? undefined : 'This browser cannot listen — please type'}
          className={[
            'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40',
            isRecording
              ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
              : 'bg-black/10 text-black/70 hover:bg-black/15',
          ].join(' ')}
        >
          {isRecording && (
            <span className="absolute h-11 w-11 animate-ping rounded-full bg-green-500/40" aria-hidden="true" />
          )}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <path d="M12 19v3" />
          </svg>
        </button>

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white transition hover:bg-black/85 disabled:opacity-40"
        >
          {isLoading ? (
            <svg
              className="animate-spin"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
});
