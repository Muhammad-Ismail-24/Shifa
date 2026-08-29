import React, { useState } from 'react';
import { analyze } from '../lib/api';
import { speakUrdu } from '../lib/speech';
import type { ConversationMessage } from '../lib/types';

export default function VoiceButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ConversationMessage[]>([]);

  const handleSpeech = async (urdu_text: string) => {
    setIsLoading(true);
    try {
      const response = await analyze({
        urdu_text,
        latitude: 0,
        longitude: 0,
        history,
      });

      // Clarification Block
      if (response.diseases.length === 0 && response.response_text_urdu) {
        setHistory(prev => [
          ...prev, 
          { role: "user", content: urdu_text }, 
          { role: "model", content: response.response_text_urdu }
        ]);
        
        speakUrdu(response.response_text_urdu);
        setIsLoading(false);
        return;
      }
      
      // Handle normal results...
      
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  };

  return (
    <button 
      disabled={isLoading} 
      onClick={() => handleSpeech("mere pait mein dard ha")}
    >
      {isLoading ? 'Listening...' : 'Speak'}
    </button>
  );
}
