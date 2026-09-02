import PillScanner from '../components/PillScanner';
// import VoiceButton from '../components/VoiceButton';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Sehat Saathi (شفا)</h1>
          <p className="text-gray-500 mt-2">Your Voice-First Healthcare Assistant</p>
        </header>
        
        {/* Voice Triage Component would go here */}
        {/* <VoiceButton /> */}
        
        {/* New Feature 1.1: Visual Pill Scanner */}
        <PillScanner />
      </div>
    </div>
  );
}
