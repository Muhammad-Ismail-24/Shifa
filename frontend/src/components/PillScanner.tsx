/**
 * Visual pill scanner — photograph a strip or a prescription, hear what it is
 * in Urdu.
 *
 * Styled as part of the app rather than as a bolted-on tool: the same hero
 * environment, navigation and glass cards as the dashboard. A patient who
 * arrives here from the menu should not feel they have left Shifa.
 */

import React, { useRef, useState } from 'react';

import { UrduText } from './UrduText';
import { HeroEnvironment } from './landing/HeroEnvironment';
import { MenuDrawer } from './landing/MenuDrawer';
import { ShifaNav } from './landing/ShifaNav';
import { scanMedicine } from '../lib/api';
import { speakUrdu } from '../lib/speech';

const CARD = 'backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl shadow-xl';

export default function PillScanner() {
  const [menuOpen, setMenuOpen] = useState(false);

  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ medicine_name: string; explanation_urdu: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setMimeType(file.type);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleScan = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const response = await scanMedicine({ image_base64: image, mime_type: mimeType });
      setResult(response);
      // TTS will speak the result in Urdu
      speakUrdu(response.explanation_urdu);
    } catch (err: any) {
      setError(err?.message || 'An error occurred during scanning.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <HeroEnvironment />

      {/* The shell clips at viewport height; the content column below scrolls. */}
      <div className="relative z-10 flex h-screen h-[100dvh] flex-col overflow-hidden text-black">
        <ShifaNav menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />

        <main className="flex-1 min-h-0 overflow-y-auto px-5 pb-10 md:px-8">
          <div className="mx-auto w-full max-w-xl space-y-5">
            <header>
              <p className="text-xs uppercase tracking-[0.14em] text-black/45">Visual pill scanner</p>
              <h1 className="mt-2 text-2xl font-light leading-tight tracking-tight sm:text-3xl">
                Photograph a medicine. Hear what it is.
              </h1>
              <UrduText className="mt-3 text-lg text-black/70">
                دوا یا نسخے کی تصویر لیں — شفا اردو میں بتائے گی کہ یہ کیا ہے۔
              </UrduText>
            </header>

            <section className={`${CARD} p-5`}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-full bg-black px-6 py-3 text-base font-light text-white transition hover:bg-black/85"
              >
                {image ? 'Take another photo' : 'Capture medicine photo'}
              </button>

              {image && (
                <div className="mt-5">
                  <img
                    src={image}
                    alt="Medicine to scan"
                    className="h-56 w-full rounded-2xl border border-white/20 object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleScan}
                    disabled={loading}
                    className="mt-4 w-full rounded-full border border-black/25 px-6 py-3 text-base font-light text-black transition hover:bg-black/5 disabled:opacity-40"
                  >
                    {loading ? 'Scanning…' : 'Identify medicine'}
                  </button>
                </div>
              )}
            </section>

            {error && (
              <div className="rounded-2xl border border-red-600/30 bg-red-600/15 p-4 text-sm text-red-900 backdrop-blur-md">
                {error}
              </div>
            )}

            {result && (
              <section className={`${CARD} animate-fade-in p-5`}>
                <h2 className="border-b border-black/10 pb-3 text-lg font-light tracking-tight text-black">
                  {result.medicine_name}
                </h2>
                <UrduText className="mt-3 text-lg text-black/80">{result.explanation_urdu}</UrduText>
              </section>
            )}

            <UrduText className={`${CARD} p-4 text-sm text-black/55`}>
              یہ صرف عمومی معلومات ہے۔ یہ ایپ ڈاکٹر کا متبادل نہیں۔ ڈاکٹر سے ضرور ملیں۔
            </UrduText>
          </div>
        </main>
      </div>

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
