import React, { useState, useRef } from 'react';
import { scanMedicine } from '../lib/api';
import { speakUrdu } from '../lib/speech';

export default function PillScanner() {
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
      if (typeof speakUrdu === 'function') {
         speakUrdu(response.explanation_urdu);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during scanning.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded-lg shadow-md mt-6 border border-gray-200">
      <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">Visual Pill Scanner</h2>

      <div className="flex flex-col items-center gap-4">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 w-full"
        >
          {image ? 'Take Another Photo' : 'Capture Medicine Photo'}
        </button>

        {image && (
          <div className="w-full">
            <img src={image} alt="Medicine to scan" className="w-full h-48 object-cover rounded-lg border border-gray-300" />
            <button
              onClick={handleScan}
              disabled={loading}
              className={`mt-4 w-full py-2 rounded-lg font-medium text-white ${loading ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {loading ? 'Scanning...' : 'Identify Medicine'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg w-full text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 w-full bg-blue-50 p-4 rounded-lg border border-blue-100">
            <h3 className="font-semibold text-gray-700 text-lg mb-2 pb-2 border-b border-blue-200">
              {result.medicine_name}
            </h3>
            <div dir="rtl" className="font-urdu text-right text-gray-900 text-lg leading-relaxed mt-2">
              {result.explanation_urdu}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
