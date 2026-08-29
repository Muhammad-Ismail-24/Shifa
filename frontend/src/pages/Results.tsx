/**
 * Results page — displays the diagnosis, medicines, hospitals, and the Urdu
 * response text. Navigated to from the landing page when diseases.length > 0.
 *
 * Receives the full AnalyzeResponse via react-router location state.
 */

import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { speakUrdu, cancelSpeech } from '../lib/speech';
import type { AnalyzeResponse, Disease, Medicine, Hospital } from '../lib/types';
import HospitalMap from '../components/HospitalMap';

function DiseaseCard({ disease }: { disease: Disease }) {
  const confidenceColor =
    disease.confidence === 'high'
      ? 'text-red-600'
      : disease.confidence === 'medium'
        ? 'text-yellow-600'
        : 'text-green-600';

  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-5 border border-white/20">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-white">{disease.disease}</h3>
        <span className={`text-sm font-medium ${confidenceColor} capitalize`}>
          {disease.confidence}
        </span>
      </div>
      <p className="text-white/70 text-right" dir="rtl" lang="ur">
        {disease.urdu}
      </p>
    </div>
  );
}

function MedicineCard({ medicine }: { medicine: Medicine }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
      <div className="flex items-center justify-between mb-1">
        <span className="text-white font-medium">{medicine.name}</span>
        {medicine.otc && (
          <span className="text-xs bg-green-500/30 text-green-300 px-2 py-0.5 rounded-full">
            OTC
          </span>
        )}
      </div>
      <p className="text-white/60 text-right text-sm" dir="rtl" lang="ur">
        {medicine.name_urdu}
      </p>
      <p className="text-white/50 text-right text-xs mt-1" dir="rtl" lang="ur">
        {medicine.dosage_urdu}
      </p>
    </div>
  );
}

function HospitalList({ hospitals }: { hospitals: Hospital[] }) {
  if (!hospitals.length) return null;
  
  // Use the first hospital's coordinates for the general map at the bottom
  const centerLat = hospitals[0].lat;
  const centerLng = hospitals[0].lng;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/20 pb-2">
        <h2 className="text-2xl font-bold text-white">Nearby Hospitals & Clinics</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hospitals.map((h, i) => (
          <div
            key={i}
            className="bg-white/10 backdrop-blur rounded-xl p-5 border border-white/20 flex flex-col justify-between"
          >
            <div>
              <h3 className="text-white font-medium text-lg mb-1">{h.name}</h3>
              <p className="text-white/70 text-sm">{h.address}</p>
              {h.distance_km != null && (
                <p className="text-white/50 text-xs mt-2">
                  {h.distance_km < 1
                    ? `${Math.round(h.distance_km * 1000)} m away`
                    : `${h.distance_km.toFixed(1)} km away`}
                </p>
              )}
            </div>
            
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors w-full"
            >
              View on Google Maps
            </a>
          </div>
        ))}
      </div>
      
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-4">Map View</h3>
        <HospitalMap lat={centerLat} lng={centerLng} />
      </div>
    </div>
  );
}

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state as AnalyzeResponse | null;

  // Speak the Urdu response on mount.
  useEffect(() => {
    if (data?.response_text_urdu) {
      speakUrdu(data.response_text_urdu);
    }
    return () => cancelSpeech();
  }, [data?.response_text_urdu]);

  // If navigated here directly without state, redirect home.
  if (!data) {
    return (
      <div className="h-screen w-full overflow-y-auto bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 mb-4">No results to display.</p>
          <Link to="/" className="text-blue-400 underline">
            Go back to Shifa
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-y-auto bg-gray-950 text-white p-4 sm:p-8">
      {/* Header */}
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-white/60 hover:text-white transition text-sm flex items-center gap-1"
          >
            ← Back to Shifa
          </button>
          <h1 className="text-2xl font-bold">Shifa Results</h1>
        </div>

        {/* Emergency banner */}
        {data.is_emergency && (
          <div className="bg-red-600/30 border border-red-500 rounded-xl p-4 mb-6 text-center">
            <p className="text-red-300 font-bold text-lg">⚠️ Emergency Detected</p>
            <p className="text-red-200 text-sm mt-1">
              Please go to the nearest hospital immediately.
            </p>
          </div>
        )}

        {/* Urdu response */}
        {data.response_text_urdu && (
          <div className="bg-white/5 rounded-xl p-5 mb-6 border border-white/10">
            <p className="text-white/90 text-right text-lg leading-relaxed" dir="rtl" lang="ur">
              {data.response_text_urdu}
            </p>
          </div>
        )}

        {/* Diseases */}
        {data.diseases.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-3">Possible Conditions</h2>
            <div className="space-y-3">
              {data.diseases.map((d, i) => (
                <DiseaseCard key={i} disease={d} />
              ))}
            </div>
          </div>
        )}

        {/* Medicines */}
        {data.medicines.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-3">Suggested Medicines</h2>
            <div className="space-y-3">
              {data.medicines.map((m, i) => (
                <MedicineCard key={i} medicine={m as Medicine} />
              ))}
            </div>
          </div>
        )}

        {/* Hospitals */}
        {data.hospitals.length > 0 && (
          <div className="mb-6">
            <HospitalList hospitals={data.hospitals as Hospital[]} />
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mt-6 mb-8">
          <p className="text-yellow-200/80 text-right text-sm" dir="rtl" lang="ur">
            {data.disclaimer_urdu}
          </p>
        </div>
      </div>
    </div>
  );
}
